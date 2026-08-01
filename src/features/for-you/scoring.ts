import type { SeriesGraph } from '../../series/labeling';
import type { LibraryEntry } from '../../types';

/**
 * Collapse a scored library into the series-level shape the recommendation
 * endpoint expects. Pure — the graphs are passed in, never resolved here.
 *
 * Rating four seasons of one show 9/10 should count as one strong signal about
 * that franchise, not four, so scores are averaged per series before the top
 * sources are picked.
 */

/** How many series the server is asked to draw recommendations from. */
export const TOP_SERIES_LIMIT = 15;

export interface CollapsedLibrary {
  /** The strongest-rated series, highest average first, capped at TOP_SERIES_LIMIT. */
  topSeries: { showId: number; showScore: number }[];
  /** Everything the user already has, so nothing is recommended back to them. */
  excludeIds: number[];
}

export function collapseLibraryToSeries(
  entries: LibraryEntry[],
  graphs: Record<number, SeriesGraph>,
): CollapsedLibrary {
  const seriesIdByShow = new Map<number, number>();
  const excludeIds = new Set<number>();

  for (const graph of Object.values(graphs)) {
    for (const entry of graph.entries) {
      seriesIdByShow.set(entry.id, graph.seriesId);
      excludeIds.add(entry.id);
    }
  }
  // A library show whose graph failed to resolve is still in the library.
  for (const entry of entries) excludeIds.add(entry.showId);

  const totals = new Map<number, { sum: number; count: number }>();
  for (const entry of entries) {
    if (entry.showScore === null) continue;
    const seriesId = seriesIdByShow.get(entry.showId) ?? entry.showId;
    const total = totals.get(seriesId) ?? { sum: 0, count: 0 };
    total.sum += entry.showScore;
    total.count += 1;
    totals.set(seriesId, total);
  }

  const topSeries = [...totals.entries()]
    .map(([showId, { sum, count }]) => ({ showId, showScore: sum / count }))
    .sort((a, b) => b.showScore - a.showScore)
    .slice(0, TOP_SERIES_LIMIT);

  return { topSeries, excludeIds: [...excludeIds] };
}
