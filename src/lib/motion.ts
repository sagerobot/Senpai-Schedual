/**
 * The motion vocabulary (docs/design-language.md §7). Canonical source for
 * every duration, easing, and spring in the app — no magic numbers at call
 * sites, no re-declared constants. CSS consumers use the mirrored tokens
 * `--ease-standard` / `--ease-swap` from index.css.
 *
 * Motion is theme-invariant: skins change paint, never physics.
 */

import type { Transition } from 'motion/react';

/** Portal traversal and general movement. */
export const EASE_STANDARD: [number, number, number, number] = [0.4, 0, 0.2, 1];

/** List reflow / layout settles. */
export const EASE_SWAP: [number, number, number, number] = [0.32, 0.72, 0.28, 1];

/** Durations in seconds (motion/react convention). */
export const DUR = {
  /** Hover color/opacity. */
  fast: 0.15,
  /** Reveals, expand/collapse. */
  standard: 0.3,
  /** Layout reflow. */
  swap: 0.32,
  /** Portal swap traversal. */
  portal: 0.45,
  /** Large panels. */
  slow: 0.5,
  /** Progress rings (pair with ease-out). */
  ring: 1,
} as const;

/** The one spring. LowScoreButtons' 600/32/0.7 converged here. */
export const SPRING_POP: Transition = { type: 'spring', stiffness: 500, damping: 38, mass: 0.8 };

/** Portal x-travel: the cell exits one row edge and enters from the other. */
export const PORTAL_X: Transition = { duration: DUR.portal, ease: EASE_STANDARD };

/** Shared layout transition for grid/list reflow. */
export const LAYOUT_SWAP: Transition = { duration: DUR.swap, ease: EASE_SWAP };

/**
 * The rating celebration (docs §17). Seconds, like DUR. The stamp scales with
 * the score — a 5 is acknowledged, a 10 is an event — and the beats that
 * follow it (the swipe to the next episode, or the caught-up send-off before
 * a card leaves) are long enough to read, short enough to rate a run of
 * catch-up episodes without waiting.
 */
export const CELEBRATE = {
  /** Stamp beat per tier: 5-6 / 7-8 / 9-10 (and "Watched only"). */
  stamp: { 1: 1.15, 2: 1.4, 3: 1.75 },
  /** The caught-up send-off before a card leaves the row. */
  sendOff: 2.6,
  /** The swipe-replace to the next episode. */
  swap: 0.52,
} as const;

export type CelebrationTier = keyof typeof CELEBRATE.stamp;

/** 5-6 → 1, 7-8 → 2, 9-10 → 3; a bare "Watched only" is the quiet tier. */
export function celebrationTier(score: number | null): CelebrationTier {
  if (score === null || score < 7) return 1;
  return score >= 9 ? 3 : 2;
}
