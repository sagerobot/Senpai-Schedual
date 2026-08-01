import { describe, expect, it } from 'vitest';
import { getAiredEpisodesCount, latestAiredEpisode } from './aired';
import type { AnimeMedia } from '../types';

const NOW = 1_754_000_000;

const show = (next: { episode: number; airingAt: number } | null, extra: Partial<AnimeMedia> = {}) =>
  ({
    nextAiringEpisode: next === null ? null : { ...next, timeUntilAiring: next.airingAt - NOW },
    status: 'RELEASING',
    episodes: null,
    ...extra,
  }) as AnimeMedia;

describe('latestAiredEpisode', () => {
  it('fresh data: next episode in the future → previous episode, estimated air time', () => {
    const s = show({ episode: 8, airingAt: NOW + 3600 });
    expect(latestAiredEpisode(s, NOW)).toEqual({
      episode: 7,
      airedAt: NOW + 3600 - 7 * 24 * 3600,
      estimated: true,
    });
  });

  it('STALE data: airingAt already passed → that episode aired, exact time', () => {
    const s = show({ episode: 8, airingAt: NOW - 2 * 3600 });
    expect(latestAiredEpisode(s, NOW)).toEqual({ episode: 8, airedAt: NOW - 2 * 3600, estimated: false });
  });

  it('upcoming premiere (episode 1 in the future) → nothing aired', () => {
    expect(latestAiredEpisode(show({ episode: 1, airingAt: NOW + 3600 }), NOW)).toBeNull();
  });

  it('stale premiere (episode 1 airingAt passed) → the premiere aired', () => {
    expect(latestAiredEpisode(show({ episode: 1, airingAt: NOW - 60 }), NOW)?.episode).toBe(1);
  });

  it('no nextAiringEpisode → null', () => {
    expect(latestAiredEpisode(show(null), NOW)).toBeNull();
  });
});

describe('getAiredEpisodesCount', () => {
  it('stale data counts the just-aired episode', () => {
    expect(getAiredEpisodesCount(show({ episode: 8, airingAt: NOW - 60 }), NOW)).toBe(8);
    expect(getAiredEpisodesCount(show({ episode: 8, airingAt: NOW + 60 }), NOW)).toBe(7);
  });

  it('finished shows fall back to the episode total', () => {
    expect(getAiredEpisodesCount(show(null, { status: 'FINISHED', episodes: 12 }), NOW)).toBe(12);
  });

  it('unaired shows count zero', () => {
    expect(getAiredEpisodesCount(show(null, { status: 'NOT_YET_RELEASED' }), NOW)).toBe(0);
  });
});
