import { describe, expect, it } from 'vitest';
import type { EpisodeLog, LibraryEntry } from '../types';
import { getEffectiveScore } from './scoring';

function entry(showId: number, showScore: number | null): LibraryEntry {
  return { showId, idMal: null, status: 'watching', showScore, source: 'manual' };
}

function log(showId: number, episodeNumber: number, score: number | null): EpisodeLog {
  return { showId, episodeNumber, watchedAt: 0, score };
}

describe('getEffectiveScore', () => {
  it('prefers the explicit show score over the episode average', () => {
    const logs = [log(1, 1, 2), log(1, 2, 2)];

    expect(getEffectiveScore(entry(1, 9), logs)).toBe(9);
  });

  it('keeps an explicit 0 rather than falling back to the average', () => {
    const logs = [log(1, 1, 10), log(1, 2, 10)];

    expect(getEffectiveScore(entry(1, 0), logs)).toBe(0);
  });

  it('averages scored episode logs when there is no show score', () => {
    const logs = [log(1, 1, 7), log(1, 2, 8), log(1, 3, null)];

    expect(getEffectiveScore(entry(1, null), logs)).toBe(7.5);
  });

  it('rounds the episode average to one decimal', () => {
    const logs = [log(1, 1, 7), log(1, 2, 7), log(1, 3, 8)];

    expect(getEffectiveScore(entry(1, null), logs)).toBe(7.3);
  });

  it('returns null with neither a show score nor scored logs', () => {
    expect(getEffectiveScore(entry(1, null), [log(1, 1, null)])).toBeNull();
    expect(getEffectiveScore(entry(1, null), [])).toBeNull();
  });

  it('returns null for an undefined entry', () => {
    expect(getEffectiveScore(undefined, [log(1, 1, 10)])).toBeNull();
  });

  it("ignores other shows' episode logs", () => {
    const logs = [log(2, 1, 10), log(2, 2, 10), log(1, 1, 4)];

    expect(getEffectiveScore(entry(1, null), logs)).toBe(4);
  });
});
