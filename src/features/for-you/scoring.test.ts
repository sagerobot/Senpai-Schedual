import { describe, expect, it } from 'vitest';
import type { SeriesGraph } from '../../series/labeling';
import type { LibraryEntry } from '../../types';
import { collapseLibraryToSeries, TOP_SERIES_LIMIT } from './scoring';

function entry(showId: number, showScore: number | null): LibraryEntry {
  return { showId, idMal: null, status: 'completed', showScore, source: 'manual' };
}

/** A franchise whose members are `ids`, canonical id first. */
function graph(ids: number[]): SeriesGraph {
  return {
    seriesId: ids[0],
    title: `Series ${ids[0]}`,
    entries: ids.map((id) => ({
      id,
      format: 'TV',
      startDate: null,
      seasonLabel: 'Season 1',
      title: `Show ${id}`,
      isAttachment: false,
    })),
  };
}

function graphs(...members: number[][]): Record<number, SeriesGraph> {
  return Object.fromEntries(members.map((ids) => [ids[0], graph(ids)]));
}

describe('collapseLibraryToSeries', () => {
  it('averages the seasons of one franchise into a single source', () => {
    const { topSeries } = collapseLibraryToSeries(
      [entry(1, 10), entry(2, 8), entry(3, 6), entry(50, 7)],
      graphs([1, 2, 3], [50]),
    );

    expect(topSeries).toEqual([
      { showId: 1, showScore: 8 },
      { showId: 50, showScore: 7 },
    ]);
  });

  it('ignores unscored entries but still excludes them', () => {
    const { topSeries, excludeIds } = collapseLibraryToSeries(
      [entry(1, null), entry(2, 9)],
      graphs([1], [2]),
    );

    expect(topSeries).toEqual([{ showId: 2, showScore: 9 }]);
    expect(excludeIds).toContain(1);
  });

  it('keeps a score of 0 rather than treating it as unrated', () => {
    const { topSeries } = collapseLibraryToSeries([entry(1, 0), entry(2, 4)], graphs([1], [2]));

    expect(topSeries).toEqual([
      { showId: 2, showScore: 4 },
      { showId: 1, showScore: 0 },
    ]);
  });

  it('takes the top 15 series by average score', () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry(i + 1, (i % 10) + 1));
    const { topSeries } = collapseLibraryToSeries(
      entries,
      graphs(...entries.map((e) => [e.showId])),
    );

    expect(topSeries).toHaveLength(TOP_SERIES_LIMIT);
    expect(topSeries[0].showScore).toBe(10);
    expect(topSeries.every((s, i) => i === 0 || s.showScore <= topSeries[i - 1].showScore)).toBe(true);
  });

  it('excludes every franchise member, not just the shows in the library', () => {
    // The point of the exclusion set: having watched season 1 should stop the
    // pipeline recommending season 3 back.
    const { excludeIds } = collapseLibraryToSeries([entry(1, 9)], graphs([1, 2, 3]));

    expect(excludeIds.sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('scores an unrated entry from its episode-log average', () => {
    const logs = [
      { showId: 1, episodeNumber: 1, watchedAt: 0, score: 8 },
      { showId: 1, episodeNumber: 2, watchedAt: 0, score: 6 },
      { showId: 99, episodeNumber: 1, watchedAt: 0, score: 1 }, // not in the library
    ];
    const { topSeries } = collapseLibraryToSeries([entry(1, null)], graphs([1]), logs);

    expect(topSeries).toEqual([{ showId: 1, showScore: 7 }]);
  });

  it('lets an explicit show score beat the episode-log average', () => {
    const logs = [{ showId: 1, episodeNumber: 1, watchedAt: 0, score: 2 }];
    const { topSeries } = collapseLibraryToSeries([entry(1, 10)], graphs([1]), logs);

    expect(topSeries).toEqual([{ showId: 1, showScore: 10 }]);
  });

  it('falls back to the show itself when its graph never resolved', () => {
    const { topSeries, excludeIds } = collapseLibraryToSeries([entry(7, 9), entry(8, 5)], {});

    expect(topSeries).toEqual([
      { showId: 7, showScore: 9 },
      { showId: 8, showScore: 5 },
    ]);
    expect(excludeIds.sort((a, b) => a - b)).toEqual([7, 8]);
  });
});
