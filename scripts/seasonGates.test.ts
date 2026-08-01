import { describe, expect, it } from 'vitest';
import { checkSeasonGates, type GateFacts } from './seasonGates';

/** A previous bundle: 100 shows, ids 1..100, the first 80 of them summarized. */
function facts(overrides: Partial<GateFacts> = {}): GateFacts {
  const showIds = Array.from({ length: 100 }, (_, i) => i + 1);
  return {
    showIds,
    summaryIds: showIds.slice(0, 80),
    generatedAt: '2026-07-31T00:00:00.000Z',
    ...overrides,
  };
}

const later = (base: GateFacts, overrides: Partial<GateFacts> = {}): GateFacts => ({
  ...base,
  generatedAt: '2026-07-31T08:00:00.000Z',
  ...overrides,
});

describe('checkSeasonGates', () => {
  it('passes an ordinary refresh', () => {
    const prev = facts();
    const result = checkSeasonGates(later(prev), prev);
    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.stats).toMatchObject({ shows: 100, prevShows: 100, summaries: 80, departed: 0, summaryFloor: 80 });
  });

  it('skips every comparison gate on a first run', () => {
    const result = checkSeasonGates(facts({ generatedAt: '1999-01-01T00:00:00.000Z' }), null);
    expect(result.ok).toBe(true);
    expect(result.stats.prevShows).toBeNull();
    expect(result.stats.showDrift).toBeNull();
  });

  it('refuses an empty bundle, previous or not', () => {
    expect(checkSeasonGates(facts({ showIds: [], summaryIds: [] }), null).reason).toBe('the new bundle has no shows');
    expect(checkSeasonGates(facts({ showIds: [], summaryIds: [] }), facts()).ok).toBe(false);
  });

  it('refuses a generatedAt that is not a date', () => {
    const result = checkSeasonGates(facts({ generatedAt: 'soon' }), null);
    expect(result.reason).toContain('not a parseable date');
  });

  describe('show count', () => {
    const prev = facts();

    it('allows drift inside ±30%', () => {
      const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
      expect(checkSeasonGates(later(prev, { showIds: ids(70) }), prev).ok).toBe(true);
      expect(checkSeasonGates(later(prev, { showIds: ids(130) }), prev).ok).toBe(true);
    });

    it('blocks a half-fetched season', () => {
      const half = later(prev, { showIds: Array.from({ length: 50 }, (_, i) => i + 1) });
      const result = checkSeasonGates(half, prev);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('show count moved -50.0% (100 -> 50)');
      expect(result.stats.showDrift).toBeCloseTo(-0.5);
    });

    it('blocks an implausible jump upward too', () => {
      const doubled = later(prev, { showIds: Array.from({ length: 200 }, (_, i) => i + 1) });
      expect(checkSeasonGates(doubled, prev).reason).toContain('100 -> 200');
    });

    it('has no opinion when the previous bundle had no shows', () => {
      expect(checkSeasonGates(later(prev), facts({ showIds: [], summaryIds: [] })).ok).toBe(true);
    });
  });

  describe('generatedAt', () => {
    const prev = facts();

    it('blocks a bundle that is not newer than the one on the branch', () => {
      expect(checkSeasonGates(facts(), prev).reason).toContain('generatedAt did not advance');
      expect(checkSeasonGates(facts({ generatedAt: '2026-07-30T00:00:00.000Z' }), prev).ok).toBe(false);
    });

    it('ignores an unparseable previous timestamp rather than blaming the new bundle', () => {
      expect(checkSeasonGates(facts(), facts({ generatedAt: 'whenever' })).ok).toBe(true);
    });
  });

  describe('summaries', () => {
    const prev = facts();

    it('blocks a bundle that lost summaries it should have carried', () => {
      const lost = later(prev, { summaryIds: prev.summaryIds.slice(0, 20) });
      const result = checkSeasonGates(lost, prev);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('summary count fell to 20, under the 80');
    });

    it('allows the drop when the summarized shows left the season', () => {
      // Ids 1..40 leave; 41..140 remain. 40 of the 80 summaries go with them.
      const showIds = Array.from({ length: 100 }, (_, i) => i + 41);
      const result = checkSeasonGates(later(prev, { showIds, summaryIds: showIds.slice(0, 40) }), prev);
      expect(result.ok).toBe(true);
      expect(result.stats).toMatchObject({ departed: 40, summaryFloor: 40, summaries: 40 });
    });

    it('still blocks a drop below what survived the departures', () => {
      const showIds = Array.from({ length: 100 }, (_, i) => i + 41);
      const result = checkSeasonGates(later(prev, { showIds, summaryIds: showIds.slice(0, 39) }), prev);
      expect(result.reason).toContain('under the 40 that should have carried forward');
    });

    it('is happy when the run added summaries', () => {
      const result = checkSeasonGates(later(prev, { summaryIds: prev.showIds }), prev);
      expect(result.ok).toBe(true);
      expect(result.stats.summaries).toBe(100);
    });
  });
});
