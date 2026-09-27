import { describe, expect, it } from 'vitest';
import type { AnimeMedia, EpisodeLog, LibraryEntry } from '../types';
import {
  buildOnboardingPlan,
  isLongRunner,
  onboardingSteps,
  pickerMeta,
  pickerSections,
  shouldAutoOpen,
} from './onboarding';
import { rankUpNext } from './upNext';

const NOW = 1_790_500_000; // 2026-09-27, fixed unix seconds; the module is clock-free
const DAY = 24 * 3600;

interface ShowOpts {
  id: number;
  /** Episodes out: nextAiringEpisode is set so exactly this many have aired. */
  aired?: number;
  /** Seconds until the next episode airs. */
  nextIn?: number;
  /** null → no next episode at all. */
  next?: null;
  status?: string;
  format?: string;
  trending?: number | null;
  averageScore?: number | null;
  start?: { year: number | null; month: number | null; day: number | null } | null;
  title?: string;
  romaji?: string;
}

function show({
  id,
  aired = 3,
  nextIn = 3 * DAY,
  next,
  status = 'RELEASING',
  format = 'TV',
  trending = 10,
  averageScore = 75,
  start = { year: 2026, month: 7, day: 5 },
  title = `Show ${id}`,
  romaji,
}: ShowOpts): AnimeMedia {
  return {
    id,
    idMal: id + 1000,
    averageScore,
    title: { romaji: romaji ?? title, english: title, userPreferred: title },
    bannerImage: null,
    coverImage: { large: `https://example.test/${id}.jpg`, color: null },
    startDate: start,
    nextAiringEpisode:
      next === null ? null : { airingAt: NOW + nextIn, timeUntilAiring: nextIn, episode: aired + 1 },
    status,
    format,
    episodes: 12,
    externalLinks: [],
    genres: [],
    trending,
  };
}

const ids = (list: { anime: AnimeMedia }[]) => list.map((s) => s.anime.id);

describe('onboardingSteps', () => {
  it('runs the whole flow from a first visit, asking about progress only when needed', () => {
    expect(onboardingSteps('welcome', true)).toEqual(['welcome', 'pick', 'catchUp', 'tour']);
    expect(onboardingSteps('welcome', false)).toEqual(['welcome', 'pick', 'tour']);
  });

  it('keeps the Settings entry points to what they name', () => {
    expect(onboardingSteps('pick', true)).toEqual(['pick', 'catchUp']);
    expect(onboardingSteps('pick', false)).toEqual(['pick']);
    expect(onboardingSteps('tour', true)).toEqual(['tour']);
  });
});

describe('shouldAutoOpen', () => {
  const fresh = {
    libraryCount: 0,
    logCount: 0,
    uiPrefs: {},
    pathname: '/schedule',
    hasShowParam: false,
  };

  it('opens for a brand-new visitor on the schedule', () => {
    expect(shouldAutoOpen(fresh)).toBe(true);
    expect(shouldAutoOpen({ ...fresh, pathname: '/' })).toBe(true);
  });

  it('never opens for someone who has used the app', () => {
    expect(shouldAutoOpen({ ...fresh, libraryCount: 1 })).toBe(false);
    // "Still deciding": ratings with no library entry are still use.
    expect(shouldAutoOpen({ ...fresh, logCount: 2 })).toBe(false);
    expect(shouldAutoOpen({ ...fresh, uiPrefs: { onboarded: true } })).toBe(false);
    expect(shouldAutoOpen({ ...fresh, uiPrefs: { welcomeDismissed: true } })).toBe(false);
  });

  it('never hijacks a shared link or another page', () => {
    expect(shouldAutoOpen({ ...fresh, hasShowParam: true })).toBe(false);
    expect(shouldAutoOpen({ ...fresh, pathname: '/series/21' })).toBe(false);
    expect(shouldAutoOpen({ ...fresh, pathname: '/library' })).toBe(false);
  });
});

describe('isLongRunner', () => {
  it('flags a years-old show deep into its run', () => {
    expect(isLongRunner(show({ id: 1, aired: 1180, start: { year: 1999, month: 10, day: 20 } }), NOW)).toBe(true);
    expect(isLongRunner(show({ id: 2, aired: 40, start: null }), NOW)).toBe(true);
  });

  it('leaves a year-long show that started this year alone', () => {
    // Precure-style: episode 36, but it only began in February.
    expect(isLongRunner(show({ id: 3, aired: 35, start: { year: 2026, month: 2, day: 1 } }), NOW)).toBe(false);
    expect(isLongRunner(show({ id: 4, aired: 12, start: { year: 2020, month: 1, day: 1 } }), NOW)).toBe(false);
  });
});

describe('pickerSections', () => {
  const section = (sections: ReturnType<typeof pickerSections>, id: string) => sections.find((s) => s.id === id)!;

  it('splits airing from premiering on the aired count, most talked-about first', () => {
    const sections = pickerSections({
      schedule: [
        show({ id: 1, aired: 7, trending: 50 }),
        show({ id: 2, aired: 0, nextIn: 2 * DAY }),
        show({ id: 3, aired: 2, trending: 400 }),
        show({ id: 4, aired: 9, trending: null, averageScore: 90 }),
        show({ id: 5, aired: 9, trending: null, averageScore: 60 }),
      ],
      library: {},
      nowSec: NOW,
    });
    expect(ids(section(sections, 'airing').shows)).toEqual([3, 1, 4, 5]);
    expect(ids(section(sections, 'premiering').shows)).toEqual([2]);
    expect(section(sections, 'airing').shows[1].aired).toBe(7);
  });

  it('counts a stale episode 1 whose air time has passed as airing', () => {
    // The bundle is up to 8h old: episode 1 still "next", but already out.
    const stale = show({ id: 1, aired: 0, nextIn: -2 * 3600 });
    const sections = pickerSections({ schedule: [stale], library: {}, nowSec: NOW });
    expect(ids(section(sections, 'airing').shows)).toEqual([1]);
    expect(section(sections, 'airing').shows[0].aired).toBe(1);
  });

  it('drops movies, shows on a break, and long-runners unless the filter names them', () => {
    const schedule = [
      show({ id: 1, format: 'MOVIE' }),
      show({ id: 2, next: null }),
      show({ id: 3, aired: 1180, start: { year: 1999, month: 10, day: 20 }, title: 'ONE PIECE' }),
      show({ id: 4, format: 'ONA' }),
      show({ id: 5, format: 'TV_SHORT' }),
    ];
    expect(ids(section(pickerSections({ schedule, library: {}, nowSec: NOW }), 'airing').shows)).toEqual([4, 5]);

    const searched = pickerSections({ schedule, library: {}, nowSec: NOW, term: '  one pi ' });
    expect(ids(section(searched, 'airing').shows)).toEqual([3]);
  });

  it('matches the filter against every title the show has', () => {
    const schedule = [show({ id: 1, title: 'Frieren', romaji: 'Sousou no Frieren' }), show({ id: 2 })];
    const sections = pickerSections({ schedule, library: {}, nowSec: NOW, term: 'sousou' });
    expect(ids(section(sections, 'airing').shows)).toEqual([1]);
  });

  it('adds next season without repeating what the schedule already carries', () => {
    const early = show({ id: 10, aired: 1 });
    const sections = pickerSections({
      schedule: [early],
      nextSeason: [
        early,
        show({ id: 11, aired: 0, nextIn: 5 * DAY, status: 'NOT_YET_RELEASED', trending: 5 }),
        show({ id: 12, next: null, status: 'NOT_YET_RELEASED', trending: 30, start: { year: 2026, month: 11, day: null } }),
        show({ id: 13, next: null, status: 'RELEASING' }),
        show({ id: 14, format: 'MOVIE', status: 'NOT_YET_RELEASED' }),
      ],
      library: {},
      nowSec: NOW,
    });
    expect(ids(section(sections, 'airing').shows)).toEqual([10]);
    expect(ids(section(sections, 'next').shows)).toEqual([12, 11]);
  });

  it('marks shows already in the library', () => {
    const library: Record<number, LibraryEntry> = {
      1: { showId: 1, idMal: null, status: 'stacking', showScore: null, source: 'manual' },
    };
    const sections = pickerSections({ schedule: [show({ id: 1 }), show({ id: 2 })], library, nowSec: NOW });
    const shows = section(sections, 'airing').shows;
    expect(shows.find((s) => s.anime.id === 1)?.libraryStatus).toBe('stacking');
    expect(shows.find((s) => s.anime.id === 2)?.libraryStatus).toBeNull();
  });
});

describe('pickerMeta', () => {
  it('describes each kind of show', () => {
    const [airing] = pickerSections({ schedule: [show({ id: 1, aired: 7 })], library: {}, nowSec: NOW });
    expect(pickerMeta(airing.shows[0])).toEqual({ kind: 'aired', count: 7 });
    expect(pickerMeta({ anime: show({ id: 2, aired: 0 }), aired: 0, libraryStatus: null })).toEqual({
      kind: 'starts',
      airingAt: NOW + 3 * DAY,
    });
    expect(
      pickerMeta({
        anime: show({ id: 3, next: null, start: { year: 2026, month: 11, day: 6 } }),
        aired: 0,
        libraryStatus: null,
      }),
    ).toEqual({ kind: 'startDate', month: 11, day: 6 });
    expect(pickerMeta({ anime: show({ id: 4, next: null, start: null }), aired: 0, libraryStatus: null })).toEqual({
      kind: 'unannounced',
    });
  });
});

describe('buildOnboardingPlan', () => {
  const midSeason = show({ id: 1, aired: 7 });
  const premiering = show({ id: 2, aired: 0 });
  const animeById = new Map([midSeason, premiering].map((a) => [a.id, a]));

  it('adds every pick as watching, with the MAL id carried over', () => {
    const plan = buildOnboardingPlan({
      picks: [
        { showId: 1, through: 0 },
        { showId: 2, through: 0 },
      ],
      animeById,
      library: {},
      logs: {},
      nowSec: NOW,
    });
    expect(plan.entries).toEqual([
      { showId: 1, idMal: 1001, status: 'watching', showScore: null, source: 'manual', updatedAt: NOW * 1000 },
      { showId: 2, idMal: 1002, status: 'watching', showScore: null, source: 'manual', updatedAt: NOW * 1000 },
    ]);
    expect(plan.logs).toEqual([]);
  });

  it('backfills 1..N with an unknown watch time, clamped to what has aired', () => {
    const caughtUp = buildOnboardingPlan({ picks: [{ showId: 1, through: 7 }], animeById, library: {}, logs: {}, nowSec: NOW });
    expect(caughtUp.logs.map((l) => l.episodeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(caughtUp.logs.every((l) => l.watchedAt === 0 && l.score === null && l.showId === 1)).toBe(true);

    const partway = buildOnboardingPlan({ picks: [{ showId: 1, through: 3 }], animeById, library: {}, logs: {}, nowSec: NOW });
    expect(partway.logs.map((l) => l.episodeNumber)).toEqual([1, 2, 3]);

    const tooFar = buildOnboardingPlan({ picks: [{ showId: 1, through: 40 }], animeById, library: {}, logs: {}, nowSec: NOW });
    expect(tooFar.logs).toHaveLength(7);

    // Nothing has aired, so "caught up" writes nothing.
    const unaired = buildOnboardingPlan({ picks: [{ showId: 2, through: 5 }], animeById, library: {}, logs: {}, nowSec: NOW });
    expect(unaired.logs).toEqual([]);
  });

  it('never overwrites a library entry or an existing rating', () => {
    const library: Record<number, LibraryEntry> = {
      2: { showId: 2, idMal: null, status: 'stacking', showScore: 9, source: 'manual' },
    };
    const logs: Record<string, EpisodeLog> = {
      '1:2': { showId: 1, episodeNumber: 2, watchedAt: 123, score: 8 },
    };
    const plan = buildOnboardingPlan({
      picks: [
        { showId: 1, through: 3 },
        { showId: 2, through: 0 },
      ],
      animeById,
      library,
      logs,
      nowSec: NOW,
    });
    expect(plan.entries.map((e) => e.showId)).toEqual([1]);
    expect(plan.logs.map((l) => l.episodeNumber)).toEqual([1, 3]);
  });

  it('leaves a partway show in the deck as a backlog, not a hot streak', () => {
    // The reason watchedAt is 0: a "now" stamp would read as a binge this week,
    // and a fixed old one would fall out of the deck's 3-week staleness gate.
    const plan = buildOnboardingPlan({ picks: [{ showId: 1, through: 3 }], animeById, library: {}, logs: {}, nowSec: NOW });
    for (const nowSec of [NOW, NOW + 30 * DAY]) {
      const [candidate] = rankUpNext({ animeList: [midSeason], library: plan.entries, logs: plan.logs, nowSec });
      expect(candidate?.anime.id).toBe(1);
      expect(candidate.reason.kind).not.toBe('momentum');
      expect(candidate.nextEpisode).toBe(4);
    }
  });
});
