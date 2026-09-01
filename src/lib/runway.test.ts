import { describe, expect, it } from 'vitest';
import type { AnimeMedia, EpisodeLog } from '../types';
import { computeRunway, laneLayout, runwaySummary, shortTitle, MIN_CHIP_WIDTH, CHIP_GAP } from './runway';
import { describeCountdown, formatCountdown } from './utils';

const NOW = 1_800_000_000; // fixed unix seconds; the module is clock-free
const MIN = 60;

interface ShowOpts {
  id: number;
  title?: string;
  /** Seconds from NOW until the next episode airs. */
  in: number;
  episode?: number;
  episodes?: number | null;
}

function show({ id, title = `Show ${id}`, in: nextIn, episode = 6, episodes = 12 }: ShowOpts): AnimeMedia {
  return {
    id,
    idMal: id,
    averageScore: 80,
    title: { romaji: title, english: title, userPreferred: title },
    bannerImage: null,
    coverImage: { large: 'https://example.test/cover.jpg', color: null },
    startDate: { year: 2026, month: 1, day: 1 },
    nextAiringEpisode: { airingAt: NOW + nextIn, timeUntilAiring: nextIn, episode },
    status: 'RELEASING',
    format: 'TV',
    episodes,
    externalLinks: [],
    genres: ['Action'],
  };
}

function logsThrough(showId: number, n: number): EpisodeLog[] {
  return Array.from({ length: n }, (_, i) => ({
    showId,
    episodeNumber: i + 1,
    watchedAt: NOW * 1000,
    score: null,
  }));
}

describe('computeRunway admission', () => {
  it('admits a watching show inside the hour', () => {
    const moments = computeRunway([show({ id: 1, in: 40 * MIN })], [1], [], NOW);
    expect(moments).toHaveLength(1);
    expect(moments[0].shows.map((s) => s.anime.id)).toEqual([1]);
  });

  it('rejects anything further out than the hour', () => {
    expect(computeRunway([show({ id: 1, in: 61 * MIN })], [1], [], NOW)).toEqual([]);
  });

  it('rejects an episode that has already aired — that is the drop card', () => {
    expect(computeRunway([show({ id: 1, in: -1 })], [1], [], NOW)).toEqual([]);
    expect(computeRunway([show({ id: 1, in: 0 })], [1], [], NOW)).toEqual([]);
  });

  it('rejects a show that is not in the library', () => {
    expect(computeRunway([show({ id: 1, in: 10 * MIN })], [], [], NOW)).toEqual([]);
  });

  it('rejects a show with no announced next episode', () => {
    const noNext = { ...show({ id: 1, in: 10 * MIN }), nextAiringEpisode: null };
    expect(computeRunway([noNext], [1], [], NOW)).toEqual([]);
  });

  it('rejects an episode already logged ahead of its airing', () => {
    const logs: EpisodeLog[] = [{ showId: 1, episodeNumber: 6, watchedAt: NOW * 1000, score: 8 }];
    expect(computeRunway([show({ id: 1, in: 10 * MIN, episode: 6 })], [1], logs, NOW)).toEqual([]);
  });

  it('admits a stacking show only for its finale', () => {
    const mid = show({ id: 1, in: 10 * MIN, episode: 6, episodes: 12 });
    const finale = show({ id: 2, in: 10 * MIN, episode: 12, episodes: 12 });
    expect(computeRunway([mid], [], [], NOW, [1])).toEqual([]);
    const moments = computeRunway([finale], [], [], NOW, [2]);
    expect(moments).toHaveLength(1);
    expect(moments[0].shows[0].finale).toBe(true);
  });

  it('comes back next week no matter what happened to last week', () => {
    // The lifecycle rule the strip depends on, and the reason it reads no skip
    // state: whatever you did with episode 6 — watched it, skipped its drop
    // card, ignored it — episode 7 is a different episode, and you want to see
    // it coming. Only a log for the *airing* episode suppresses the chip.
    const nextWeek = show({ id: 1, in: 10 * MIN, episode: 7 });
    const skippedLastWeek = computeRunway([nextWeek], [1], logsThrough(1, 5), NOW);
    expect(skippedLastWeek[0].shows[0].episode).toBe(7);

    const watchedLastWeek = computeRunway([nextWeek], [1], logsThrough(1, 6), NOW);
    expect(watchedLastWeek[0].shows[0]).toMatchObject({ episode: 7, behindCount: 0 });
  });
});

describe('computeRunway moments', () => {
  it('folds shows airing at the same time into one moment', () => {
    const moments = computeRunway(
      [show({ id: 1, in: 12 * MIN }), show({ id: 2, in: 12 * MIN }), show({ id: 3, in: 12 * MIN })],
      [1, 2, 3],
      [],
      NOW,
    );
    expect(moments).toHaveLength(1);
    expect(moments[0].shows).toHaveLength(3);
  });

  it('groups by the minute, so a stray offset does not split a block', () => {
    const moments = computeRunway(
      [show({ id: 1, in: 12 * MIN }), show({ id: 2, in: 12 * MIN + 29 })],
      [1, 2],
      [],
      NOW,
    );
    expect(moments).toHaveLength(1);
    expect(moments[0].airingAt).toBe(NOW + 12 * MIN);
  });

  it('keeps distinct times as distinct moments, soonest first', () => {
    const moments = computeRunway(
      [show({ id: 1, in: 47 * MIN }), show({ id: 2, in: 12 * MIN }), show({ id: 3, in: 12 * MIN })],
      [1, 2, 3],
      [],
      NOW,
    );
    expect(moments.map((m) => m.shows.length)).toEqual([2, 1]);
    expect(moments[0].airingAt).toBeLessThan(moments[1].airingAt);
  });

  it('puts the actionable chip first, then sorts alphabetically', () => {
    const zed = show({ id: 1, title: 'Zed', in: 12 * MIN, episode: 6 });
    const abel = show({ id: 2, title: 'Abel', in: 12 * MIN, episode: 6 });
    const closable = show({ id: 3, title: 'Nero', in: 12 * MIN, episode: 6 });
    const moments = computeRunway(
      [zed, abel, closable],
      [1, 2, 3],
      // Nero is one behind: episodes 1-4 watched, 5 outstanding, 6 airing.
      [...logsThrough(1, 5), ...logsThrough(2, 5), ...logsThrough(3, 4)],
      NOW,
    );
    expect(moments[0].shows.map((s) => s.anime.id)).toEqual([3, 2, 1]);
  });
});

describe('computeRunway progress', () => {
  it('reports ready when everything before the airing episode is watched', () => {
    const moments = computeRunway([show({ id: 1, in: 10 * MIN, episode: 6 })], [1], logsThrough(1, 5), NOW);
    const only = moments[0].shows[0];
    expect(only.behindCount).toBe(0);
    expect(only.closable).toBe(false);
    expect(only.nextEpisode).toBe(6);
  });

  it('offers a catch-up only for a gap of exactly one', () => {
    const one = computeRunway([show({ id: 1, in: 10 * MIN, episode: 6 })], [1], logsThrough(1, 4), NOW);
    expect(one[0].shows[0]).toMatchObject({ behindCount: 1, closable: true, nextEpisode: 5 });

    const three = computeRunway([show({ id: 1, in: 10 * MIN, episode: 6 })], [1], logsThrough(1, 2), NOW);
    expect(three[0].shows[0]).toMatchObject({ behindCount: 3, closable: false, nextEpisode: 3 });
  });

  it('treats an unwatched show as behind by everything before the airing episode', () => {
    const moments = computeRunway([show({ id: 1, in: 10 * MIN, episode: 6 })], [1], [], NOW);
    expect(moments[0].shows[0]).toMatchObject({ behindCount: 5, nextEpisode: 1 });
  });
});

describe('runwaySummary', () => {
  const at = (airingAt: number) => (airingAt === NOW + 12 * MIN ? '11:30 PM' : '11:47 PM');

  it('names the show when only one is on the runway', () => {
    const moments = computeRunway([show({ id: 1, title: 'Frieren', in: 12 * MIN })], [1], [], NOW);
    expect(runwaySummary(moments, at)).toBe('Frieren lands at 11:30 PM');
  });

  it('counts a shared moment', () => {
    const moments = computeRunway(
      [show({ id: 1, in: 12 * MIN }), show({ id: 2, in: 12 * MIN }), show({ id: 3, in: 12 * MIN })],
      [1, 2, 3],
      [],
      NOW,
    );
    expect(runwaySummary(moments, at)).toBe('Three shows land at 11:30 PM');
  });

  it('splits mixed times', () => {
    const moments = computeRunway(
      [show({ id: 1, in: 12 * MIN }), show({ id: 2, in: 12 * MIN }), show({ id: 3, in: 29 * MIN })],
      [1, 2, 3],
      [],
      NOW,
    );
    expect(runwaySummary(moments, at)).toBe('Two at 11:30 PM, one at 11:47 PM');
  });

  it('is empty when the runway is', () => {
    expect(runwaySummary([], at)).toBe('');
  });
});

describe('laneLayout', () => {
  it('shares the lane evenly while chips clear the floor', () => {
    const layout = laneLayout(1037, 3);
    expect(layout.paginated).toBe(false);
    expect(layout.visible).toBe(3);
    expect(layout.maxOffset).toBe(0);
    expect(layout.chipWidth).toBeCloseTo((1037 - 2 * CHIP_GAP) / 3);
  });

  it('never wraps: past the floor it locks the width and paginates', () => {
    const layout = laneLayout(1037, 6);
    expect(layout.chipWidth).toBe(MIN_CHIP_WIDTH);
    expect(layout.paginated).toBe(true);
    expect(layout.visible).toBe(4);
    expect(layout.maxOffset).toBe(2);
  });

  it('paginates sooner in a narrower lane, from the same rule', () => {
    const layout = laneLayout(700, 4);
    expect(layout.paginated).toBe(true);
    expect(layout.visible).toBe(2);
    expect(layout.maxOffset).toBe(2);
  });

  it('always keeps at least one chip visible', () => {
    expect(laneLayout(120, 3).visible).toBe(1);
  });

  it('is inert before the lane has been measured', () => {
    expect(laneLayout(0, 3).paginated).toBe(false);
  });
});

describe('formatCountdown', () => {
  it('reads MM:SS through the hour', () => {
    expect(formatCountdown(47 * 60 + 12)).toBe('47:12');
    expect(formatCountdown(3600)).toBe('60:00');
  });

  it('drops to M:SS inside the final minute', () => {
    expect(formatCountdown(30)).toBe('0:30');
    expect(formatCountdown(5)).toBe('0:05');
  });

  it('never renders a negative clock', () => {
    expect(formatCountdown(-10)).toBe('0:00');
  });
});

describe('describeCountdown', () => {
  it('speaks in minutes, so the label does not change every second', () => {
    expect(describeCountdown(47 * 60 + 12)).toBe('in 47 minutes');
    expect(describeCountdown(60)).toBe('in 1 minute');
    expect(describeCountdown(20)).toBe('in less than a minute');
  });
});

describe('shortTitle', () => {
  it('leaves a title that fits alone', () => {
    expect(shortTitle('Frieren', 22)).toBe('Frieren');
  });

  it('drops the subtitle rather than letting ellipsis mangle it', () => {
    expect(shortTitle("Frieren: Beyond Journey's End", 22)).toBe('Frieren');
  });

  it('keeps a long unsplittable title intact for the ellipsis to handle', () => {
    const long = 'A Very Long Title With No Subtitle Break At All';
    expect(shortTitle(long, 22)).toBe(long);
  });
});
