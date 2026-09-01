import { describe, expect, it } from 'vitest';
import type { SeriesGraph } from '../series/labeling';
import type { AnimeMedia, EpisodeLog, LibraryEntry } from '../types';
import { foldSeriesCandidates, isBingeReady, rankUpNext } from './upNext';

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

describe('rankUpNext skipped drops', () => {
  it('boosts a current-week skip above every organic watching signal', () => {
    const result = rankUpNext({
      animeList: [
        show({ id: 1, aired: 8, nextIn: 20 * 3600 }), // urgent watching show
        show({ id: 2, aired: 6 }),
      ],
      library: [entry(1, 'watching'), entry(2, 'watching')],
      logs: [...logsThrough(1, 6), ...logsThrough(2, 5)],
      nowSec: NOW,
      dropSkips: { 2: { episode: 6, skippedAt: NOW_MS - 1 * DAY_MS } },
    });
    expect(result.map((c) => c.anime.id)).toEqual([2, 1]);
    expect(result[0].reason.kind).toBe('skipped-drop');
    expect(result[0].reason.text).toBe('Skipped this week — ready when you are');
  });

  it('keeps a binge-ready graduation above a skipped drop', () => {
    const result = rankUpNext({
      animeList: [
        show({ id: 1, aired: 6 }),
        show({ id: 2, aired: 0, status: 'FINISHED', episodes: 12 }),
      ],
      library: [entry(1, 'watching'), entry(2, 'stacking')],
      logs: logsThrough(1, 5),
      nowSec: NOW,
      dropSkips: { 1: { episode: 6, skippedAt: NOW_MS - 1 * DAY_MS } },
    });
    expect(result.map((c) => c.anime.id)).toEqual([2, 1]);
  });

  it('lets the boost lapse once a newer episode has aired', () => {
    // Episode 7 has aired since the skip of 6 — the new drop owns the surface.
    // Logs sit outside the momentum window so backlog is the only signal left.
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 7 })],
      library: [entry(1, 'watching')],
      logs: logsThrough(1, 5, { watchedAt: NOW_MS - 10 * DAY_MS }),
      nowSec: NOW,
      dropSkips: { 1: { episode: 6, skippedAt: NOW_MS - 2 * DAY_MS } },
    });
    expect(result[0].reason.kind).toBe('backlog');
  });

  it('drops the boost when the skipped episode gets logged', () => {
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 6 })],
      library: [entry(1, 'watching')],
      logs: [
        ...logsThrough(1, 4, { watchedAt: NOW_MS - 10 * DAY_MS }),
        { showId: 1, episodeNumber: 6, watchedAt: NOW_MS, score: null },
      ],
      nowSec: NOW,
      dropSkips: { 1: { episode: 6, skippedAt: NOW_MS - 1 * DAY_MS } },
    });
    expect(result[0].reason.kind).toBe('backlog'); // episode 5 still waiting
  });

  it('lets a live skip bypass the staleness gate', () => {
    // Last log 25 days ago — normally stale — but the skip is a deliberate,
    // dated touch: the show must stay deck-eligible or it vanishes from both
    // drops and deck at once.
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 6 })],
      library: [entry(1, 'watching')],
      logs: logsThrough(1, 3, { watchedAt: NOW_MS - 25 * DAY_MS }),
      nowSec: NOW,
      dropSkips: { 1: { episode: 6, skippedAt: NOW_MS - 1 * DAY_MS } },
    });
    expect(result).toHaveLength(1);
    expect(result[0].reason.kind).toBe('skipped-drop');
  });

  it('keeps a stale skip from resurrecting a stale show', () => {
    // Same stale logs, but the skip is for a superseded episode — the
    // staleness gate applies as before.
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 7 })],
      library: [entry(1, 'watching')],
      logs: logsThrough(1, 3, { watchedAt: NOW_MS - 25 * DAY_MS }),
      nowSec: NOW,
      dropSkips: { 1: { episode: 6, skippedAt: NOW_MS - 6 * DAY_MS } },
    });
    expect(result).toEqual([]);
  });

  it('carries a skipped graduation through the post-finale signal gap', () => {
    // AniList nulled nextAiringEpisode but has not flipped FINISHED yet — the
    // gap the drops' admission pins cover. The recorded finale skip is the
    // proof the finale aired, so the deck candidate must survive it.
    const gap: AnimeMedia = {
      ...show({ id: 1, aired: 11, episodes: 12 }),
      nextAiringEpisode: null,
    };
    const result = rankUpNext({
      animeList: [gap],
      library: [entry(1, 'stacking')],
      logs: [],
      nowSec: NOW,
      dropSkips: { 1: { episode: 12, skippedAt: NOW_MS - 3600 * 1000 } },
    });
    expect(result).toHaveLength(1);
    expect(result[0].reason.kind).toBe('binge-ready');
  });

  it('keeps binge-ready on top of even a worst-case boosted watching sum', () => {
    // Skip + urgency + affinity + a 150-episode bulk catch-up (every log
    // stamped this week) on one show. The momentum cap is what keeps this sum
    // under the graduation — uncapped, momentum alone would be 3300 points —
    // so this fails if the cap is ever removed. The 3000 floor is margin on
    // top; capped sums (≤ ~1760) can't reach even the old 2000.
    const result = rankUpNext({
      animeList: [
        show({ id: 1, aired: 151, nextIn: 1 * 3600, episodes: 200 }),
        show({ id: 2, aired: 0, status: 'FINISHED', episodes: 12 }),
      ],
      library: [entry(1, 'watching'), entry(2, 'stacking')],
      logs: logsThrough(1, 150, { score: 10, watchedAt: NOW_MS - 1 * DAY_MS }),
      nowSec: NOW,
      dropSkips: { 1: { episode: 151, skippedAt: NOW_MS - 1 * DAY_MS } },
    });
    expect(result.map((c) => c.anime.id)).toEqual([2, 1]);
  });

  it('expires a skip nothing supersedes (a finale) after a week', () => {
    const result = rankUpNext({
      animeList: [show({ id: 1, aired: 0, status: 'FINISHED', episodes: 12 })],
      library: [entry(1, 'watching')],
      logs: logsThrough(1, 11, { watchedAt: NOW_MS - 10 * DAY_MS }),
      nowSec: NOW,
      dropSkips: { 1: { episode: 12, skippedAt: NOW_MS - 8 * DAY_MS } },
    });
    expect(result[0].reason.kind).toBe('finish-line');
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

/** A franchise graph in watch order; the first non-attachment id is the root. */
function graph(ids: number[], attachments: number[] = []): SeriesGraph {
  return {
    seriesId: ids[0],
    title: `Show ${ids[0]}`,
    entries: ids.map((id, i) => ({
      id,
      format: attachments.includes(id) ? 'MOVIE' : 'TV',
      startDate: { year: 2020 + i, month: 1, day: 1 },
      seasonLabel: attachments.includes(id) ? 'The Movie' : `Season ${i + 1}`,
      title: i === 0 ? `Show ${id}` : `Show ${ids[0]} Season ${i + 1}`,
      isAttachment: attachments.includes(id),
    })),
  };
}

describe('foldSeriesCandidates', () => {
  it('folds two waiting seasons into one card led by the earlier season', () => {
    const ranked = rankUpNext({
      animeList: [
        show({ id: 1, aired: 15, status: 'FINISHED', episodes: 15 }),
        show({ id: 2, aired: 12, status: 'FINISHED', episodes: 12 }),
      ],
      library: [entry(1, 'watching'), entry(2, 'watching')],
      logs: [],
      nowSec: NOW,
    });
    expect(ranked).toHaveLength(2);

    const folded = foldSeriesCandidates(ranked, [graph([1, 2])]);
    expect(folded).toHaveLength(1);
    const [card] = folded;
    expect(card.anime.id).toBe(1);
    expect(card.nextEpisode).toBe(1);
    // The lead's own progress stays the lead's; the chip carries the total.
    expect(card.behindCount).toBe(15);
    expect(card.reason.kind).toBe('backlog');
    expect(card.reason.text).toBe('2 seasons · 27 waiting');
    expect(card.series).toEqual({
      title: 'Show 1',
      seasonLabel: 'Season 1',
      leadReason: { kind: 'backlog', text: '15 episodes waiting' },
      totalBehind: 27,
      then: [
        expect.objectContaining({ seasonLabel: 'Season 2', nextEpisode: 1, behindCount: 12 }),
      ],
    });
    expect(card.series!.then[0].anime.id).toBe(2);
  });

  it('leads with the earliest season that still has episodes waiting', () => {
    const ranked = rankUpNext({
      animeList: [
        show({ id: 1, aired: 12, status: 'FINISHED', episodes: 12 }),
        show({ id: 2, aired: 12, status: 'FINISHED', episodes: 12 }),
        show({ id: 3, aired: 12, status: 'FINISHED', episodes: 12 }),
      ],
      library: [entry(1, 'watching'), entry(2, 'watching'), entry(3, 'watching')],
      logs: logsThrough(1, 12),
      nowSec: NOW,
    });
    // Season 1 is caught up, so it isn't a candidate at all.
    expect(ranked.map((c) => c.anime.id).sort()).toEqual([2, 3]);

    const [card] = foldSeriesCandidates(ranked, [graph([1, 2, 3])]);
    expect(card.anime.id).toBe(2);
    expect(card.series?.seasonLabel).toBe('Season 2');
    expect(card.series?.then.map((q) => q.anime.id)).toEqual([3]);
  });

  it("keeps the best member's score and explains it with that season's label", () => {
    const ranked = rankUpNext({
      animeList: [
        show({ id: 1, aired: 12, status: 'FINISHED', episodes: 12 }),
        show({ id: 2, aired: 12, status: 'FINISHED', episodes: 12 }),
        show({ id: 9, aired: 8, nextIn: 20 * 3600 }),
      ],
      library: [entry(1, 'watching'), entry(2, 'stacking'), entry(9, 'watching')],
      logs: [...logsThrough(1, 9, { watchedAt: NOW_MS - 10 * DAY_MS }), ...logsThrough(9, 6)],
      nowSec: NOW,
    });
    const folded = foldSeriesCandidates(ranked, [graph([1, 2])]);
    expect(folded.map((c) => c.anime.id)).toEqual([1, 9]);

    // The stack completing on Season 2 still tops the deck — above the
    // urgent show 9 — but the card says Season 1 comes first.
    const [card] = folded;
    expect(card.nextEpisode).toBe(10);
    expect(card.reason.kind).toBe('binge-ready');
    expect(card.reason.text).toBe('Season 2: Season complete · 12 episodes ready');
    expect(card.score).toBe(ranked.find((c) => c.anime.id === 2)!.score);
    // The CTA is about the lead, which is a plain finish-line catch-up.
    expect(card.series?.leadReason.kind).toBe('finish-line');
  });

  it("keeps the lead's own reason when the lead scores highest", () => {
    const ranked = rankUpNext({
      animeList: [
        show({ id: 1, aired: 12, status: 'FINISHED', episodes: 12 }),
        show({ id: 2, aired: 12, status: 'FINISHED', episodes: 12 }),
      ],
      library: [entry(1, 'watching'), entry(2, 'watching')],
      logs: logsThrough(1, 10, { watchedAt: NOW_MS - DAY_MS }),
      nowSec: NOW,
    });
    const [card] = foldSeriesCandidates(ranked, [graph([1, 2])]);
    expect(card.anime.id).toBe(1);
    expect(card.reason.kind).toBe('momentum');
    expect(card.reason.text).toContain('10 episodes this week');
  });

  it('leaves unrelated shows, unresolved graphs, and attachments alone', () => {
    const ranked = rankUpNext({
      animeList: [
        show({ id: 1, aired: 12, status: 'FINISHED', episodes: 12 }),
        show({ id: 2, aired: 12, status: 'FINISHED', episodes: 12 }),
        show({ id: 5, aired: 1, status: 'FINISHED', episodes: 1 }),
        show({ id: 7, aired: 6 }),
      ],
      library: [entry(1, 'watching'), entry(2, 'watching'), entry(5, 'watching'), entry(7, 'watching')],
      logs: [],
      nowSec: NOW,
    });
    // Show 7 has no graph yet; the movie (5) is an attachment of 1's franchise.
    const folded = foldSeriesCandidates(ranked, [graph([1, 5, 2], [5])]);
    expect(folded.map((c) => c.anime.id).sort()).toEqual([1, 5, 7]);
    expect(folded.find((c) => c.anime.id === 1)?.series?.then.map((q) => q.anime.id)).toEqual([2]);
    expect(folded.find((c) => c.anime.id === 5)?.series).toBeUndefined();
    expect(folded.find((c) => c.anime.id === 7)?.series).toBeUndefined();
  });

  it("re-sorts after folding so the franchise takes its best member's slot", () => {
    const ranked = rankUpNext({
      animeList: [
        show({ id: 1, aired: 12, status: 'FINISHED', episodes: 12 }),
        show({ id: 2, aired: 12, status: 'FINISHED', episodes: 12 }),
        show({ id: 3, aired: 12, status: 'FINISHED', episodes: 12 }),
      ],
      library: [entry(1, 'watching'), entry(2, 'watching'), entry(3, 'watching')],
      // Show 3: finish line (2 left). Show 2: finish line too (1 left), higher.
      // Show 1: plain backlog. Logs sit outside the momentum window.
      logs: [
        ...logsThrough(2, 11, { watchedAt: NOW_MS - 10 * DAY_MS }),
        ...logsThrough(3, 10, { watchedAt: NOW_MS - 10 * DAY_MS }),
      ],
      nowSec: NOW,
    });
    expect(ranked.map((c) => c.anime.id)).toEqual([2, 3, 1]);

    const folded = foldSeriesCandidates(ranked, [graph([1, 2])]);
    // 1+2 fold under 1 with 2's finish-line score, ahead of 3.
    expect(folded.map((c) => c.anime.id)).toEqual([1, 3]);
    expect(folded[0].reason.text).toBe('Season 2: Season finished · just the finale left');
  });
});
