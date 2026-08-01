import { removeKey } from '../stores/storage';
import { useUserData } from '../stores/userData';

export type { SeriesOverrides } from '../stores/userData';
import type { SeriesOverrides } from '../stores/userData';

/**
 * Facade over the userData store's overrides slice. Works outside React
 * (seriesResolution calls getOverrides during BFS) via getState().
 *
 * Every write still deletes the cached series reverse map so the graph
 * re-resolves — existing invalidation behavior, replaced in the series wave.
 */

const REVERSE_MAP_KEY = 'senpai_series_reverse_map';

export function getOverrides(): SeriesOverrides {
  return useUserData.getState().overrides;
}

export function saveOverrides(overrides: SeriesOverrides) {
  useUserData.getState().setOverrides(overrides);
  removeKey(REVERSE_MAP_KEY);
}

export function splitFromSeries(showId: number) {
  useUserData.getState().splitShow(showId);
  removeKey(REVERSE_MAP_KEY);
}

export function mergeIntoSeries(showId: number, targetSeriesId: number) {
  useUserData.getState().mergeShow(showId, targetSeriesId);
  removeKey(REVERSE_MAP_KEY);
}
