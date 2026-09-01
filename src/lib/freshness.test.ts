import { describe, expect, it } from 'vitest';
import { DROP_WINDOW_SEC, PIN_GRACE_SEC, dropFreshness } from './freshness';

const NOW = 1_800_000_000;
const H = 3600;
const at = (hoursAgo: number) => dropFreshness(NOW - hoursAgo * H, NOW);

describe('the window', () => {
  it('is two days, not one', () => {
    expect(DROP_WINDOW_SEC).toBe(48 * H);
  });

  it('lets a pin carry a card only half a day past the window', () => {
    expect(PIN_GRACE_SEC).toBe(12 * H);
  });
});

describe('dropFreshness tiers', () => {
  it('calls the first hour "just aired" rather than "0h ago"', () => {
    expect(at(0)).toMatchObject({ tier: 'fresh', label: 'Just aired' });
    expect(at(0.5).label).toBe('Just aired');
  });

  it('counts hours through the first day', () => {
    expect(at(3)).toMatchObject({ tier: 'fresh', label: '3h ago' });
    expect(at(23)).toMatchObject({ tier: 'fresh', label: '23h ago' });
  });

  it('crosses to aging once the episode is a day old', () => {
    expect(at(24)).toMatchObject({ tier: 'aging', label: 'Yesterday' });
    expect(at(30).tier).toBe('aging');
    // The band the owner's four missing cards sat in — squarely alive now.
    expect(at(26.3).tier).toBe('aging');
    expect(at(28.8).tier).toBe('aging');
  });

  it('advertises its exit over the last eight hours', () => {
    expect(at(40)).toMatchObject({ tier: 'leaving', label: 'Leaves in 8h' });
    expect(at(45).label).toBe('Leaves in 3h');
    expect(at(47.6).label).toBe('Leaves in 1h');
  });

  it('never counts down past zero for a pin-carried card', () => {
    expect(at(48)).toMatchObject({ tier: 'leaving', label: 'Leaving soon' });
    expect(at(55).label).toBe('Leaving soon');
  });
});

describe('dropFreshness meter', () => {
  it('drains across the window', () => {
    expect(at(0).spent).toBe(0);
    expect(at(24).spent).toBeCloseTo(0.5);
    expect(at(48).spent).toBe(1);
  });

  it('clamps both ends, so a future airedAt cannot invert the rail', () => {
    expect(dropFreshness(NOW + 5 * H, NOW).spent).toBe(0);
    expect(at(500).spent).toBe(1);
  });
});
