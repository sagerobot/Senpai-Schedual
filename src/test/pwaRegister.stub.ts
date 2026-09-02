/**
 * Test stand-in for `virtual:pwa-register`, which only exists inside Vite's
 * plugin pipeline. Aliased in vitest.config.ts; never imported directly.
 */
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return async () => {};
}
