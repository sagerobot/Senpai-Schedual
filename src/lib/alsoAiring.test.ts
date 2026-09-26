import { describe, expect, it } from 'vitest';
import type { AnimeMedia, EpisodeLog, LibraryEntry, LibraryStatus } from '../types';
import {
  alsoAiringKind,
  computeAlsoAiring,
  computePulse,
  PULSE_MAX_BARS,
  UPCOMING_WINDOW_SEC,
  type Tone,
  type VibeLookup,
} from './alsoAiring';
import { DROP_WINDOW_SEC } from './freshness';
import { vibeKey, type VibeAspects, type VibeEntry } from './vibesFile';

const NOW = 1_800_000_000; // fixed unix seconds; the module is clock-free
const HOUR = 3600;
const DAY = 24 * HOUR;

interface ShowOpts {
  id: number;
  title?: string;
  /** Seconds from NOW until nextAiringEpisode airs (negative = already aired, stale data). */
  in: number;
  episode?: number;
  format?: string | null;
  averageScore?: number | null;
}

function show({ id, title = `Show ${id}`, in: nextIn, episode = 6, format = 'TV', averageScore = 80 }: ShowOpts): AnimeMedia {
  return {
    id,
    idMal: id,
    averageScore,
    title: { romaji: title, english: title, userPreferred: title },
    bannerImage: null,
    coverImage: { large: 'https://example.test/cover.jpg', color: null },
    startDate: { year: 2026, month: 1, day: 1 },
    nextAiringEpisode: { airingAt: NOW + nextIn, timeUntilAiring: nextIn, episode },
    status: 'RELEASING',
    format,
    episodes: 12,
    externalLinks: [],
    genres: ['Action'],
  };
}

function lib(entries: Record<number, LibraryStatus>): Record<number, LibraryEntry> {
  const out: Record<number, LibraryEntry> = {};
  for (const [id, status] of Object.entries(entries)) {
    out[Number(id)] = { showId: Number(id), idMal: null, status, showScore: null, source: 'manual' };
  }
  return out;
}

function log(showId: number, episodeNumber: number, score: number | null = null): EpisodeLog {
  return { showId, episodeNumber, watchedAt: NOW * 1000, score };
}

const NONE = new Set<number>();
const TV_ONLY = { includeMovies: false };

function ids(list: AnimeMedia[], library = {}, logs: EpisodeLog[] = [], exclude = NONE, opts: Parameters<typeof computeAlsoAiring>[5] = TV_ONLY): number[] {
  return computeAlsoAiring(list, library, logs, NOW, exclude, opts).entries.map((e) => e.anime.id);
}

describe('computeAlsoAiring admission', () => {
  it('skips watching shows — those are drops and runway', () => {
    expect(ids([show({ id: 1, in: -HOUR }), show({ id: 2, in: -HOUR })], lib({ 1: 'watching' }))).toEqual([2]);
  });

  it('honors the exclude set', () => {
    expect(ids([show({ id: 1, in: -HOUR }), show({ id: 2, in: -HOUR })], {}, [], new Set([2]))).toEqual([1]);
  });

  it('filters movies unless includeMovies', () => {
    const list = [show({ id: 1, in: -HOUR, format: 'MOVIE' }), show({ id: 2, in: -HOUR })];
    expect(ids(list)).toEqual([2]);
    expect(ids(list, {}, [], NONE, { includeMovies: true })).toEqual([1, 2]);
  });

  it('keeps only shows on a selected streaming source, like the week grid', () => {
    const on = (id: number, site: string): AnimeMedia => ({
      ...show({ id, in: -HOUR }),
      externalLinks: [{ url: `https://example.test/${id}`, site, icon: null, color: null }],
    });
    const list = [on(1, 'Crunchyroll'), on(2, 'Netflix'), show({ id: 3, in: -HOUR })];
    expect(ids(list, {}, [], NONE, { includeMovies: false, sources: ['Netflix'] })).toEqual([2]);
    expect(ids(list, {}, [], NONE, { includeMovies: false, sources: [] })).toEqual([1, 2, 3]);
  });

  it('leaves out a premiere AniList only implies', () => {
    // next is episode 2, six days out: "episode 1 aired a day ago" is a guess.
    expect(ids([show({ id: 1, in: 6 * 24 * HOUR, episode: 2 })])).toEqual([]);
  });

  it('dedupes by id', () => {
    expect(ids([show({ id: 1, in: -HOUR }), show({ id: 1, in: -HOUR })])).toEqual([1]);
  });

  it('skips a show with no next episode', () => {
    expect(ids([{ ...show({ id: 1, in: -HOUR }), nextAiringEpisode: null }])).toEqual([]);
  });
});

describe('computeAlsoAiring placement', () => {
  const place = (a: AnimeMedia) => computeAlsoAiring([a], {}, [], NOW, NONE, TV_ONLY).entries[0];

  it('an episode inside the upcoming window is upcoming', () => {
    expect(place(show({ id: 1, in: 2 * HOUR, episode: 6 }))).toMatchObject({
      episode: 6,
      airingAt: NOW + 2 * HOUR,
      aired: false,
    });
    expect(place(show({ id: 1, in: UPCOMING_WINDOW_SEC }))?.aired).toBe(false);
  });

  it('an upcoming episode is never reported as its predecessor having aired', () => {
    const entry = place(show({ id: 1, in: 2 * HOUR, episode: 6 }));
    expect(entry.aired).toBe(false);
    expect(entry.episode).toBe(6);
  });

  it('stale data: a next episode with a past airingAt is aired', () => {
    expect(place(show({ id: 1, in: -3 * HOUR, episode: 6 }))).toMatchObject({
      episode: 6,
      airingAt: NOW - 3 * HOUR,
      aired: true,
    });
  });

  it('estimated branch inside the drop window counts as aired', () => {
    // next airs in 6d23h → estimated previous aired 1h ago
    expect(place(show({ id: 1, in: 7 * DAY - HOUR, episode: 6 }))).toMatchObject({
      episode: 5,
      airingAt: NOW - HOUR,
      aired: true,
    });
  });

  it('estimated branch landing in the future is skipped (lower bound)', () => {
    // next airs in 7d+1h → outside upcoming window; estimated previous "aired" 1h from now
    expect(place(show({ id: 1, in: 7 * DAY + HOUR, episode: 6 }))).toBeUndefined();
  });

  it('beyond the upcoming window or past the drop window is skipped', () => {
    expect(place(show({ id: 1, in: UPCOMING_WINDOW_SEC + 1, episode: 1 }))).toBeUndefined();
    expect(place(show({ id: 1, in: -(DROP_WINDOW_SEC + 1) }))).toBeUndefined();
    expect(place(show({ id: 1, in: -DROP_WINDOW_SEC }))?.aired).toBe(true);
    // estimated previous aired 3 days ago
    expect(place(show({ id: 1, in: 4 * DAY, episode: 6 }))).toBeUndefined();
  });

  it('flags a premiere', () => {
    expect(place(show({ id: 1, in: HOUR, episode: 1 })).premiere).toBe(true);
    expect(place(show({ id: 1, in: HOUR, episode: 2 })).premiere).toBe(false);
  });
});

describe('computeAlsoAiring card fields', () => {
  it('maps library status to kind', () => {
    expect(alsoAiringKind('stacking')).toBe('stacking');
    expect(alsoAiringKind('dropped')).toBe('dropped');
    for (const s of [null, 'plan_to_watch', 'completed', 'on_hold'] as const) {
      expect(alsoAiringKind(s)).toBe('discover');
    }
    const row = computeAlsoAiring(
      [show({ id: 1, in: -HOUR }), show({ id: 2, in: -2 * HOUR }), show({ id: 3, in: -3 * HOUR })],
      lib({ 1: 'stacking', 2: 'dropped' }),
      [],
      NOW,
      NONE,
      TV_ONLY,
    );
    const byId = Object.fromEntries(row.entries.map((e) => [e.anime.id, e]));
    expect(byId[1]).toMatchObject({ kind: 'stacking', status: 'stacking' });
    expect(byId[2]).toMatchObject({ kind: 'dropped', status: 'dropped' });
    expect(byId[3]).toMatchObject({ kind: 'discover', status: null });
  });

  it('derives watch progress, stack and last rating from the logs', () => {
    const logs = [log(1, 1, 8), log(1, 3, null), log(1, 2, 7), log(2, 4, 9)];
    const row = computeAlsoAiring(
      [show({ id: 1, in: -HOUR, episode: 6 }), show({ id: 3, in: HOUR, episode: 6 })],
      lib({ 1: 'stacking' }),
      logs,
      NOW,
      NONE,
      TV_ONLY,
    );
    const [aired, upcoming] = row.entries;
    expect(aired).toMatchObject({
      maxWatched: 3,
      firstUnwatched: 4,
      stackWaiting: 3, // 6 aired − 3 watched
      lastRating: { episode: 2, score: 7 }, // ep 3 is unrated
    });
    expect(upcoming).toMatchObject({
      maxWatched: 0,
      firstUnwatched: 1,
      stackWaiting: 5, // ep 6 not aired yet → 5 aired
      lastRating: null,
    });
  });

  it('keeps a 0 score as a rating and never lets the stack go negative', () => {
    const row = computeAlsoAiring([show({ id: 1, in: HOUR, episode: 3 })], {}, [log(1, 1, 0), log(1, 5)], NOW, NONE, TV_ONLY);
    expect(row.entries[0]).toMatchObject({ stackWaiting: 0, lastRating: { episode: 1, score: 0 } });
  });
});

describe('computeAlsoAiring order', () => {
  it('sorts by air time, ties by title, and puts the NOW line before the first upcoming', () => {
    const row = computeAlsoAiring(
      [
        show({ id: 1, title: 'Zeta', in: 2 * HOUR }),
        show({ id: 2, title: 'Beta', in: -HOUR }),
        show({ id: 3, title: 'Alpha', in: -HOUR }),
        show({ id: 4, title: 'Gamma', in: -5 * HOUR }),
        show({ id: 5, title: 'Delta', in: HOUR }),
      ],
      {},
      [],
      NOW,
      NONE,
      TV_ONLY,
    );
    expect(row.entries.map((e) => e.anime.id)).toEqual([4, 3, 2, 5, 1]);
    expect(row.nowIndex).toBe(3);
  });

  it('nowIndex is entries.length when nothing is upcoming, 0 when all are', () => {
    expect(computeAlsoAiring([show({ id: 1, in: -HOUR })], {}, [], NOW, NONE, TV_ONLY).nowIndex).toBe(1);
    expect(computeAlsoAiring([show({ id: 1, in: HOUR })], {}, [], NOW, NONE, TV_ONLY).nowIndex).toBe(0);
    expect(computeAlsoAiring([], {}, [], NOW, NONE, TV_ONLY)).toEqual({ entries: [], nowIndex: 0 });
  });
});

// ---------------------------------------------------------------------------
// Pulse
// ---------------------------------------------------------------------------

const SHOW_ID = 1;

function found(episode: number, indicator: Tone, extra: { aspects?: VibeAspects; comments?: number } = {}): VibeEntry {
  return {
    showId: SHOW_ID,
    episode,
    airedAt: 0,
    asOf: '2026-09-01T00:00:00Z',
    settled: true,
    status: 'found',
    summary: 'summary',
    goods: [],
    bads: [],
    indicator,
    aspects: extra.aspects,
    upvotes: 10,
    comments: extra.comments ?? 100,
    url: 'https://www.reddit.com/r/anime/comments/x',
  };
}

function quiet(episode: number): VibeEntry {
  return {
    showId: SHOW_ID,
    episode,
    airedAt: 0,
    asOf: '2026-09-01T00:00:00Z',
    settled: true,
    status: 'quiet',
    upvotes: 1,
    comments: 3,
    url: 'https://www.reddit.com/r/anime/comments/y',
  };
}

function lookup(entries: VibeEntry[]): VibeLookup {
  const map = new Map(entries.map((e) => [vibeKey(e.showId, e.episode), e]));
  return { get: (showId, episode) => map.get(vibeKey(showId, episode)) };
}

/** Found readings for episodes 1..n from a tone string: p/m/n, '.' = no reading. */
function tones(pattern: string): VibeLookup {
  const code: Record<string, Tone> = { p: 'positive', m: 'mixed', n: 'negative' };
  return lookup([...pattern].flatMap((c, i) => (code[c] ? [found(i + 1, code[c])] : [])));
}

const pulseShow = (averageScore: number | null = 86) => show({ id: SHOW_ID, in: HOUR, averageScore });

describe('computePulse bars', () => {
  it('one bar per episode, oldest first, null where there is no found reading', () => {
    const pulse = computePulse(pulseShow(), 4, lookup([found(1, 'positive'), quiet(2), found(4, 'mixed')]));
    expect(pulse.bars).toEqual([
      { episode: 1, tone: 'positive' },
      { episode: 2, tone: null },
      { episode: 3, tone: null },
      { episode: 4, tone: 'mixed' },
    ]);
    expect(pulse.latestTone).toBe('mixed');
  });

  it('caps at PULSE_MAX_BARS, keeping the newest', () => {
    const pulse = computePulse(pulseShow(), 20, lookup([]));
    expect(pulse.bars).toHaveLength(PULSE_MAX_BARS);
    expect(pulse.bars[0].episode).toBe(20 - PULSE_MAX_BARS + 1);
    expect(pulse.bars[PULSE_MAX_BARS - 1].episode).toBe(20);
  });

  it('no bars below episode 1', () => {
    expect(computePulse(pulseShow(), 0, tones('p')).bars).toEqual([]);
  });

  it('latestTone skips trailing gaps', () => {
    expect(computePulse(pulseShow(), 5, tones('pn...')).latestTone).toBe('negative');
  });
});

describe('computePulse trend', () => {
  const trend = (pattern: string) => computePulse(pulseShow(), pattern.length, tones(pattern)).trend;

  it('rising: two or more positives after a non-positive', () => {
    expect(trend('mnpp')).toEqual({ direction: 'rising', sinceEpisode: 3 });
    expect(trend('ppnppp')).toEqual({ direction: 'rising', sinceEpisode: 4 });
  });

  it('rising ignores gaps between readings', () => {
    expect(trend('m.p.p')).toEqual({ direction: 'rising', sinceEpisode: 3 });
  });

  it('cooling: two or more mixed/negative after a positive', () => {
    expect(trend('ppmn')).toEqual({ direction: 'cooling', sinceEpisode: 3 });
    expect(trend('pnnm')).toEqual({ direction: 'cooling', sinceEpisode: 2 });
  });

  it('null otherwise', () => {
    expect(trend('')).toBeNull();
    expect(trend('pppp')).toBeNull(); // never dipped
    expect(trend('mnmn')).toBeNull(); // never positive
    expect(trend('mp')).toBeNull(); // run of one
    expect(trend('ppn')).toBeNull(); // run of one
  });
});

describe('computePulse aspects and comments', () => {
  it('reads the newest found entry, in ASPECT_ORDER, capped at three', () => {
    const vibes = lookup([
      found(1, 'positive', { aspects: { story: 'negative' }, comments: 50 }),
      found(2, 'mixed', {
        aspects: { sound: 'positive', pacing: 'negative', animation: 'mixed', characters: 'positive' },
        comments: 321,
      }),
      quiet(3),
    ]);
    const pulse = computePulse(pulseShow(), 3, vibes);
    expect(pulse.aspects).toEqual([
      { name: 'characters', tone: 'positive' },
      { name: 'animation', tone: 'mixed' },
      { name: 'pacing', tone: 'negative' },
    ]);
    expect(pulse.comments).toBe(321);
  });

  it('empty aspects and null comments with no found entry', () => {
    const pulse = computePulse(pulseShow(), 2, lookup([quiet(2)]));
    expect(pulse.aspects).toEqual([]);
    expect(pulse.comments).toBeNull();
  });
});

describe('computePulse source', () => {
  it('reddit when any bar has a tone', () => {
    const pulse = computePulse(pulseShow(86), 2, tones('.p'));
    expect(pulse.source).toBe('reddit');
    expect(pulse.anilistScore).toBe(8.6);
  });

  it('anilist when there are no readings but a score', () => {
    const pulse = computePulse(pulseShow(86), 2, lookup([quiet(2)]));
    expect(pulse.source).toBe('anilist');
    expect(pulse.anilistScore).toBe(8.6);
  });

  it('none when there is neither', () => {
    const pulse = computePulse(pulseShow(null), 2, lookup([]));
    expect(pulse.source).toBe('none');
    expect(pulse.anilistScore).toBeNull();
  });
});
