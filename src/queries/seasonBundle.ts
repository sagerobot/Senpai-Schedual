import { z } from 'zod';
import type { AnimeMedia } from '../api/anilist/schemas';
import { isBundleFresh, parseSeasonBundle, type SeasonBundle } from '../lib/seasonBundle';
import type { SeriesGraph } from '../series/labeling';
import { useUserData, type SeriesOverrides } from '../stores/userData';
import { queryClient } from './client';
import { queryKeys } from './keys';

/**
 * Bundle-first schedule loading.
 *
 * `GET /api/season` returns one precomputed file — the season's shows, their
 * franchise graphs, and their AI summaries — so a cold visitor pays one
 * same-origin request instead of ~25 rate-limited AniList round-trips.
 *
 * The governing rule is that **a missing, stale, or malformed bundle must never
 * make the app worse than it was without one.** Every failure path here returns
 * `null`, and `null` means "take the live path you would have taken anyway".
 * That is why nothing in this module throws and why the fetch carries its own
 * timeout: a server still loading the bundle upstream must not hold the
 * schedule hostage.
 */

const SEASON_ENDPOINT = '/api/season';

/**
 * Shorter than the server's own 15s upstream timeout, deliberately. If the
 * server is cold-loading the bundle, this visitor should start the live fetch
 * rather than wait; the next visitor gets the now-warm bundle.
 */
const REQUEST_TIMEOUT_MS = 10_000;

const responseSchema = z.object({ status: z.literal('ok'), bundle: z.unknown() });

/**
 * The bundle's own records, kept out of the query cache.
 *
 * Bundle shows carry `description`, which is exactly what the persisted query
 * cache must not hold (it was the bulk of the old quota problem). So the shows
 * handed to the cache are stripped, and the originals live here for the detail
 * modal to read instead of re-fetching them by id.
 */
let showIndex = new Map<number, AnimeMedia>();
let summaryIndex = new Map<number, string>();

/** The full AniList record (with synopsis) for a show the bundle covers. */
export function getBundleShow(showId: number): AnimeMedia | undefined {
  return showIndex.get(showId);
}

/** The precomputed spoiler-free summary for a show, if the bundle has one. */
export function getBundleSummary(showId: number): string | undefined {
  return summaryIndex.get(showId);
}

/** Test hook: forget everything a bundle left behind. */
export function resetSeasonBundle(): void {
  showIndex = new Map();
  summaryIndex = new Map();
}

/**
 * Which bundle graphs may be primed, given the user's overrides.
 *
 * A user who merged or split a franchise has told us the bundle's version of it
 * is wrong. Priming it would overwrite their correction with the very graph
 * they rejected — and because the query cache *is* the series reverse map, that
 * wrong graph would then be handed to every member card.
 *
 * So any graph touching an override is skipped entirely and left to the live
 * resolver, which applies overrides properly. Three ways a graph is touched:
 * a member is a merge source, a member is a merge target, or a member is split.
 * Bundles themselves are override-free by construction — they are built once for
 * everyone.
 */
export function selectPrimableGraphs(graphs: SeriesGraph[], overrides: SeriesOverrides): SeriesGraph[] {
  const touched = new Set<number>(overrides.splits);
  for (const [source, target] of Object.entries(overrides.merges)) {
    touched.add(Number(source));
    touched.add(target);
  }
  if (touched.size === 0) return graphs;

  return graphs.filter((graph) => !graph.entries.some((entry) => touched.has(entry.id)));
}

/**
 * Seed the series query cache from the bundle.
 *
 * Every member id gets the same graph object, which is the invariant the
 * resolver relies on (`resolver.ts`: "the query cache is the reverse map").
 * Priming is unconditional for the graphs that pass the override filter —
 * React Query's structural sharing keeps the existing object when the incoming
 * graph is deep-equal, so re-priming an unchanged franchise costs no re-render.
 *
 * Returns the number of graphs primed, for logging.
 */
export function primeSeriesFromBundle(bundle: SeasonBundle): number {
  const overrides = useUserData.getState().overrides;
  const primable = selectPrimableGraphs(Object.values(bundle.seriesGraphs), overrides);

  for (const graph of primable) {
    for (const entry of graph.entries) {
      queryClient.setQueryData(queryKeys.seriesByShow(entry.id), graph);
    }
  }
  return primable.length;
}

/**
 * The shows that go into the query cache.
 *
 * Two adjustments, both of which keep a bundled show indistinguishable from a
 * freshly fetched one:
 *
 * - `description` is dropped, matching `MEDIA_FIELDS` — the persisted schedule
 *   must not carry synopses.
 * - `timeUntilAiring` is recomputed from `airingAt`. AniList's value is a
 *   countdown frozen at *its* response time; in a bundle built hours ago it
 *   would be hours wrong, and three views sort and label by it.
 */
function materializeShows(shows: AnimeMedia[], now = Date.now()): AnimeMedia[] {
  const nowSeconds = Math.floor(now / 1000);

  return shows.map((show) => {
    const next = show.nextAiringEpisode;
    const copy: AnimeMedia = { ...show };
    delete copy.description;
    if (next !== null) {
      copy.nextAiringEpisode = { ...next, timeUntilAiring: next.airingAt - nowSeconds };
    }
    return copy;
  });
}

function adopt(bundle: SeasonBundle): void {
  showIndex = new Map(bundle.shows.map((show) => [show.id, show]));
  summaryIndex = new Map(
    Object.entries(bundle.summaries).flatMap(([id, summary]) => {
      const showId = Number(id);
      return Number.isFinite(showId) ? [[showId, summary] as [number, string]] : [];
    }),
  );

  const primed = primeSeriesFromBundle(bundle);
  console.info(
    `[season] bundle ${bundle.generatedAt}: ${bundle.shows.length} shows, ${primed} series graphs, ${summaryIndex.size} summaries`,
  );
}

/**
 * Fetch the bundle and turn it into a schedule result, or `null` to fall back.
 *
 * `null` covers every non-ok outcome — no bundle configured (404), a network or
 * timeout failure, a payload that does not parse, and a bundle older than the
 * freshness gate. None of those are errors worth surfacing: the caller fetches
 * AniList live instead.
 */
export async function loadScheduleFromBundle(): Promise<AnimeMedia[] | null> {
  let payload: unknown;
  try {
    const response = await fetch(SEASON_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // 404 { status: "unavailable" } is the configured-off answer, not a failure.
    if (!response.ok) return null;
    payload = await response.json();
  } catch {
    return null;
  }

  const envelope = responseSchema.safeParse(payload);
  if (!envelope.success) return null;

  const bundle = parseSeasonBundle(envelope.data.bundle);
  if (bundle === null) {
    console.warn('[season] bundle failed validation; using the live path.');
    return null;
  }
  if (!isBundleFresh(bundle.generatedAt)) {
    console.warn(`[season] bundle from ${bundle.generatedAt} is stale; using the live path.`);
    return null;
  }
  if (bundle.shows.length === 0) return null;

  adopt(bundle);
  return materializeShows(bundle.shows);
}
