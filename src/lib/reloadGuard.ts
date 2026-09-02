/**
 * One automatic reload per minute, per reason, per tab.
 *
 * Two places reload the page on their own: RouteError, when a lazy chunk
 * 404s after a deploy, and the wake strip, when the server reports a newer
 * build than the one running. Both are "a reload heals this" cases — and both
 * would loop forever on a half-deployed or offline server without a budget.
 *
 * sessionStorage on purpose: per-tab, gone when the tab closes, and outside
 * the localStorage quota policy that storage.ts exists to enforce.
 */

export const RELOAD_GUARD_WINDOW_MS = 60_000;

export type ReloadReason = 'staleChunk' | 'wake';

const KEYS: Record<ReloadReason, string> = {
  staleChunk: 'senpai.staleChunkReloadAt',
  wake: 'senpai.wakeReloadAt',
};

/** Pure: allowed when the last reload for this reason is outside the window. */
export function shouldAutoReload(lastReloadAt: number, now: number): boolean {
  return now - lastReloadAt > RELOAD_GUARD_WINDOW_MS;
}

/**
 * Claims this tab's reload budget for `reason`. Returns false when a reload
 * fired inside the last minute (or storage is unavailable — then the caller
 * falls through to its manual affordance instead of risking a loop).
 */
export function claimAutoReload(reason: ReloadReason, now: number = Date.now()): boolean {
  try {
    const key = KEYS[reason];
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (!shouldAutoReload(last, now)) return false;
    sessionStorage.setItem(key, String(now));
    return true;
  } catch {
    return false;
  }
}
