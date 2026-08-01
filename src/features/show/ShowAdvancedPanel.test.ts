/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import type { SeriesOverrides } from '../../stores/userData';
import { formatOffset, withMergeTarget, withoutSplit } from './ShowAdvancedPanel';

describe('formatOffset', () => {
  it('reads zero as on time', () => {
    expect(formatOffset(0)).toBe('on time');
  });

  it('formats sub-hour, hour, and mixed offsets', () => {
    expect(formatOffset(30)).toBe('+30m');
    expect(formatOffset(60)).toBe('+1h');
    expect(formatOffset(90)).toBe('+1h 30m');
  });

  it('formats day-scale offsets', () => {
    expect(formatOffset(1440)).toBe('+1 day');
    expect(formatOffset(2880)).toBe('+2 days');
    expect(formatOffset(1500)).toBe('+1 day 1h');
  });

  it('carries the sign for negative offsets', () => {
    expect(formatOffset(-15)).toBe('-15m');
  });
});

describe('inverse override helpers', () => {
  const base: SeriesOverrides = { merges: { 5: 99 }, splits: [1, 2, 3] };

  it('withoutSplit removes only the given id and never mutates', () => {
    const next = withoutSplit(base, 2);
    expect(next.splits).toEqual([1, 3]);
    expect(next.merges).toEqual({ 5: 99 });
    expect(base.splits).toEqual([1, 2, 3]);
  });

  it('withoutSplit is a no-op shape for ids that are not split', () => {
    expect(withoutSplit(base, 42).splits).toEqual([1, 2, 3]);
  });

  it('withMergeTarget sets and overwrites a target', () => {
    expect(withMergeTarget(base, 7, 100).merges).toEqual({ 5: 99, 7: 100 });
    expect(withMergeTarget(base, 5, 100).merges).toEqual({ 5: 100 });
  });

  it('withMergeTarget with undefined removes the entry (merge undo)', () => {
    const next = withMergeTarget(base, 5, undefined);
    expect(next.merges).toEqual({});
    expect(next.splits).toEqual([1, 2, 3]);
    expect(base.merges).toEqual({ 5: 99 });
  });
});
