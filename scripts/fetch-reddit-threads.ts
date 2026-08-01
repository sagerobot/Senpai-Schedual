/**
 * Enrich the hourly vibe work list with the raw r/anime material the writer
 * needs:
 * `npx tsx scripts/fetch-reddit-threads.ts --work /tmp/work.json --out /tmp/vibe-work.json`
 *
 * This is the half of the vibe refresh that needs the network, which is exactly
 * the half the Claude routine cannot do — its sandbox has no egress to reddit.
 * So the Action fetches the threads and the routine reads sentiment out of
 * them. Every word that ends up in vibes.json is still written by Claude; this
 * script only carries comments across the wall.
 *
 * Credentials come from REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET (a "script" app
 * at https://www.reddit.com/prefs/apps — client-credentials, no user context,
 * read-only).
 *
 * Exit codes are load-bearing:
 *
 * - **0** — a packet was written (possibly empty).
 * - **1** — bad arguments or an unreadable work list. A bug, not a hiccup.
 * - **2** — cannot proceed: no credentials, or reddit would not issue a token.
 *   The workflow treats this as "skip vibes this run" and exits green.
 *
 * One rule shapes all the error handling: **an item only enters the packet when
 * we have material to judge it, or a confident "there is no thread".** A search
 * that failed, a comments fetch that failed, an item the request budget did not
 * reach — those are dropped from the packet entirely rather than emitted with
 * `thread: null`, because the writer turns `thread: null` into `not_found`, and
 * a `not_found` on a settle pass freezes forever and permanently short-circuits
 * the live vibe check for that episode. A dropped item is simply picked up by
 * the next hourly run.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  packComments,
  pickThread,
  searchQuery,
  trimToBudget,
  MAX_COMMENTS_PER_THREAD,
  PACKET_BUDGET_BYTES,
} from './redditThreads';
import { WORK_LIMIT } from './vibeWork';

const USER_AGENT = 'senpai-schedule/0.1 by sagerobot';
const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const API_BASE = 'https://oauth.reddit.com';

/** Reddit's documented ceiling for an OAuth client is far higher; this is politeness. */
const REQUEST_GAP_MS = 1000;
/** Two requests per item, plus room for a handful of retries. */
const REQUEST_BUDGET = 2 * WORK_LIMIT + 5;
const RETRY_DELAY_MS = 5_000;
const TIMEOUT_MS = 15_000;
const SEARCH_LIMIT = 10;
const COMMENT_LIMIT = 40;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Reddit shapes — tolerant on purpose; a missing count must not cost a thread
// ---------------------------------------------------------------------------

const tokenSchema = z.object({ access_token: z.string().min(1) });

const postSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  permalink: z.string().min(1),
  selftext: z.string().nullish().transform((v) => v ?? ''),
  score: z.coerce.number().nullish().transform((v) => v ?? 0),
  num_comments: z.coerce.number().nullish().transform((v) => v ?? 0),
  created_utc: z.coerce.number().nullish().transform((v) => v ?? 0),
});

type RedditPost = z.infer<typeof postSchema>;

const childrenSchema = z
  .array(z.object({ kind: z.string().nullish(), data: z.unknown() }))
  .nullish()
  .transform((v) => v ?? []);

const listingSchema = z.object({ data: z.object({ children: childrenSchema }) });
const commentsResponseSchema = z.array(listingSchema).min(2);

function parsePosts(payload: unknown): RedditPost[] {
  const listing = listingSchema.safeParse(payload);
  if (!listing.success) return [];
  return listing.data.data.children.flatMap((child) => {
    const post = postSchema.safeParse(child.data);
    return post.success ? [post.data] : [];
  });
}

function parseComments(payload: unknown): { body?: unknown; author?: unknown }[] {
  const parsed = commentsResponseSchema.safeParse(payload);
  if (!parsed.success) return [];
  return parsed.data[1].data.children
    .filter((child) => child.kind === 't1')
    .map((child) => child.data as { body?: unknown; author?: unknown });
}

// ---------------------------------------------------------------------------
// The session. Module-level, like build-season-data.ts's request counter.
// ---------------------------------------------------------------------------

let clientId = '';
let clientSecret = '';
let accessToken: string | null = null;
let requests = 0;
let lastRequestAt = 0;

async function pace(): Promise<void> {
  const wait = REQUEST_GAP_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function requestToken(): Promise<string | null> {
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': USER_AGENT,
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[reddit] token request returned ${response.status} ${response.statusText}`);
      return null;
    }
    const parsed = tokenSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error('[reddit] token response had no access_token');
      return null;
    }
    return parsed.data.access_token;
  } catch (err) {
    console.error(`[reddit] token request failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** One authenticated GET. `null` means "could not read this", never "empty". */
async function get(path: string, allowRetry = true): Promise<unknown | null> {
  await pace();
  requests++;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { authorization: `Bearer ${accessToken ?? ''}`, 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (!allowRetry) {
      console.warn(`[reddit] ${path} failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
    await sleep(RETRY_DELAY_MS);
    return get(path, false);
  }

  if (response.status === 401 && allowRetry) {
    // A token lasts an hour and this run takes minutes, so a 401 is reddit
    // rotating under us rather than a bad secret. Re-auth once, then retry once.
    accessToken = await requestToken();
    if (accessToken === null) return null;
    return get(path, false);
  }

  if (allowRetry && (response.status === 403 || response.status === 429 || response.status >= 500)) {
    await sleep(RETRY_DELAY_MS);
    return get(path, false);
  }

  if (!response.ok) {
    console.warn(`[reddit] ${path} returned ${response.status} ${response.statusText}`);
    return null;
  }

  try {
    return await response.json();
  } catch {
    console.warn(`[reddit] ${path} returned a body that is not JSON`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Work list
// ---------------------------------------------------------------------------

/**
 * Only the fields this script needs. Everything else on a work item is carried
 * through to the packet untouched, so `vibes:prepare` can add fields without
 * this script having to know about them.
 */
const workItemSchema = z.object({
  showId: z.number().int().positive(),
  episode: z.number().int().positive(),
  title: z.string().min(1),
});

interface Args {
  work: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  let work: string | null = null;
  let out: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--work' || arg === '--out') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a path`);
      if (arg === '--work') work = value;
      else out = value;
      i++;
      continue;
    }
    throw new Error(`Unknown argument "${arg}". Usage: fetch-reddit-threads --work path --out path`);
  }

  if (work === null || out === null) throw new Error('Usage: fetch-reddit-threads --work path --out path');
  return { work, out };
}

interface PacketItem extends Record<string, unknown> {
  thread: { title: string; url: string; score: number; num_comments: number; created_utc: number } | null;
  comments: string[];
}

async function main(): Promise<void> {
  const started = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const outPath = resolve(args.out);

  const raw: unknown = JSON.parse(await readFile(resolve(args.work), 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`${args.work} must contain a JSON array of work items`);

  const work = raw.flatMap((item) => {
    const parsed = workItemSchema.safeParse(item);
    if (!parsed.success) {
      console.warn('[reddit] skipping a work item that is missing showId/episode/title');
      return [];
    }
    return [{ raw: item as Record<string, unknown>, target: parsed.data }];
  });

  if (work.length === 0) {
    await writeFile(outPath, '[]\n', 'utf8');
    console.log('[reddit] no work items — wrote an empty packet.');
    return;
  }

  clientId = process.env.REDDIT_CLIENT_ID ?? '';
  clientSecret = process.env.REDDIT_CLIENT_SECRET ?? '';
  if (clientId === '' || clientSecret === '') {
    console.error(
      '[reddit] REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are not set — cannot search reddit. ' +
        'Create a "script" app at https://www.reddit.com/prefs/apps and add both as repository secrets.',
    );
    process.exitCode = 2;
    return;
  }

  accessToken = await requestToken();
  if (accessToken === null) {
    console.error('[reddit] could not obtain an access token — skipping this run.');
    process.exitCode = 2;
    return;
  }

  const items: PacketItem[] = [];
  let found = 0;
  let notFound = 0;
  let unreadable = 0;
  let unreached = 0;

  for (const { raw: original, target } of work.slice(0, WORK_LIMIT)) {
    if (requests + 2 > REQUEST_BUDGET) {
      unreached++;
      continue;
    }

    const params = new URLSearchParams({
      q: searchQuery(target),
      restrict_sr: '1',
      sort: 'relevance',
      limit: String(SEARCH_LIMIT),
      raw_json: '1',
    });
    const results = await get(`/r/anime/search?${params}`);
    if (results === null) {
      unreadable++;
      continue;
    }

    const picked = pickThread(parsePosts(results), target);
    if (picked === null) {
      // Searched, and r/anime genuinely has no thread for this episode. That is
      // a result, and the only kind of null this packet is allowed to carry.
      items.push({ ...original, thread: null, comments: [] });
      notFound++;
      continue;
    }

    const thread = await get(`/comments/${picked.id}?limit=${COMMENT_LIMIT}&depth=1&sort=top&raw_json=1`);
    if (thread === null) {
      unreadable++;
      continue;
    }

    items.push({
      ...original,
      thread: {
        title: picked.title,
        url: `https://www.reddit.com${picked.permalink}`,
        score: picked.score,
        num_comments: picked.num_comments,
        created_utc: picked.created_utc,
      },
      comments: packComments(parseComments(thread), MAX_COMMENTS_PER_THREAD),
    });
    found++;
  }

  const trimmed = trimToBudget(items, PACKET_BUDGET_BYTES);
  const json = `${JSON.stringify(trimmed.items, null, 2)}\n`;
  await writeFile(outPath, json, 'utf8');

  console.log('');
  console.log(`  packet     ${outPath} (${(json.length / 1024).toFixed(0)} KB)`);
  console.log(`  work       ${work.length} item(s), ${Math.min(work.length, WORK_LIMIT)} attempted`);
  console.log(`  threads    ${found} found, ${notFound} genuinely absent`);
  if (unreadable > 0) console.log(`  dropped    ${unreadable} item(s) reddit would not answer for`);
  if (unreached > 0) console.log(`  deferred   ${unreached} item(s) past the ${REQUEST_BUDGET}-request budget`);
  if (trimmed.dropped > 0) console.log(`  trimmed    ${trimmed.dropped} comment(s) to fit the packet budget`);
  console.log(`  requests   ${requests}`);
  console.log(`  duration   ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((err: unknown) => {
  console.error(`[reddit] fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
