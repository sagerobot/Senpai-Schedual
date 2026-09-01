/**
 * How much life a drop card has left.
 *
 * Today's Drops used to say "aired today" on every card, which stopped being
 * true the moment an episode crossed midnight — and with a 48-hour window it
 * would be wrong more often than right. A card now states its own age and how
 * close it is to leaving, so a card about to expire looks different from one
 * that just landed rather than both claiming to be today's.
 *
 * Pure and clock-free: callers pass `nowSec`.
 */

/**
 * An episode is drop material for this long after it airs. Two days, not one:
 * a 24-hour window meant an episode watched the following evening had already
 * fallen off the surface built to catch it.
 */
export const DROP_WINDOW_SEC = 48 * 3600;

/**
 * How far past the window an admission pin may still carry a card. Enough that
 * a card cannot vanish mid-session on the very recompute a catch-up rating
 * triggers — the reason pins exist at all — without letting a long-lived tab
 * hoard drop cards for days.
 */
export const PIN_GRACE_SEC = 12 * 3600;

/** The last stretch of the window, where the card starts advertising its exit. */
const LEAVING_SEC = 8 * 3600;

/** Below this an episode is simply "new" rather than a number of hours old. */
const JUST_AIRED_SEC = 3600;

export type FreshnessTier = 'fresh' | 'aging' | 'leaving';

export interface Freshness {
  tier: FreshnessTier;
  /** 0 the moment it airs, 1 at the end of the window. Clamped both ends. */
  spent: number;
  /** What the card says: "Just aired", "6h ago", "Yesterday", "Leaves in 3h". */
  label: string;
}

export function dropFreshness(airedAt: number, nowSec: number, windowSec = DROP_WINDOW_SEC): Freshness {
  const elapsed = Math.max(0, nowSec - airedAt);
  const remaining = windowSec - elapsed;
  const spent = Math.min(1, Math.max(0, elapsed / windowSec));

  if (remaining <= LEAVING_SEC) {
    return {
      tier: 'leaving',
      spent,
      // A card carried past the window by its pin has nothing left to count
      // down, so it says what is about to happen instead of a negative hour.
      label: remaining <= 0 ? 'Leaving soon' : `Leaves in ${Math.max(1, Math.round(remaining / 3600))}h`,
    };
  }

  if (elapsed >= 24 * 3600) return { tier: 'aging', spent, label: 'Yesterday' };
  if (elapsed < JUST_AIRED_SEC) return { tier: 'fresh', spent, label: 'Just aired' };
  return { tier: 'fresh', spent, label: `${Math.round(elapsed / 3600)}h ago` };
}
