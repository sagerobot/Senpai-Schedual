import { describe, expect, it } from 'vitest';
import { isStaleChunkError, shouldAutoReload } from './RouteError';

describe('isStaleChunkError', () => {
  it('recognizes every browser wording for a stale route chunk', () => {
    // Firefox — the wording from the reported production screenshot.
    expect(
      isStaleChunkError(new Error('error loading dynamically imported module: https://x/assets/route-CEaCaXQm.js')),
    ).toBe(true);
    // Chrome.
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/a.js'))).toBe(true);
    // Safari.
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it('does not claim ordinary errors', () => {
    expect(isStaleChunkError(new Error("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
    expect(isStaleChunkError({ status: 404 })).toBe(false);
  });
});

describe('shouldAutoReload', () => {
  it('allows the first reload and refuses a second inside the window', () => {
    const now = 1_700_000_000_000;
    expect(shouldAutoReload(0, now)).toBe(true);
    expect(shouldAutoReload(now - 5_000, now)).toBe(false);
    expect(shouldAutoReload(now - 61_000, now)).toBe(true);
  });
});
