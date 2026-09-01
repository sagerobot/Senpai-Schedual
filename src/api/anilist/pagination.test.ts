import { describe, expect, it } from 'vitest';
import { hasMorePages } from './pagination';

describe('hasMorePages', () => {
  it('trusts hasNextPage when it promises more', () => {
    expect(hasMorePages({ hasNextPage: true }, 12, 50)).toBe(true);
  });

  it('does not trust hasNextPage when the page came back full', () => {
    // AniList's undercount: a full page and "no next page" is exactly how the
    // truncated August 2026 bundles happened.
    expect(hasMorePages({ hasNextPage: false }, 50, 50)).toBe(true);
    expect(hasMorePages(null, 50, 50)).toBe(true);
  });

  it('stops on a short page with nothing more promised', () => {
    expect(hasMorePages({ hasNextPage: false }, 49, 50)).toBe(false);
    expect(hasMorePages(undefined, 3, 50)).toBe(false);
  });

  it('stops on the empty follow-up page', () => {
    expect(hasMorePages({ hasNextPage: false }, 0, 50)).toBe(false);
  });
});
