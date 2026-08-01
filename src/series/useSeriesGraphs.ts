import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '../queries/keys';
import type { SeriesGraph } from './labeling';
import { seriesResolver } from './resolver';

/**
 * The only way components read franchise graphs.
 *
 * Everything sits in the shared query cache, so the Library view and the
 * recommendation pipeline no longer resolve the same library twice, and a card
 * whose franchise a neighbour already resolved renders with no request at all.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Franchise membership changes when a sequel is announced — days, not minutes. */
export const SERIES_STALE_TIME = 7 * DAY;
export const SERIES_GC_TIME = 30 * DAY;

/**
 * No retries: the resolver already retries 429s inside the AniList client, and
 * its other failure mode (an id AniList does not know) never succeeds on a
 * second ask. A failed graph simply falls back to the show's own title.
 */
const seriesQueryOptions = (showId: number) => ({
  queryKey: queryKeys.seriesByShow(showId),
  queryFn: () => seriesResolver.resolveSeries(showId),
  staleTime: SERIES_STALE_TIME,
  gcTime: SERIES_GC_TIME,
  retry: 0,
});

export interface SeriesGraphsResult {
  /** Keyed by seriesId, so members of one franchise collapse to one entry. */
  graphs: Record<number, SeriesGraph>;
  resolving: boolean;
  progress: { done: number; total: number };
}

function combineGraphs(results: UseQueryResult<SeriesGraph>[]): SeriesGraphsResult {
  const graphs: Record<number, SeriesGraph> = {};
  let done = 0;

  for (const result of results) {
    if (result.data !== undefined) graphs[result.data.seriesId] = result.data;
    if (!result.isPending) done++;
  }

  return {
    graphs,
    resolving: done < results.length,
    progress: { done, total: results.length },
  };
}

/**
 * Resolve many shows' franchises at once. Pass a memoized array — a fresh array
 * identity every render re-subscribes the whole set.
 */
export function useSeriesGraphs(showIds: number[]): SeriesGraphsResult {
  return useQueries({
    queries: showIds.map(seriesQueryOptions),
    combine: combineGraphs,
  });
}

/** One show's franchise, for per-card consumers like SeriesTitle. */
export function useSeriesGraph(showId: number) {
  return useQuery(seriesQueryOptions(showId));
}
