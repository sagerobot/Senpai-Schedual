/**
 * The pure half of the harvest: turning the live server's AI cache into inputs
 * for the two merge scripts.
 *
 * `scripts/harvest.ts` is the CLI around this — it fetches nothing itself, it
 * only reads the file the workflow curled from `GET /api/cache-export` and the
 * season bundle it should be filtered against.
 *
 * Why this exists at all: the server's cache is in memory and dies with the
 * process, so every summary and every vibe check a real visitor's request paid
 * for is lost on the next deploy. Folding them into the `data` branch is what
 * makes "paid for once, ever" true.
 *
 * No Node imports, no side effects, no clock reads.
 */

import { z } from 'zod';

/** One row of `GET /api/cache-export` (see server/cache.ts). */
export interface ExportedEntry {
  key: string;
  value: unknown;
  /** ISO 8601 — when the server cached it. */
  storedAt?: unknown;
}

/**
 * A harvested reading, shaped for `mergeVibeEntries` (scripts/vibeWork.ts).
 *
 * `kind: 'settle'` on every one of them is the point: a harvested vibe is an
 * episode a visitor looked up by hand, long after the hourly window closed, so
 * it is as final as sentiment gets. The export deliberately omits fallback
 * entries, so a "no thread found" for a just-aired episode can never arrive
 * here and be frozen as permanently thread-less.
 */
export interface HarvestedVibe {
  showId: number;
  episode: number;
  status: 'found';
  kind: 'settle';
  /** Omitted when the export carried no usable timestamp; the merge fills it. */
  asOf?: string;
  summary: string;
  goods: string[];
  bads: string[];
  indicator: 'positive' | 'mixed' | 'negative';
  upvotes: number;
  comments: number;
  url: string;
  /** The bundle's title, when the show is in it — the merge repairs a bad url from it. */
  title?: string;
}

export interface HarvestStats {
  entries: number;
  summaryKeys: number;
  summariesKept: number;
  /** Skipped: the show is not in this season's bundle. */
  summariesOffSeason: number;
  /** Skipped: the bundle already has a summary for that show. */
  summariesAlreadyHeld: number;
  vibeKeys: number;
  vibesKept: number;
  /** Rows whose key or value did not survive parsing. */
  malformed: number;
  /** Namespaces that are not harvestable (`rec:`, `fallback:`). */
  otherKeys: number;
}

export interface HarvestResult {
  /** `{ "<showId>": "summary" }` — the shape `data:merge` reads. */
  summaries: Record<string, string>;
  vibes: HarvestedVibe[];
  stats: HarvestStats;
}

export interface SeasonFacts {
  /** Every show id in the bundle. */
  showIds: ReadonlySet<number>;
  /** The subset that already carries a summary. */
  summarized: ReadonlySet<number>;
  /** showId -> display title. */
  titles: ReadonlyMap<number, string>;
}

const SUMMARY_KEY = /^summary:(\d+)$/;
const VIBE_KEY = /^vibe:(\d+):(\d+)$/;

/**
 * Mirrors `vibeOutputSchema` in server/schemas.ts — the same clamping that
 * produced the cached value, applied again because nothing guarantees the
 * response came from a server running this revision.
 */
const cachedVibeSchema = z.object({
  summary: z.string().min(1),
  goods: z.array(z.string()).catch([]),
  bads: z.array(z.string()).catch([]),
  indicator: z.enum(['positive', 'mixed', 'negative']).catch('mixed'),
  upvotes: z.coerce.number().int().nonnegative().catch(0),
  comments: z.coerce.number().int().nonnegative().catch(0),
  url: z.string().catch(''),
});

function isoOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

/**
 * Split the export into the two merge inputs.
 *
 * Summaries are filtered against the season: the bundle prunes summaries for
 * shows that have left, so harvesting one back in would be re-adding a row the
 * build just decided to drop. Vibes are **not** filtered — an old show's vibe
 * check is exactly the kind of thing a visitor pays for and nothing else would
 * ever generate.
 */
export function harvestCacheExport(entries: ExportedEntry[], season: SeasonFacts): HarvestResult {
  const summaries: Record<string, string> = {};
  const vibes: HarvestedVibe[] = [];
  const stats: HarvestStats = {
    entries: entries.length,
    summaryKeys: 0,
    summariesKept: 0,
    summariesOffSeason: 0,
    summariesAlreadyHeld: 0,
    vibeKeys: 0,
    vibesKept: 0,
    malformed: 0,
    otherKeys: 0,
  };

  for (const entry of entries) {
    const key = typeof entry?.key === 'string' ? entry.key : '';

    const summaryMatch = SUMMARY_KEY.exec(key);
    if (summaryMatch !== null) {
      stats.summaryKeys++;
      const showId = Number(summaryMatch[1]);
      const summary = typeof entry.value === 'string' ? entry.value.trim() : '';
      if (summary === '') {
        stats.malformed++;
      } else if (!season.showIds.has(showId)) {
        stats.summariesOffSeason++;
      } else if (season.summarized.has(showId)) {
        stats.summariesAlreadyHeld++;
      } else {
        summaries[String(showId)] = summary;
        stats.summariesKept++;
      }
      continue;
    }

    const vibeMatch = VIBE_KEY.exec(key);
    if (vibeMatch !== null) {
      stats.vibeKeys++;
      const showId = Number(vibeMatch[1]);
      const episode = Number(vibeMatch[2]);
      const parsed = cachedVibeSchema.safeParse(entry.value);
      if (!parsed.success) {
        stats.malformed++;
        continue;
      }
      const asOf = isoOrUndefined(entry.storedAt);
      const title = season.titles.get(showId);
      vibes.push({
        showId,
        episode,
        status: 'found',
        kind: 'settle',
        ...(asOf === undefined ? {} : { asOf }),
        ...parsed.data,
        ...(title === undefined ? {} : { title }),
      });
      stats.vibesKept++;
      continue;
    }

    if (key === '') stats.malformed++;
    else stats.otherKeys++;
  }

  return { summaries, vibes, stats };
}
