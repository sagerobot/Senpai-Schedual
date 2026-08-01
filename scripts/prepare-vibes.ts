/**
 * Derive the hourly vibe work list:
 * `npm run vibes:prepare -- --vibes path/to/vibes.json --out /tmp/vibe-work.json [--now iso]`
 *
 * Asks AniList what aired in the last 48 hours, cross-references the vibes file,
 * and writes the episodes whose r/anime sentiment the scheduled agent should
 * read this run (see docs/vibes-refresh.md). It writes nothing else: this script
 * never touches vibes.json, and `scripts/merge-vibes.ts` never talks to AniList.
 *
 * Runs in plain Node (>= 20) via tsx, and — like build-season-data.ts — imports
 * only the environment-free parts of the app, so AniList requests go through the
 * same module-level rate limiter the browser uses.
 *
 * **An empty work list is the expected outcome most hours.** The routine reads
 * `[]` and exits without committing, which is why this exits 0 for it.
 *
 * Exit codes are load-bearing: non-zero means "do not proceed with this run".
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { anilistRequest } from '../src/api/anilist/client';
import { emptyVibesFile, parseVibesFile, type VibesFile } from '../src/lib/vibesFile';
import { classifyVibeWork, SETTLE_WINDOW_MS, WORK_LIMIT, type AiredEpisode } from './vibeWork';

const PER_PAGE = 50;
/** ~300 schedules covers a 48h window with room to spare; the cap is a bound, not a target. */
const MAX_PAGES = 6;

const AiringPageSchema = z.object({
  Page: z.object({
    pageInfo: z.object({ hasNextPage: z.boolean() }).nullish(),
    airingSchedules: z
      .array(
        z.object({
          episode: z.number(),
          airingAt: z.number(),
          media: z
            .object({
              id: z.number(),
              title: z.object({
                userPreferred: z.string().nullable(),
                romaji: z.string().nullable(),
                english: z.string().nullable(),
              }),
              startDate: z.object({ year: z.number().nullable() }).nullable(),
              format: z.string().nullable(),
              isAdult: z.boolean().nullable(),
            })
            .nullable(),
        }),
      )
      .nullable()
      .transform((v) => v ?? []),
  }),
});

const AIRING_QUERY = `
  query ($from: Int, $to: Int, $page: Int) {
    Page(page: $page, perPage: ${PER_PAGE}) {
      pageInfo { hasNextPage }
      airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
        episode
        airingAt
        media {
          id
          title { userPreferred romaji english }
          startDate { year }
          format
          isAdult
        }
      }
    }
  }
`;

let requestCount = 0;

/**
 * Everything AniList says aired in the window, deduplicated by (show, episode).
 *
 * Sorted ascending by air time on purpose: if the page cap truncates, it drops
 * the *newest* schedules, which the next hourly run picks up anyway. Truncating
 * the oldest would drop episodes about to leave the 48h window forever.
 */
async function fetchAired(fromSeconds: number, toSeconds: number): Promise<AiredEpisode[]> {
  const found = new Map<string, AiredEpisode>();
  let skippedAdult = 0;
  let skippedFormat = 0;
  let skippedUnknown = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    requestCount++;
    const data = await anilistRequest(AIRING_QUERY, { from: fromSeconds, to: toSeconds, page }, AiringPageSchema);

    for (const schedule of data.Page.airingSchedules) {
      const media = schedule.media;
      if (media === null) {
        skippedUnknown++;
        continue;
      }
      if (media.isAdult === true) {
        skippedAdult++;
        continue;
      }
      if (media.format === 'MUSIC') {
        skippedFormat++;
        continue;
      }
      const title = media.title.userPreferred ?? media.title.romaji ?? media.title.english;
      if (title === null) {
        skippedUnknown++;
        continue;
      }
      found.set(`${media.id}:${schedule.episode}`, {
        showId: media.id,
        episode: schedule.episode,
        airedAt: schedule.airingAt,
        title,
      });
    }

    if (data.Page.pageInfo?.hasNextPage !== true) break;
    if (page === MAX_PAGES) {
      console.warn(`[vibes] airing schedule pagination capped at ${MAX_PAGES} pages; the newest entries may be missing.`);
    }
  }

  console.log(
    `[vibes] ${found.size} episode(s) aired in the window (${requestCount} request(s); skipped ${skippedAdult} adult, ${skippedFormat} music, ${skippedUnknown} unresolvable)`,
  );
  return [...found.values()];
}

async function loadVibes(path: string): Promise<VibesFile> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    console.warn(`[vibes] no vibes file at ${path}; treating every aired episode as new.`);
    return emptyVibesFile();
  }

  // An unreadable existing file is fatal, unlike a missing one: carrying on
  // would classify thousands of remembered episodes as never-read and re-pay
  // for all of them.
  const parsed = parseVibesFile(JSON.parse(raw));
  if (parsed === null) throw new Error(`vibes file at ${path} is not a valid vibes file`);
  return parsed;
}

interface Args {
  vibes: string;
  out: string;
  now: number;
}

function parseArgs(argv: string[]): Args {
  let vibes: string | null = null;
  let out: string | null = null;
  let now = Date.now();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--vibes' || arg === '--out' || arg === '--now') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      if (arg === '--vibes') vibes = value;
      else if (arg === '--out') out = value;
      else {
        const parsed = Date.parse(value);
        if (Number.isNaN(parsed)) throw new Error('--now must be an ISO timestamp');
        now = parsed;
      }
      i++;
      continue;
    }
    throw new Error(`Unknown argument "${arg}". Usage: vibes:prepare -- --vibes path --out path [--now iso]`);
  }

  if (vibes === null || out === null) {
    throw new Error('Usage: vibes:prepare -- --vibes path --out path [--now iso]');
  }
  return { vibes, out, now };
}

async function main(): Promise<void> {
  const started = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const outPath = resolve(args.out);

  const stored = await loadVibes(resolve(args.vibes));
  console.log(`[vibes] ${Object.keys(stored.entries).length} entries remembered`);

  const toSeconds = Math.floor(args.now / 1000);
  const fromSeconds = Math.floor((args.now - SETTLE_WINDOW_MS) / 1000);
  const aired = await fetchAired(fromSeconds, toSeconds);

  const work = classifyVibeWork(stored.entries, aired, args.now);

  await writeFile(outPath, `${JSON.stringify(work.items, null, 2)}\n`, 'utf8');

  if (work.dropped > 0) {
    console.warn(
      `[vibes] ${work.dropped} eligible episode(s) dropped by the per-run cap of ${WORK_LIMIT}; the next run picks them up.`,
    );
  }

  console.log('');
  console.log(`  work list    ${outPath}`);
  console.log(`  window       ${new Date(fromSeconds * 1000).toISOString()} .. ${new Date(toSeconds * 1000).toISOString()}`);
  console.log(`  aired        ${aired.length}`);
  console.log(`  eligible     ${work.eligible}`);
  console.log(
    `  work items   ${work.items.length} (${work.counts.first} first, ${work.counts.update} update, ${work.counts.settle} settle)`,
  );
  console.log(`  requests     ${requestCount}`);
  console.log(`  duration     ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((err: unknown) => {
  console.error(`[vibes] prepare failed: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exitCode = 1;
});
