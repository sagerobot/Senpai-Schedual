import { describe, expect, it } from 'vitest';
import { fitFontSize } from './fitText';

describe('fitFontSize', () => {
  it('returns max when the largest size already fits', () => {
    expect(fitFontSize(12, 20, () => true)).toBe(20);
  });

  it('returns the largest size that fits', () => {
    expect(fitFontSize(12, 20, (px) => px <= 17)).toBe(17);
    expect(fitFontSize(12, 20, (px) => px <= 13)).toBe(13);
    expect(fitFontSize(12, 20, (px) => px <= 19)).toBe(19);
  });

  it('falls back to min instead of clipping when nothing fits', () => {
    expect(fitFontSize(12, 20, () => false)).toBe(12);
  });

  it('probes logarithmically', () => {
    let probes = 0;
    fitFontSize(10, 40, (px) => (probes++, px <= 23));
    expect(probes).toBeLessThanOrEqual(6);
  });

  it('handles a degenerate range', () => {
    expect(fitFontSize(14, 14, () => false)).toBe(14);
  });
});
