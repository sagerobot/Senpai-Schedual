import { useUserData } from '../stores/userData';
// Side-effect import: the resolver subscribes to the overrides slice when its
// module loads, and that subscription is what invalidates the cached graphs.
// Importing it here guarantees it is loaded before any override can be written.
import './resolver';

export type { SeriesOverrides } from '../stores/userData';
import type { SeriesOverrides } from '../stores/userData';

/**
 * Facade over the userData store's overrides slice, usable outside React.
 *
 * Invalidation is not done here: `resolver.ts` watches the slice itself, so
 * every write path — this facade, a direct store action, clearAll — drops the
 * cached graphs and the corrected franchise appears without a reload. The old
 * facade deleted a `senpai_series_reverse_map` localStorage key by hand, which
 * left the per-series entries behind and did nothing for the in-memory copies.
 */

export function getOverrides(): SeriesOverrides {
  return useUserData.getState().overrides;
}

export function splitFromSeries(showId: number): void {
  useUserData.getState().splitShow(showId);
}

export function mergeIntoSeries(showId: number, targetSeriesId: number): void {
  useUserData.getState().mergeShow(showId, targetSeriesId);
}
