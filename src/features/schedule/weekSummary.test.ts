import { describe, expect, it } from 'vitest';
import type { AnimeMedia, EpisodeLog } from '../../types';
import { MAX_PIPS, summarizeWeek } from './weekSummary';

const NOW = new Date('2026-08-30T12:00:00Z');
const NOW_SEC = Math.floor(NOW.getTime() / 1000);
const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Episode `ep` airs in three days, so `ep - 1` counts as aired. */
function show(id: number, ep = 6): AnimeMedia {
  return {
    id,
    idMal: id,
    averageScore: 80,
    title: { romaji: `Show ${id}`, english: `Show ${id}`, userPreferred: `Show ${id}` },
    bannerImage: null,
    coverImage: { large: 'https://example.test/cover.jpg', color: null },
    startDate: { year: 2026, month: 1, day: 1 },
    nextAiringEpisode: { airingAt: NOW_SEC + 3 * 24 * 3600, timeUntilAiring: 3 * 24 * 3600, episode: ep },
    status: 'RELEASING',
    format: 'TV',
    episodes: 12,
    externalLinks: [],
    genres: ['Action'],
  };
}

const logsThrough = (showId: number, n: number): EpisodeLog[] =>
  Array.from({ length: n }, (_, i) => ({
    showId,
    episodeNumber: i + 1,
    watchedAt: NOW.getTime(),
    score: null,
  }));

const grouped = (entries: Record<string, AnimeMedia[]>): Record<string, AnimeMedia[]> => {
  const base: Record<string, AnimeMedia[]> = {};
  for (const day of WEEK) base[day] = entries[day] ?? [];
  return base;
};

describe('summarizeWeek', () => {
  it('dates every column from today, including days with nothing airing', () => {
    // 30 August 2026 is a Sunday; the week rolls into September.
    const days = summarizeWeek(grouped({}), WEEK, [], [], [], NOW);

    expect(days.map(d => d.dayOfMonth)).toEqual([30, 31, 1, 2, 3, 4, 5]);
    expect(days[0].isToday).toBe(true);
    expect(days.slice(1).every(d => !d.isToday)).toBe(true);
    expect(days.every(d => d.total === 0 && d.pips.length === 0)).toBe(true);
  });

  it('separates behind, caught-up, stacking and untracked shows', () => {
    const days = summarizeWeek(
      grouped({ Tuesday: [show(1), show(2), show(3), show(4)] }),
      WEEK,
      [1, 2], // watching
      [3], // stacking
      logsThrough(1, 5), // show 1 is caught up through the aired episode 5
      NOW,
    );

    const tuesday = days.find(d => d.day === 'Tuesday')!;
    expect(tuesday.total).toBe(4);
    expect(tuesday.mine).toBe(3);
    expect(tuesday.behind).toBe(1);
    // Sorted by PIP_ORDER, whatever order the shows arrived in.
    expect(tuesday.pips).toEqual(['behind', 'mine', 'stacking', 'other']);
  });

  it('never reports a stacking show as behind — piling up is the point', () => {
    const days = summarizeWeek(
      grouped({ Monday: [show(9)] }),
      WEEK,
      [],
      [9],
      [], // nothing logged, five episodes aired
      NOW,
    );

    const monday = days.find(d => d.day === 'Monday')!;
    expect(monday.mine).toBe(1);
    expect(monday.behind).toBe(0);
    expect(monday.pips).toEqual(['stacking']);
  });

  it('trims pips past the cap but keeps the total honest', () => {
    const heavy = Array.from({ length: MAX_PIPS + 5 }, (_, i) => show(100 + i));
    const days = summarizeWeek(grouped({ Saturday: heavy }), WEEK, [104], [], [], NOW);

    const saturday = days.find(d => d.day === 'Saturday')!;
    expect(saturday.total).toBe(MAX_PIPS + 5);
    expect(saturday.pips).toHaveLength(MAX_PIPS);
    expect(saturday.overflow).toBe(5);
    // The trim takes from the tail, so the one show that is yours survives it.
    expect(saturday.pips[0]).toBe('behind');
  });

  it('counts an untracked-only day as jumpable but not yours', () => {
    const days = summarizeWeek(grouped({ Friday: [show(1), show(2)] }), WEEK, [], [], [], NOW);

    const friday = days.find(d => d.day === 'Friday')!;
    expect(friday.total).toBe(2);
    expect(friday.mine).toBe(0);
    expect(friday.behind).toBe(0);
    expect(friday.pips).toEqual(['other', 'other']);
  });
});
