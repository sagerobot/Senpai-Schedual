/**
 * Build the current-season vibe backfill work list (one-shot, run by hand).
 *
 * Asks AniList for everything that aired between the season start and 48h ago
 * (the fresh sweep owns anything younger), keeps episodes of shows a Western
 * viewer can actually watch (any external link matching the app's
 * STREAMING_SITES list), and drops keys that vibes.json or a queued backfill
 * packet already covers. Output is worker.py's work-list shape with
 * kind "settle" — these threads are weeks old and their sentiment is final.
 *
 *   npx tsx tools/codex-vibes/season_gap.ts -- \
 *     --vibes <vibes.json> --queued <queued-keys.json> --out <work.json>
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { anilistRequest } from '../../src/api/anilist/client';
import { STREAMING_SITES } from '../../src/lib/watchLinks';
import { parseVibesFile } from '../../src/lib/vibesFile';

const PER_PAGE = 50;
const MAX_PAGES = 120;
/** A week before the nominal July 1 season start catches early premieres. */
const SEASON_START = Date.parse('2026-06-21T00:00:00Z');
const FRESH_WINDOW_MS = 48 * 60 * 60 * 1000;

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
              format: z.string().nullable(),
              isAdult: z.boolean().nullable(),
              externalLinks: z
                .array(z.object({ site: z.string().nullish() }).nullable())
                .nullable(),
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
          format
          isAdult
          externalLinks { site }
        }
      }
    }
  }
`;

function hasWesternLink(links: ({ site?: string | null } | null)[] | null): boolean {
  if (!links) return false;
  return links.some(
    (l) => l?.site != null && STREAMING_SITES.some((s) => l.site!.toLowerCase().includes(s.toLowerCase())),
  );
}

function parseArgs(argv: string[]): { vibes: string; queued: string; out: string; index?: string } {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--vibes' || arg === '--queued' || arg === '--out' || arg === '--index') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a path`);
      args[arg.slice(2)] = value;
      i++;
      continue;
    }
    if (arg === '--') continue;
    throw new Error(`Unknown argument "${arg}"`);
  }
  if (!args.vibes || !args.queued || !args.out) {
    throw new Error('Usage: season_gap.ts -- --vibes path --queued path --out path [--index thread-index.json]');
  }
  return { vibes: args.vibes, queued: args.queued, out: args.out, index: args.index };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const vibes = parseVibesFile(JSON.parse(await readFile(resolve(args.vibes), 'utf8')));
  if (vibes === null) throw new Error('invalid vibes file');
  const covered = new Set(Object.keys(vibes.entries));
  const queued: string[] = JSON.parse(await readFile(resolve(args.queued), 'utf8'));
  for (const k of queued) covered.add(k);
  console.log(`[gap] ${covered.size} keys already covered (vibes + queued packets)`);

  // With a thread index, probed-unthreaded shows never even enter the work
  // list. threaded=false here is a probe's verdict, taken at face value — the
  // backfill target is weeks-old threads, which do not appear later.
  let unthreadedShows = new Set<string>();
  if (args.index !== undefined) {
    const idx = JSON.parse(await readFile(resolve(args.index), 'utf8')) as {
      shows?: Record<string, { threaded?: boolean }>;
    };
    unthreadedShows = new Set(
      Object.entries(idx.shows ?? {})
        .filter(([, e]) => e.threaded === false)
        .map(([id]) => id),
    );
    console.log(`[gap] index: ${unthreadedShows.size} unthreaded shows will be skipped`);
  }

  const from = Math.floor(SEASON_START / 1000);
  const to = Math.floor((Date.now() - FRESH_WINDOW_MS) / 1000);

  interface Item {
    key: string;
    showId: number;
    episode: number;
    title: string;
    english: string | null;
    airedAt: number;
    kind: 'settle';
  }
  const items = new Map<string, Item>();
  let scanned = 0;
  let skippedNoWest = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await anilistRequest(AIRING_QUERY, { from, to, page }, AiringPageSchema);
    for (const s of data.Page.airingSchedules) {
      scanned++;
      const m = s.media;
      if (m === null || m.isAdult === true || m.format === 'MUSIC') continue;
      const title = m.title.userPreferred ?? m.title.romaji ?? m.title.english;
      if (title === null) continue;
      if (!hasWesternLink(m.externalLinks)) {
        skippedNoWest++;
        continue;
      }
      if (unthreadedShows.has(String(m.id))) continue;
      const key = `${m.id}:${s.episode}`;
      if (covered.has(key)) continue;
      items.set(key, {
        key,
        showId: m.id,
        episode: s.episode,
        title,
        english: m.title.english,
        airedAt: s.airingAt,
        kind: 'settle',
      });
    }
    if (data.Page.pageInfo?.hasNextPage !== true) break;
    if (page === MAX_PAGES) console.warn(`[gap] capped at ${MAX_PAGES} pages — window not fully scanned`);
    if (page % 10 === 0) console.log(`[gap] page ${page}, ${items.size} missing so far`);
  }

  const list = [...items.values()].sort((a, b) => a.airedAt - b.airedAt);
  await writeFile(resolve(args.out), `${JSON.stringify(list, null, 1)}\n`, 'utf8');

  const byShow = new Map<string, number>();
  for (const i of list) {
    const name = i.english ?? i.title;
    byShow.set(name, (byShow.get(name) ?? 0) + 1);
  }
  console.log('');
  console.log(`  window     ${new Date(from * 1000).toISOString()} .. ${new Date(to * 1000).toISOString()}`);
  console.log(`  scanned    ${scanned} schedule entries`);
  console.log(`  no-west    ${skippedNoWest} skipped`);
  console.log(`  missing    ${list.length} episodes across ${byShow.size} shows`);
  const top = [...byShow.entries()].sort((a, b) => b[1] - a[1]);
  for (const [name, n] of top) console.log(`    ${String(n).padStart(3)}  ${name}`);
}

main().catch((err: unknown) => {
  console.error(`[gap] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
