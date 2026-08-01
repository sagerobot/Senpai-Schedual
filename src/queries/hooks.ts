import { useMemo, useSyncExternalStore } from 'react';
import { useQueries, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  fetchAnimeBySeason,
  fetchCurrentSeasonAnime,
  fetchMediaById,
  searchAnime,
} from '../api/anilist/queries';
import type { AnimeMedia } from '../api/anilist/schemas';
import { fetchShowDetails, type ShowDetails } from '../api/showDetails';
import { displayTitle } from '../lib/displayTitle';
import { currentSeason, type SeasonSlug } from '../routes/season';
import { queryKeys } from './keys';
import { fetchMediaBatched } from './mediaBatcher';
import { useMediaTransform } from './offsets';
import { getBundleShow, getBundleSummary, loadScheduleFromBundle } from './seasonBundle';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Partial schedule pages, streamed *outside* the query cache.
 *
 * `queryClient.setQueryData` was considered and rejected: under React Query v5
 * it dispatches a success action — `status` flips to `'success'` and
 * `dataUpdatedAt` moves — so the throttled localStorage persister (which keeps
 * anything with `status === 'success'`, see client.ts) could dehydrate a
 * half-fetched season as if it were the real thing, and `isPending`/staleTime
 * semantics would report a fetch that is still running as settled. A
 * module-level store sidesteps all of that: the cache only ever sees the
 * complete list the queryFn resolves with.
 */
let schedulePartial: AnimeMedia[] | null = null;
const schedulePartialListeners = new Set<() => void>();

function publishSchedulePartial(partial: AnimeMedia[] | null): void {
  schedulePartial = partial;
  for (const listener of schedulePartialListeners) listener();
}

function subscribeSchedulePartial(listener: () => void): () => void {
  schedulePartialListeners.add(listener);
  return () => schedulePartialListeners.delete(listener);
}

const getSchedulePartial = () => schedulePartial;

/**
 * The current-season schedule. Refetches on a 15-minute interval so a tab left
 * open keeps its countdowns honest, and survives reloads for a day.
 *
 * Two ways this resolves, in order:
 *
 * 1. The precomputed bundle from `GET /api/season` — one same-origin request,
 *    which also primes every franchise graph and every AI summary it carries.
 * 2. The progressive AniList walk, unchanged, whenever the bundle is missing,
 *    stale, or unusable. `loadScheduleFromBundle` returns `null` rather than
 *    throwing for all of those, so the fallback is the ordinary path and not an
 *    error path.
 *
 * Either way the value that lands in the cache is the same shape — a complete
 * `AnimeMedia[]` with no synopses — so persistence, staleTime, and the read-time
 * offset transform behave identically.
 *
 * On a cold start `partialData` carries the pages fetched so far (first one
 * after a single round-trip); it is `null` as soon as complete data exists, so
 * a background interval refetch never downgrades the list on screen. The bundle
 * path skips it entirely: there are no pages to stream, only one response.
 */
export function useCurrentSchedule() {
  const { transformList } = useMediaTransform();

  const partialRaw = useSyncExternalStore(subscribeSchedulePartial, getSchedulePartial, getSchedulePartial);

  const query = useQuery({
    queryKey: queryKeys.schedule(),
    queryFn: async () => {
      const bundled = await loadScheduleFromBundle();
      if (bundled !== null) return bundled;

      try {
        return await fetchCurrentSeasonAnime(publishSchedulePartial);
      } finally {
        publishSchedulePartial(null);
      }
    },
    select: transformList,
    staleTime: 15 * MINUTE,
    gcTime: DAY,
    refetchInterval: 15 * MINUTE,
  });

  const hasComplete = query.data !== undefined;
  const partialData = useMemo(
    () => (partialRaw !== null && !hasComplete ? transformList(partialRaw) : null),
    [partialRaw, hasComplete, transformList],
  );

  return {
    ...query,
    /** Cold-start pages streamed so far; `null` once the full list exists. */
    partialData,
    /** True while later pages are still arriving behind a partial first paint. */
    isStreaming: partialData !== null,
  };
}

/**
 * One season's line-up. A past season can never change, so it is cached
 * forever; only the season we are living in is refreshed.
 */
export function useSeasonQuery(year: number, season: SeasonSlug) {
  const { transformList } = useMediaTransform();
  const queryClient = useQueryClient();

  const now = useMemo(() => currentSeason(), []);
  const isCurrent = year === now.year && season === now.season;

  return useQuery({
    queryKey: queryKeys.season(year, season),
    queryFn: () => fetchAnimeBySeason(season.toUpperCase(), year),
    select: transformList,
    staleTime: isCurrent ? 15 * MINUTE : Infinity,
    gcTime: WEEK,
    // The schedule query already holds this season; show it while the
    // season-scoped fetch (which excludes other-season releasing shows) lands.
    placeholderData: isCurrent
      ? () => queryClient.getQueryData<AnimeMedia[]>(queryKeys.schedule())
      : undefined,
  });
}

/** Title search. Not persisted — see keys.ts. */
export function useSearchQuery(term: string) {
  const { transformList } = useMediaTransform();
  const trimmed = term.trim();

  return useQuery({
    queryKey: queryKeys.search(trimmed),
    queryFn: () => searchAnime(trimmed),
    select: transformList,
    enabled: trimmed.length > 0,
    staleTime: 5 * MINUTE,
    gcTime: 15 * MINUTE,
  });
}

const MEDIA_STALE_TIME = HOUR;

/**
 * One media record by id, resolved through the micro-batcher. `null` data
 * means AniList has no such id — a cached answer, not a pending one.
 */
export function useMediaById(id: number | null) {
  const { transformMaybe } = useMediaTransform();

  return useQuery({
    queryKey: queryKeys.media(id ?? 0),
    queryFn: () => fetchMediaBatched(id!),
    select: transformMaybe,
    enabled: id !== null,
    staleTime: MEDIA_STALE_TIME,
    gcTime: WEEK,
  });
}

export interface MediaByIdsResult {
  /** Only the ids that resolved; unresolvable ones are simply absent. */
  media: AnimeMedia[];
  /** How many are still in flight, for an inline "loading N more" hint. */
  pendingCount: number;
  isError: boolean;
}

function combineMedia(results: UseQueryResult<AnimeMedia | null>[]): MediaByIdsResult {
  const media: AnimeMedia[] = [];
  let pendingCount = 0;
  let isError = false;

  for (const result of results) {
    if (result.data) media.push(result.data);
    if (result.isPending) pendingCount++;
    if (result.isError) isError = true;
  }

  return { media, pendingCount, isError };
}

/**
 * Resolve many ids at once. Pass a memoized array — a fresh array identity on
 * every render re-subscribes the whole set.
 */
export function useMediaByIds(ids: number[]): MediaByIdsResult {
  const { transformMaybe } = useMediaTransform();

  return useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.media(id),
      queryFn: () => fetchMediaBatched(id),
      select: transformMaybe,
      staleTime: MEDIA_STALE_TIME,
      gcTime: WEEK,
    })),
    combine: combineMedia,
  });
}

export interface ShowDetailsData {
  details: ShowDetails;
  /** The by-id record, which unlike list results carries `description`. */
  full: AnimeMedia | null;
}

/**
 * Everything the detail modal needs beyond the list record: MAL/Kitsu scores
 * and synopses, the AI summary, and the full AniList record.
 *
 * `fetchShowDetails` throws when every external lookup failed, so a transient
 * Jikan or Kitsu 429 surfaces as a retryable error instead of being cached as
 * an empty result for a day. A degraded AI status is handled by the functional
 * `staleTime` below rather than by refusing to cache: the data we did get is
 * kept and shown instantly, but the query is stale from birth so re-opening
 * the modal re-attempts the summary — the behaviour the old localStorage cache
 * implemented by hand.
 *
 * When the season bundle covers this show it supplies both of those for free —
 * the by-id record (bundle shows are fetched with the same MEDIA_FIELDS_FULL
 * selection) and the summary — so opening a modal costs Jikan and Kitsu only.
 * The bundle's record is used raw, exactly as `fetchMediaById` returns it, so
 * `select` applies the offset transform to it once and only once.
 */
export function useShowDetailsQuery(anime: AnimeMedia) {
  const { transformMaybe } = useMediaTransform();

  const select = useMemo(
    () => (data: ShowDetailsData) => ({ details: data.details, full: transformMaybe(data.full) }),
    [transformMaybe],
  );

  return useQuery({
    queryKey: queryKeys.showDetails(anime.id),
    queryFn: async (): Promise<ShowDetailsData> => {
      // List records no longer carry `description`, so the AI summary's AniList
      // synopsis comes from the by-id fetch (or the bundle). The promise (never
      // the awaited value) is handed to fetchShowDetails so Jikan/Kitsu start
      // immediately; only the synopsis assembly waits on it.
      const bundledShow = getBundleShow(anime.id);
      const fullPromise: Promise<AnimeMedia | null> =
        bundledShow !== undefined ? Promise.resolve(bundledShow) : fetchMediaById(anime.id).catch(() => null);
      const synopsisPromise = fullPromise.then((m) => m?.description ?? anime.description ?? '');
      const [details, full] = await Promise.all([
        fetchShowDetails(anime.idMal, displayTitle(anime), synopsisPromise, anime.id, getBundleSummary(anime.id)),
        fullPromise,
      ]);
      return { details, full };
    },
    select,
    staleTime: (query) => (query.state.data?.details.aiStatus === 'ok' ? DAY : 0),
    gcTime: WEEK,
  });
}
