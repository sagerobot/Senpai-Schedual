import { z } from 'zod';

/**
 * The vibes file: every r/anime episode-sentiment reading this app has ever
 * paid for, keyed `"<showId>:<episode>"`. Written by the hourly scheduled
 * Claude routine (`scripts/merge-vibes.ts`), committed to the `data` branch,
 * served by `GET /api/vibes`, consumed by `src/queries/vibes.ts` and by
 * `POST /api/community-vibe` as a pre-Gemini short circuit.
 *
 * This module is the single definition all three sides share, so — like
 * `seasonBundle.ts` — it is deliberately free of Node, browser, and React
 * imports.
 *
 * The lifecycle of one entry, and why `settled` exists:
 *
 * - An episode that aired **under 24h ago** is refreshed hourly. Release-day
 *   viewers want a read *now*, and accept that an hour-old thread is partial —
 *   which is what `asOf` lets the UI say out loud.
 * - At **24-48h** one final "settle" pass runs and sets `settled: true`.
 * - A settled entry is **frozen forever**. Sentiment on a two-day-old thread
 *   does not move, and re-reading it costs a grounded search for nothing.
 *
 * `status: "not_found"` is a fact worth persisting for exactly the same reason.
 * r/anime episode discussion threads barely exist before ~2013, so for a large
 * part of the catalogue "there is no thread" is permanently true. A settled
 * not-found is never searched again.
 */

export const VIBES_FILE_VERSION = 1;

/** How long an unsettled reading is served as-is before a refresh is due. */
export const VIBE_FRESH_WINDOW_MS = 2 * 60 * 60 * 1000;

/** The map key for one episode's vibe. Built here and nowhere else. */
export function vibeKey(showId: number, episode: number): string {
  return `${showId}:${episode}`;
}

const REDDIT_HOSTS = new Set(['reddit.com', 'www.reddit.com']);

/** Is this an absolute URL on reddit.com? Stored vibes may link nowhere else. */
export function isRedditUrl(url: string): boolean {
  try {
    return REDDIT_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** The r/anime search fallback used whenever a thread URL is missing or off-host. */
export function redditSearchUrl(title: string, episode: number): string {
  return `https://www.reddit.com/r/anime/search?q=${encodeURIComponent(`${title} episode ${episode}`)}`;
}

// ---------------------------------------------------------------------------
// Entry schema — the clamping conventions mirror server/schemas.ts
// ---------------------------------------------------------------------------

const clampedBullets = z
  .array(z.string().transform((s) => s.slice(0, 120)))
  .catch([])
  .transform((items) => items.slice(0, 5));

const isoTimestamp = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: 'not a parseable date',
});

const commonFields = {
  showId: z.number().int().positive(),
  episode: z.number().int().min(1).max(2000),
  /** Unix seconds. 0 when the air time is genuinely unknown (harvested entries). */
  airedAt: z.number().int().nonnegative(),
  /** ISO 8601 — when this sentiment was *read*, not when the episode aired. */
  asOf: isoTimestamp,
  /** Frozen: never refreshed, never overwritten. */
  settled: z.boolean(),
};

export const vibeFoundSchema = z.object({
  ...commonFields,
  status: z.literal('found'),
  summary: z.string().min(1).transform((s) => s.slice(0, 600)),
  goods: clampedBullets,
  bads: clampedBullets,
  indicator: z.enum(['positive', 'mixed', 'negative']).catch('mixed'),
  upvotes: z.coerce.number().int().nonnegative().catch(0),
  comments: z.coerce.number().int().nonnegative().catch(0),
  url: z.string().refine(isRedditUrl, { message: 'url must be on reddit.com' }),
});

export const vibeNotFoundSchema = z.object({
  ...commonFields,
  status: z.literal('not_found'),
});

export const vibeEntrySchema = z.discriminatedUnion('status', [vibeFoundSchema, vibeNotFoundSchema]);

export type VibeFoundEntry = z.infer<typeof vibeFoundSchema>;
export type VibeNotFoundEntry = z.infer<typeof vibeNotFoundSchema>;
export type VibeEntry = z.infer<typeof vibeEntrySchema>;

export interface VibesFile {
  version: number;
  entries: Record<string, VibeEntry>;
}

/**
 * The whole file.
 *
 * A malformed entry drops out rather than failing the parse — same rule as the
 * season bundle's shows. One bad row must not cost every visitor every other
 * vibe in the file, and the merge script validates each entry before it is ever
 * written, so a drop here means the file was edited by something else.
 *
 * Entries whose key disagrees with their own `showId:episode` are dropped too:
 * the key is what every lookup goes through, so a mismatch would surface the
 * wrong episode's sentiment.
 */
export const vibesFileSchema = z.object({
  version: z.number(),
  entries: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((raw): Record<string, VibeEntry> => {
      const out: Record<string, VibeEntry> = {};
      for (const [key, value] of Object.entries(raw ?? {})) {
        const parsed = vibeEntrySchema.safeParse(value);
        if (!parsed.success) continue;
        if (key !== vibeKey(parsed.data.showId, parsed.data.episode)) continue;
        out[key] = parsed.data;
      }
      return out;
    }),
});

/** Parse an unknown payload into a vibes file; `null` when it is not one. */
export function parseVibesFile(value: unknown): VibesFile | null {
  const parsed = vibesFileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** An empty file, for a first run or an unreadable one. */
export function emptyVibesFile(): VibesFile {
  return { version: VIBES_FILE_VERSION, entries: {} };
}

/**
 * May this reading be served without a fresh search? Settled entries always
 * can; an unsettled one only while it is inside the refresh window, because
 * the hourly routine is about to replace it anyway.
 */
export function isVibeServable(entry: VibeEntry, now = Date.now(), windowMs = VIBE_FRESH_WINDOW_MS): boolean {
  if (entry.settled) return true;
  const asOf = Date.parse(entry.asOf);
  if (Number.isNaN(asOf)) return false;
  return now - asOf < windowMs;
}

/** The seven fields the `/api/community-vibe` payload carries. */
export function vibePayload(entry: VibeFoundEntry): {
  summary: string;
  goods: string[];
  bads: string[];
  indicator: 'positive' | 'mixed' | 'negative';
  upvotes: number;
  comments: number;
  url: string;
} {
  const { summary, goods, bads, indicator, upvotes, comments, url } = entry;
  return { summary, goods, bads, indicator, upvotes, comments, url };
}
