import { z } from 'zod';
import { MediaSchema, type AnimeMedia } from '../api/anilist/schemas';
import type { SeriesGraph } from '../series/labeling';

/**
 * The season bundle: one precomputed file holding everything a cold visitor
 * needs to paint the schedule — the shows, their franchise graphs, and their AI
 * summaries. Built by `scripts/build-season-data.ts`, committed to the `data`
 * branch, served by `GET /api/season`, consumed by `src/queries/seasonBundle.ts`.
 *
 * This module is the single definition all three sides share, so it is
 * deliberately free of Node, browser, and React imports.
 *
 * Two schemas, on purpose:
 *
 * - `seasonBundleEnvelopeSchema` is what the **server** checks: shape only, no
 *   per-media validation. The server is a pass-through cache; re-validating 700
 *   media records on every refresh buys nothing and would reject a bundle built
 *   by a newer script the moment it adds a field.
 * - `seasonBundleSchema` is what the **client and the build script** check: full
 *   media validation, because the client feeds the result straight into the
 *   query cache, where the rest of the app assumes AniList's shape holds.
 */

export const SEASON_BUNDLE_VERSION = 1;

/** A bundle older than this is ignored by the client in favour of a live fetch. */
export const BUNDLE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface SeasonBundle {
  version: number;
  /** ISO 8601. The client's freshness gate and the runbook's sanity gate read this. */
  generatedAt: string;
  shows: AnimeMedia[];
  /** Keyed by `seriesId` (stringified — JSON object keys are strings). */
  seriesGraphs: Record<string, SeriesGraph>;
  /** Every member showId -> its seriesId. The reverse map, precomputed. */
  memberIndex: Record<string, number>;
  /** showId -> spoiler-free AI summary. */
  summaries: Record<string, string>;
}

const fuzzyDateSchema = z.object({
  year: z.number().nullable(),
  month: z.number().nullable(),
  day: z.number().nullable(),
});

const seriesEntrySchema = z.object({
  id: z.number(),
  format: z.string(),
  startDate: fuzzyDateSchema.nullable(),
  seasonLabel: z.string(),
  title: z.string(),
  isAttachment: z.boolean(),
  episodes: z.number().optional(),
});

export const seriesGraphSchema = z.object({
  seriesId: z.number(),
  title: z.string(),
  entries: z.array(seriesEntrySchema),
});

/**
 * The graph shape is declared twice — as an interface in `series/labeling.ts`
 * and as a schema here. This is the only conversion site, and its return type
 * is what fails the build if the two ever drift.
 */
export function parseSeriesGraph(value: unknown): SeriesGraph | null {
  const parsed = seriesGraphSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: 'generatedAt is not a parseable date',
});

/**
 * Structural check only — used server-side, where the bundle is relayed rather
 * than consumed. `shows` is counted, not inspected.
 */
export const seasonBundleEnvelopeSchema = z.object({
  version: z.number(),
  generatedAt: isoDate,
  shows: z.array(z.unknown()),
  seriesGraphs: z.record(z.string(), z.unknown()).nullish(),
  memberIndex: z.record(z.string(), z.number()).nullish(),
  summaries: z.record(z.string(), z.string()).nullish(),
});

/**
 * Full validation — used by the client (whose query cache the shows enter) and
 * by the build script against its own output before writing.
 *
 * A media record that fails validation drops out rather than failing the whole
 * bundle: one malformed show should not cost the visitor the other 699.
 */
export const seasonBundleSchema = z.object({
  version: z.number(),
  generatedAt: isoDate,
  shows: z.array(z.unknown()).transform((raw): AnimeMedia[] =>
    raw.flatMap((item) => {
      const parsed = MediaSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
  seriesGraphs: z
    .record(z.string(), seriesGraphSchema)
    .nullish()
    .transform((v): Record<string, SeriesGraph> => v ?? {}),
  memberIndex: z
    .record(z.string(), z.number())
    .nullish()
    .transform((v) => v ?? {}),
  summaries: z
    .record(z.string(), z.string())
    .nullish()
    .transform((v) => v ?? {}),
});

/** Parse an unknown payload into a bundle; `null` when it is not one. */
export function parseSeasonBundle(value: unknown): SeasonBundle | null {
  const parsed = seasonBundleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Is this bundle recent enough to serve instead of a live AniList fetch?
 *
 * A stale bundle is not an error — it means the scheduled refresh has not run,
 * and the client silently takes the live path it would have taken anyway.
 * Unparseable timestamps are stale. A timestamp in the future is treated as
 * fresh: that is clock skew between the builder and the visitor, not staleness.
 */
export function isBundleFresh(generatedAt: string, now = Date.now(), maxAgeMs = BUNDLE_MAX_AGE_MS): boolean {
  const generated = Date.parse(generatedAt);
  if (Number.isNaN(generated)) return false;
  return now - generated < maxAgeMs;
}
