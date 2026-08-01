import { describe, expect, it } from 'vitest';
import { buildSeriesGraph, type SeriesMember } from './labeling';

function member(
  id: number,
  title: string,
  date: [number, number, number] | null,
  format = 'TV',
  episodes: number | null = 12,
): SeriesMember {
  return {
    id,
    title: { english: title, romaji: null, userPreferred: title },
    format,
    episodes,
    startDate: date === null ? null : { year: date[0], month: date[1], day: date[2] },
  };
}

function labelsById(members: SeriesMember[]): Record<number, string> {
  const graph = buildSeriesGraph(members);
  return Object.fromEntries(graph.entries.map((e) => [e.id, e.seasonLabel]));
}

describe('buildSeriesGraph labeling', () => {
  it('reads the season marker out of the title', () => {
    const labels = labelsById([
      member(1, 'Attack on Titan', [2013, 4, 7]),
      member(2, 'Attack on Titan Season 2', [2017, 4, 1]),
      member(3, 'Attack on Titan Season 3 Part 2', [2019, 4, 29]),
      member(4, 'Attack on Titan The Final Season', [2020, 12, 7]),
    ]);

    expect(labels[2]).toBe('Season 2');
    expect(labels[3]).toBe('Season 3 Part 2');
    expect(labels[4]).toBe('Final Season');
  });

  it('matches Cour and bare S<n> markers', () => {
    const labels = labelsById([
      member(1, 'Chainsaw Man', [2022, 10, 12]),
      member(2, 'Chainsaw Man Cour 2', [2023, 10, 12]),
      member(3, 'Chainsaw Man S3', [2024, 10, 12]),
    ]);

    expect(labels[2]).toBe('Cour 2');
    expect(labels[3]).toBe('S3');
  });

  it('defaults the earliest entry to Season 1', () => {
    const labels = labelsById([
      member(1, 'Mushishi', [2005, 10, 23]),
      member(2, 'Mushishi Season 2', [2014, 4, 5]),
    ]);

    expect(labels[1]).toBe('Season 1');
  });

  it('strips the franchise prefix to label an untagged sequel by its subtitle', () => {
    const labels = labelsById([
      member(1, 'Fate/stay night', [2006, 1, 6]),
      member(2, 'Fate/stay night: Unlimited Blade Works', [2014, 10, 4]),
      member(3, 'Fate/stay night - Heaven’s Feel', [2017, 10, 14]),
    ]);

    expect(labels[2]).toBe('Unlimited Blade Works');
    expect(labels[3]).toBe('Heaven’s Feel');
  });

  it('sorts and labels attachments as attachments, not seasons', () => {
    const graph = buildSeriesGraph([
      member(1, 'Made in Abyss', [2017, 7, 7]),
      member(2, 'Made in Abyss: Dawn of the Deep Soul', [2020, 1, 17], 'MOVIE', 1),
      member(3, 'Made in Abyss Season 2', [2022, 7, 6]),
      member(4, 'Some Unrelated Special', [2023, 1, 1], 'SPECIAL', 1),
      member(5, 'Made in Abyss', [2024, 1, 1], 'OVA', 1),
    ]);

    const byId = new Map(graph.entries.map((e) => [e.id, e]));
    expect(byId.get(2)!.isAttachment).toBe(true);
    expect(byId.get(2)!.seasonLabel).toBe('Dawn of the Deep Soul');
    // No shared prefix: the attachment keeps its own title.
    expect(byId.get(4)!.seasonLabel).toBe('Some Unrelated Special');
    // Title identical to the franchise title: falls back to the format.
    expect(byId.get(5)!.seasonLabel).toBe('OVA');
    expect(byId.get(3)!.isAttachment).toBe(false);
    // Entries stay in release order regardless of format.
    expect(graph.entries.map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('treats a missing date as last and breaks date ties by id', () => {
    const graph = buildSeriesGraph([
      member(3, 'Show C', null),
      member(2, 'Show B', [2020, 1, 1]),
      member(1, 'Show A', [2020, 1, 1]),
    ]);

    expect(graph.entries.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(graph.seriesId).toBe(1);
  });

  it('produces the same seriesId and entry order for any input order', () => {
    // This is the fix for franchises grouping under two different ids: the old
    // sort left the canonical id dependent on which show the BFS started from.
    const members = [
      member(10, 'Alpha', [2020, 1, 1]),
      member(4, 'Alpha Season 2', [2021, 1, 1]),
      member(77, 'Alpha Season 3', [2022, 1, 1]),
      member(31, 'Alpha Movie', [2021, 6, 1], 'MOVIE', 1),
      member(52, 'Alpha Special', [2020, 1, 1], 'SPECIAL', 1),
    ];
    const expected = buildSeriesGraph(members);

    const shuffles = [
      [4, 0, 2, 1, 3],
      [3, 2, 1, 0, 4],
      [2, 4, 0, 3, 1],
      [1, 3, 4, 2, 0],
    ];
    for (const order of shuffles) {
      const graph = buildSeriesGraph(order.map((i) => members[i]));
      expect(graph.seriesId).toBe(expected.seriesId);
      expect(graph.title).toBe(expected.title);
      expect(graph.entries).toEqual(expected.entries);
    }
  });

  it('falls back through the title chain and refuses an empty member set', () => {
    const graph = buildSeriesGraph([
      { id: 9, title: { english: null, romaji: 'Romaji Only', userPreferred: null }, format: 'TV', episodes: null, startDate: null },
    ]);
    expect(graph.title).toBe('Romaji Only');
    expect(graph.entries[0].episodes).toBeUndefined();

    expect(() => buildSeriesGraph([])).toThrow(/no members/);
  });
});
