import { describe, expect, it } from 'vitest';
import { compareSeasons, currentSeason, daysUntilNextSeason, nextSeason, seasonLabel } from './season';

// Local-time constructors: the season boundary is local, like currentSeason.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe('nextSeason', () => {
  it('steps through the year and rolls fall into next winter', () => {
    expect(nextSeason(at(2026, 2, 10))).toEqual({ year: 2026, season: 'spring' });
    expect(nextSeason(at(2026, 5, 10))).toEqual({ year: 2026, season: 'summer' });
    expect(nextSeason(at(2026, 9, 27))).toEqual({ year: 2026, season: 'fall' });
    expect(nextSeason(at(2026, 11, 3))).toEqual({ year: 2027, season: 'winter' });
  });
});

describe('daysUntilNextSeason', () => {
  it('counts whole days, rounded up, to the first of the next season', () => {
    expect(daysUntilNextSeason(at(2026, 9, 27))).toBe(4);
    expect(daysUntilNextSeason(at(2026, 9, 30, 23))).toBe(1);
    expect(daysUntilNextSeason(at(2026, 12, 31))).toBe(1);
    expect(daysUntilNextSeason(at(2026, 7, 1, 0))).toBe(92);
  });

  it('agrees with currentSeason at the boundary', () => {
    const lastMoment = new Date(2026, 8, 30, 23, 59, 59);
    expect(currentSeason(lastMoment).season).toBe('summer');
    expect(currentSeason(new Date(2026, 9, 1, 0, 0, 0)).season).toBe('fall');
    expect(daysUntilNextSeason(lastMoment)).toBe(1);
  });
});

describe('compareSeasons / seasonLabel', () => {
  it('orders by year, then calendar season', () => {
    expect(compareSeasons({ year: 2026, season: 'summer' }, { year: 2026, season: 'fall' })).toBeLessThan(0);
    expect(compareSeasons({ year: 2027, season: 'winter' }, { year: 2026, season: 'fall' })).toBeGreaterThan(0);
    expect(compareSeasons({ year: 2026, season: 'fall' }, { year: 2026, season: 'fall' })).toBe(0);
  });

  it('labels a season the way people say it', () => {
    expect(seasonLabel({ year: 2026, season: 'fall' })).toBe('Fall 2026');
  });
});
