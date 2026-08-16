import { describe, expect, it } from 'vitest';
import type { AnimeMedia, EpisodeLog, LibraryEntry } from '../types';
import { isBingeReady, rankUpNext } from './upNext';

const NOW = 1_800_000_000; // fixed unix seconds; the module is clock-free
const NOW_MS = NOW * 1000;
const DAY = 24 * 3600;
const DAY_MS = DAY * 1000;

interface ShowOpts {
  id: number;
  /** Sets nextAiringEpisode so exactly this many episodes have aired. */
  aired: number;
  /** Seconds until the next episode airs. Default: a comfortable 5 days out. */
  nextIn?: number;
  status?: AnimeMedia['status'];
  episodes?: number;
}

function show({ id, aired, nextIn = 5 * DAY, status = 'RELEASING', episodes = 24 }: ShowOpts): AnimeMedia {
  return {
    id,
    idMal: id,
    averageScore: 80,
    title: { romaji: `Show ${id}`, english: `Show ${id}`, userPreferred: `Show ${id}` },
    bannerImage: null,
    coverImage: { large: 'https://example.test/cover.jpg', color: null },
    startDate: { year: 2026, month: 1, day: 1 },
    nextAiringEpisode:
      status === 'FINISHED'
        ? null
        : { airingAt: NOW + nextIn, timeUntilAiring: nextIn, episode: aired + 1 },
    status,
    format: 'TV',
    episodes,
    externalLinks: [],
    genres: ['Action'],
  };
}

function entry(showId: number, status: LibraryEntry['status'], stackWakeCount?: number): LibraryEntry {
  const e: LibraryEntry = { showId, idMal: showId, status, showScore: null, source: 'manual' };
  if (stackWakeCount !== undefined) e.stackWakeCount = stackWakeCount;
  return e;
}

function logsThrough(
  showId: number,
  n: number,
  { score = null, watchedAt = NOW_MS - 2 * DAY_MS }: { score?: number | null; watchedAt?: number } = {},
): EpisodeLog[] {
  return Array.from({ length: n }, (_, i) => ({
    showId,
    episodeNumber: i + 1,
    watchedAt,
    score,
  }));
}

describe('rankUpNext admission', () => {
  it('excludes caught-up shows — nothing to watch is not a pick', () => {
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 8 })],
      library: [entry(1, 'watching')],
      logs: logsThrough(1, 8),
      nowSec: NOW,
    });
    expect(result).toEqual([]);
  });

  it('excludes non-watching, non-stacking statuses', () => {
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 8 })],
      library: [entry(1, 'on_hold'), entry(1, 'plan_to_watch')],
      logs: [],
      nowSec: NOW,
    });
    expect(result).toEqual([]);
  });

  it('drops a stale show (last log > 3 weeks ago) from the deck', () => {
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 10 })],
      library: [entry(1, 'watching')],
      logs: logsThrough(1, 4, { watchedAt: NOW_MS - 25 * DAY_MS }),
      nowSec: NOW,
    });
    expect(result).toEqual([]);
  });

  it('keeps a never-started watching show — no logs means no staleness signal', () => {
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 6 })],
      library: [entry(1, 'watching')],
      logs: [],
      nowSec: NOW,
    });
    expect(result).toHaveLength(1);
    expect(result[0].reason.kind).toBe('backlog');
    expect(result[0].nextEpisode).toBe(1);
  });
});

describe('rankUpNext reasons', () => {
  it('flags urgency when 1-2 behind and the next episode airs within 48h', () => {
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 8, nextIn: 20 * 3600 })],
      library: [entry(1, 'watching')],
      logs: logsThrough(1, 6),
      nowSec: NOW,
    });
    expect(result[0].reason.kind).toBe('urgency');
    expect(result[0].reason.text).toContain('2 behind');
    expect(result[0].reason.text).toContain('Airs in 20h');
  });

  it('does not flag urgency when too far behind to clear tonight', () => {
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 8, nextIn: 20 * 3600 })],
      library: [entry(1, 'watching')],
      logs: logsThrough(1, 2),
      nowSec: NOW,
    });
    expect(result[0].reason.kind).toBe('backlog');
  });

  it('flags momentum at 3+ episodes within the last week', () => {
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 10 })],
      library: [entry(1, 'watching')],
      logs: logsThrough(1, 4, { watchedAt: NOW_MS - 1 * DAY_MS }),
      nowSec: NOW,
    });
    expect(result[0].reason.kind).toBe('momentum');
    expect(result[0].reason.text).toContain('4 episodes this week');
  });

  it('flags the finish line on a FINISHED show with ≤3 left, wording the finale case', () => {
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 0, status: 'FINISHED', episodes: 12 })],
      library: [entry(1, 'watching')],
      // Logs sit outside the momentum window so the finale pull stands alone.
      logs: logsThrough(1, 11, { watchedAt: NOW_MS - 10 * DAY_MS }),
      nowSec: NOW,
    });
    expect(result[0].reason.kind).toBe('finish-line');
    expect(result[0].reason.text).toBe('Season finished · just the finale left');
  });

  it('flags affinity at a 8.5+ average across 3+ rated episodes', () => {
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 10 })],
      library: [entry(1, 'watching')],
      logs: logsThrough(1, 4, { score: 9, watchedAt: NOW_MS - 10 * DAY_MS }),
      nowSec: NOW,
    });
    expect(result[0].reason.kind).toBe('affinity');
    expect(result[0].reason.text).toContain('Your 9.0 average');
  });
});

describe('rankUpNext stacking', () => {
  it('surfaces a binge-ready stacked show (FINISHED season) above everything', () => {
    const result = rankUpNext({
      animeList: [
        show({ id: 1, aired: 8, nextIn: 20 * 3600 }), // urgent watching show
        show({ id: 2, aired: 0, status: 'FINISHED', episodes: 12 }),
      ],
      library: [entry(1, 'watching'), entry(2, 'stacking')],
      logs: logsThrough(1, 6),
      nowSec: NOW,
    });
    expect(result.map((c) => c.anime.id)).toEqual([2, 1]);
    expect(result[0].reason.kind).toBe('binge-ready');
    expect(result[0].reason.text).toBe('Season complete · 12 episodes ready');
  });

  it('wakes a stacked show when the episode-count condition is met', () => {
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 6 })],
      library: [entry(1, 'stacking', 6)],
      logs: [],
      nowSec: NOW,
    });
    expect(result).toHaveLength(1);
    expect(result[0].reason.text).toBe('6 episodes stacked — ready to binge');
  });

  it('keeps a still-stacking show out of the deck', () => {
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 5 })],
      library: [entry(1, 'stacking', 6)],
      logs: [],
      nowSec: NOW,
    });
    expect(result).toEqual([]);
  });

  it('never wakes a releasing stacked show without a wake count', () => {
    const anime = show({ id: 1, aired: 11 });
    expect(isBingeReady(entry(1, 'stacking'), anime, NOW)).toBe(false);
    expect(isBingeReady(entry(1, 'stacking', 8), anime, NOW)).toBe(true);
    expect(isBingeReady(entry(1, 'watching', 8), anime, NOW)).toBe(false);
  });

  it('wakes a no-wake-count stack the moment the finale airs, before FINISHED lands', () => {
    // The stale-signal shape the drop cards live by: nextAiringEpisode still
    // points AT the finale with its airingAt in the past.
    const anime = show({ id: 1, aired: 11, nextIn: -3600, episodes: 12 });
    expect(isBingeReady(entry(1, 'stacking'), anime, NOW)).toBe(true);
  });
});

describe('rankUpNext ordering', () => {
  it('orders urgency over momentum over backlog, deterministically', () => {
    const result = rankUpNext({
      animeList: [
        show({ id: 1, aired: 10 }), // plain backlog
        show({ id: 2, aired: 8, nextIn: 10 * 3600 }), // urgent
        show({ id: 3, aired: 10 }), // momentum
      ],
      library: [entry(1, 'watching'), entry(2, 'watching'), entry(3, 'watching')],
      logs: [
        ...logsThrough(1, 2, { watchedAt: NOW_MS - 15 * DAY_MS }),
        ...logsThrough(2, 7),
        ...logsThrough(3, 5, { watchedAt: NOW_MS - 1 * DAY_MS }),
      ],
      nowSec: NOW,
    });
    expect(result.map((c) => c.anime.id)).toEqual([2, 3, 1]);
  });

  it('reports progress fields the deck renders directly', () => {
    const [c] = rankUpNext({
      animeList: [show({ id: 1, aired: 9 })],
      library: [entry(1, 'watching')],
      logs: logsThrough(1, 7, { score: 8 }),
      nowSec: NOW,
    });
    expect(c.nextEpisode).toBe(8);
    expect(c.behindCount).toBe(2);
    expect(c.airedCount).toBe(9);
    expect(c.userAvgScore).toBe(8);
  });
});
