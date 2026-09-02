import { describe, expect, it } from 'vitest';
import { shortSeasonLabel, watchCta } from './watchCta';

describe('watchCta', () => {
  it('starts a show nothing has been logged for', () => {
    expect(watchCta({ episode: 1, started: false })).toBe('Start Episode 1');
    expect(watchCta({ episode: 1, started: false, seasonLabel: 'Season 2' })).toBe('Start Episode 1 (S2)');
  });

  it('continues compactly once anything is logged', () => {
    expect(watchCta({ episode: 5, started: true })).toBe('Continue · Ep 5');
    expect(watchCta({ episode: 5, started: true, seasonLabel: 'Final Season' })).toBe('Continue · Ep 5 (Final)');
  });

  it("says Watch for tonight's episode when caught up, but not before starting", () => {
    expect(watchCta({ episode: 9, started: true, caughtUp: true })).toBe('Watch Episode 9');
    expect(watchCta({ episode: 1, started: false, caughtUp: true })).toBe('Start Episode 1');
  });

  it('treats a viewer who skipped episode 1 as started', () => {
    expect(watchCta({ episode: 1, started: true })).toBe('Continue · Ep 1');
  });
});

describe('shortSeasonLabel', () => {
  it('abbreviates the graph vocabulary and leaves subtitles alone', () => {
    expect(shortSeasonLabel('Season 2')).toBe('S2');
    expect(shortSeasonLabel('Part 2 Final Season')).toBe('Pt 2 Final');
    expect(shortSeasonLabel('Shippuden')).toBe('Shippuden');
  });
});
