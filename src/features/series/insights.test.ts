import { describe, expect, it } from 'vitest';
import type { EpisodeLog } from '../../types';
import type { VibeEntry } from '../../lib/vibesFile';
import {
  alignment,
  aspectRollup,
  behindFrom,
  continueTarget,
  endingVerdict,
  gapReading,
  hasStarted,
  heresies,
  landmarks,
  memberSignal,
  progressByMember,
  worthItHorizon,
  type Tone,
} from './insights';

const P = 'positive' as const;
const M = 'mixed' as const;
const N = 'negative' as const;

function found(showId: number, episode: number, indicator: Tone, extra?: Partial<Extract<VibeEntry, { status: 'found' }>>): VibeEntry {
  return {
    showId,
    episode,
    airedAt: 0,
    asOf: '2026-01-01T00:00:00Z',
    settled: true,
    status: 'found',
    summary: 'x',
    goods: [],
    bads: [],
    indicator,
    upvotes: 100,
    comments: 1000,
    url: 'https://www.reddit.com/r/anime/x',
    ...extra,
  };
}

function log(showId: number, episodeNumber: number, score: number | null = null): EpisodeLog {
  return { showId, episodeNumber, watchedAt: 0, score };
}

describe('hasStarted', () => {
  const now = new Date(2026, 7, 17); // Aug 17, 2026
  it('is true for past dates and false for future ones', () => {
    expect(hasStarted({ year: 2024, month: 10, day: 5 }, now)).toBe(true);
    expect(hasStarted({ year: 2026, month: 9, day: 12 }, now)).toBe(false);
  });
  it('defaults missing month/day toward not-started', () => {
    expect(hasStarted({ year: 2026 }, now)).toBe(false); // "2026" alone → Dec 28
    expect(hasStarted({ year: 2025 }, now)).toBe(true);
    expect(hasStarted(null, now)).toBe(false);
    expect(hasStarted({ year: null }, now)).toBe(false);
  });
});

describe('memberSignal', () => {
  it('projects found tones and thread comments, null elsewhere', () => {
    const entries = new Map<string, VibeEntry>([
      ['1:1', found(1, 1, P, { comments: 500 })],
      ['1:3', { showId: 1, episode: 3, airedAt: 0, asOf: '2026-01-01T00:00:00Z', settled: true, status: 'quiet', upvotes: 2, comments: 41, url: 'https://www.reddit.com/x' }],
    ]);
    const signal = memberSignal((id, ep) => entries.get(`${id}:${ep}`), 1, 3);
    expect(signal.tones).toEqual([P, null, null]);
    expect(signal.comments).toEqual([500, null, 41]);
  });
});

describe('worthItHorizon', () => {
  it('finds the episode after the last complaint', () => {
    // complaints through E5, positive from E6 on → turn at E7? lastRough index 4 → turn 6
    const tones: (Tone | null)[] = [P, M, M, P, M, P, P, P, P, P, P, P];
    expect(worthItHorizon(tones)).toBe(6);
  });
  it('is null with under six found readings', () => {
    expect(worthItHorizon([P, M, P, null, null, null, null, null])).toBeNull();
  });
  it('is null when the season was never rough', () => {
    expect(worthItHorizon([P, P, P, P, P, P, P])).toBeNull();
  });
  it('is null when the turn lands past 60% of the season', () => {
    const tones: (Tone | null)[] = [P, P, P, P, P, P, P, P, M, P, P, P];
    expect(worthItHorizon(tones)).toBeNull();
  });
});

describe('endingVerdict', () => {
  it('sticks when the final window is all positive', () => {
    expect(endingVerdict([M, M, P, P, P])).toBe('sticks');
  });
  it('divisive when the window holds a negative', () => {
    expect(endingVerdict([P, P, P, N, P])).toBe('divisive');
  });
  it('fades on a mixed close', () => {
    expect(endingVerdict([P, P, P, M, M])).toBe('fades');
  });
  it('null when fewer than two of the last three episodes were read', () => {
    expect(endingVerdict([P, P, P, null, null, P])).toBeNull();
  });
});

describe('landmarks', () => {
  it('flags the S1E19 night and nothing ordinary', () => {
    const comments = [1200, 1400, 1600, 1500, 1900, 1800, 2200, 2400, 2600, 2900, 3100, 3000, 3400, 3600, 3900, 4200, 4500, 5000, 24100, 4400];
    expect(landmarks(comments)).toEqual([19]);
  });
  it('needs eight known counts', () => {
    expect(landmarks([100, 200, 24100, null, null, null, null, null])).toEqual([]);
  });
});

describe('alignment + heresies', () => {
  const tones: (Tone | null)[] = [P, P, M, N, P, M, P, null];
  const scores: (number | null)[] = [8, 9, 6, 9, 8, 7, 4, 10];
  it('counts comparable episodes and agreement', () => {
    // comparable: 7. aligned: |8-8.5|, |9-8.5|, |6-6.5|, |8-8.5|, |7-6.5| = 5
    expect(alignment(scores, tones)).toEqual({ pct: 71, comparable: 7 });
  });
  it('surfaces the biggest disagreements first', () => {
    const found = heresies(scores, tones);
    expect(found.map((h) => h.episode)).toEqual([4, 7]);
    expect(found[0].gap).toBeCloseTo(4.5);
  });
  it('alignment is null under five comparable episodes', () => {
    expect(alignment([8, 8, null, null], [P, P, P, P])).toBeNull();
  });
});

describe('aspectRollup', () => {
  it('takes the majority where two or more threads spoke', () => {
    const entries = [
      found(1, 1, P, { aspects: { animation: P, pacing: M } }),
      found(1, 2, P, { aspects: { animation: P, pacing: N } }),
      found(1, 3, M, { aspects: { animation: P, pacing: N, sound: P } }),
    ];
    const rollup = aspectRollup(entries);
    expect(rollup.animation).toBe(P);
    expect(rollup.pacing).toBe(N);
    expect(rollup.sound).toBeUndefined(); // one mention is silence, not consensus
  });
  it('reads a tie as mixed', () => {
    const entries = [
      found(1, 1, P, { aspects: { story: P } }),
      found(1, 2, P, { aspects: { story: N } }),
    ];
    expect(aspectRollup(entries).story).toBe(M);
  });
});

describe('gapReading', () => {
  it('names the gap in both directions and the dead zone', () => {
    expect(gapReading(9, 8.4)).toEqual({ gap: 0.6, label: 'greater than its parts' });
    expect(gapReading(7, 8.1)).toEqual({ gap: -1.1, label: 'less than its parts' });
    expect(gapReading(9, 8.9)).toEqual({ gap: 0.1, label: 'exactly its parts' });
    expect(gapReading(null, 8)).toBeNull();
  });
});

describe('continueTarget + behindFrom', () => {
  const members = [10, 20, 30];
  const aired = new Map([[10, 12], [20, 12], [30, 8]]);

  it('resumes inside the furthest-started member', () => {
    const progress = progressByMember(
      [log(10, 1), log(10, 2), log(20, 1), log(20, 2), log(20, 3)],
      members,
    );
    expect(continueTarget(members, progress, aired)).toEqual({ memberId: 20, episode: 4 });
  });

  it('rolls into the next member when the furthest-started is complete', () => {
    const logs = Array.from({ length: 12 }, (_, i) => log(10, i + 1));
    const progress = progressByMember(logs, members);
    expect(continueTarget(members, progress, aired)).toEqual({ memberId: 20, episode: 1 });
  });

  it('starts at the very beginning with zero logs', () => {
    const progress = progressByMember([], members);
    expect(continueTarget(members, progress, aired)).toEqual({ memberId: 10, episode: 1 });
  });

  it('fills gaps before advancing', () => {
    const progress = progressByMember([log(30, 1), log(30, 3)], members);
    expect(continueTarget(members, progress, aired)).toEqual({ memberId: 30, episode: 2 });
  });

  it('counts behind from the continue point onward only', () => {
    const progress = progressByMember([log(10, 1), log(30, 1), log(30, 2), log(30, 3)], members);
    const target = continueTarget(members, progress, aired);
    // furthest started = member 30 → 5 unwatched aired there, earlier members don't count
    expect(target).toEqual({ memberId: 30, episode: 4 });
    expect(behindFrom(target, members, progress, aired)).toBe(5);
  });

  it('is null when nothing has aired anywhere', () => {
    const progress = progressByMember([], members);
    expect(continueTarget(members, progress, new Map([[10, 0], [20, 0], [30, 0]]))).toBeNull();
  });
});
