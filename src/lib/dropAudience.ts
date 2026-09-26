/**
 * Who a Today's Drops card is for. One rule, shared by every surface that has
 * to agree on it — the drops feed, the deck's fresh-clock hold-back, and the
 * runway's countdown — so a show can never be a drop on one and not another.
 *
 * - **watching**: every episode.
 * - **stacking**: only the finale (the graduation), exact signal only.
 * - **planning** (Plan to Watch): only episode 1 — the premiere is the moment
 *   a show you meant to try actually starts.
 * - **guest**: a season premiere of a franchise you already follow, whose own
 *   entry isn't in the library yet. Also episode 1 only.
 *
 * Premieres and finales both demand an **exact** airing signal. The estimated
 * branch of latestAiredEpisode ("the episode before the next one aired a week
 * earlier") is right for an ordinary weekly episode and wrong exactly where a
 * premiere lives: an advance stream in Japan or an off-by-one schedule made
 * Magical Explorer's "Episode 1" drop a week before it was watchable anywhere.
 *
 * Pure: the id lists come in from the caller, which is the one place that
 * reads the library.
 */

export interface DropAudience {
  favorites: number[];
  stacking: number[];
  planning: number[];
  guests: number[];
}

export type DropRole =
  | { kind: 'weekly'; premiere: boolean }
  | { kind: 'graduation' }
  | { kind: 'premiere'; guest: boolean };

/** Library statuses that make a franchise "yours" for guest season premieres. */
export const OWNING_STATUSES = ['watching', 'completed', 'on_hold', 'stacking'] as const;

/**
 * The role a show plays for one aired episode, or null when it isn't drop
 * material. `estimated` is latestAiredEpisode's flag: a finale is only ever
 * trusted on an exact signal (the estimated branch can fabricate one).
 */
export function dropRole(
  showId: number,
  episode: number,
  totalEpisodes: number | null,
  estimated: boolean,
  audience: DropAudience,
): DropRole | null {
  if (audience.favorites.includes(showId)) return { kind: 'weekly', premiere: episode === 1 };
  if (audience.stacking.includes(showId)) {
    const finale = totalEpisodes !== null && episode >= totalEpisodes && !estimated;
    return finale ? { kind: 'graduation' } : null;
  }
  if (episode !== 1 || estimated) return null;
  if (audience.planning.includes(showId)) return { kind: 'premiere', guest: false };
  if (audience.guests.includes(showId)) return { kind: 'premiere', guest: true };
  return null;
}

/** Could this show ever be drop material? A cheap pre-filter before the episode maths. */
export function inAudience(showId: number, audience: DropAudience): boolean {
  return (
    audience.favorites.includes(showId) ||
    audience.stacking.includes(showId) ||
    audience.planning.includes(showId) ||
    audience.guests.includes(showId)
  );
}
