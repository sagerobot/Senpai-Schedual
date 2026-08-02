import { describe, expect, it } from 'vitest';
import type { EpisodeLog } from '../../types';
import { franchiseRollup, memberRollup } from './rollups';

const log = (showId: number, episodeNumber: number, score: number | null): EpisodeLog => ({
  showId,
  episodeNumber,
  watchedAt: 1_700_000_000_000,
  score,
});

const LOGS = [log(1, 1, 8), log(1, 2, 9), log(1, 3, null), log(2, 1, 6), log(99, 1, 10)];

describe('memberRollup', () => {
  it('counts watched and averages only the scored episodes', () => {
    expect(memberRollup(LOGS, 1)).toEqual({ watched: 3, scored: 2, avgEpisodeScore: 8.5 });
  });

  it('returns null, not zero, when nothing is scored — unrated is not a 0/10', () => {
    expect(memberRollup([log(1, 1, null)], 1)).toEqual({ watched: 1, scored: 0, avgEpisodeScore: null });
    expect(memberRollup(LOGS, 42)).toEqual({ watched: 0, scored: 0, avgEpisodeScore: null });
  });
});

describe('franchiseRollup', () => {
  it('aggregates across members and ignores shows outside the franchise', () => {
    expect(franchiseRollup(LOGS, [1, 2])).toEqual({ watched: 4, avgEpisodeScore: 7.7, seasonsStarted: 2 });
  });

  it('rounds to one decimal', () => {
    expect(franchiseRollup([log(1, 1, 7), log(1, 2, 8), log(1, 3, 8)], [1]).avgEpisodeScore).toBe(7.7);
  });
});
