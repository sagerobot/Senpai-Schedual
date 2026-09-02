import { describe, expect, it } from 'vitest';
import { watchCta } from './watchCta';

describe('watchCta', () => {
  it('starts a show nothing has been logged for', () => {
    expect(watchCta({ episode: 1, started: false })).toBe('Start Episode 1');
    expect(watchCta({ episode: 1, started: false }, 'short')).toBe('Start Ep 1');
  });

  it('starts a fresh season by name', () => {
    expect(watchCta({ episode: 1, started: false, seasonLabel: 'Season 2' })).toBe('Start Season 2');
    expect(watchCta({ episode: 3, started: false, seasonLabel: 'Season 2' })).toBe('Start Season 2 — Ep 3');
  });

  it('continues once anything is logged', () => {
    expect(watchCta({ episode: 5, started: true })).toBe('Continue with Episode 5');
    expect(watchCta({ episode: 5, started: true }, 'short')).toBe('Continue · Ep 5');
    expect(watchCta({ episode: 5, started: true, seasonLabel: 'Final Season' })).toBe('Continue Final Season — Ep 5');
  });

  it('says Watch for tonight\'s episode when caught up, but not before starting', () => {
    expect(watchCta({ episode: 9, started: true, caughtUp: true })).toBe('Watch Episode 9');
    expect(watchCta({ episode: 1, started: false, caughtUp: true })).toBe('Start Episode 1');
  });

  it('treats a viewer who skipped episode 1 as started', () => {
    expect(watchCta({ episode: 1, started: true })).toBe('Continue with Episode 1');
  });
});
