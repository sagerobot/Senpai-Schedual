import type { EpisodeLog } from '../../types';

/**
 * Personal roll-ups for the franchise page. Pure: takes the logs array the
 * store already exposes, returns numbers.
 *
 * The page shows two ratings side by side on purpose — the average of the
 * episode scores and the show's own overall — and never merges them: a show
 * can be greater (or less) than the sum of its parts, and the gap between the
 * two numbers is exactly that signal.
 */

export interface MemberRollup {
  /** Episodes logged as watched. */
  watched: number;
  /** Episodes carrying a score. */
  scored: number;
  /** Mean of the scored episodes, one decimal, or null when nothing is scored. */
  avgEpisodeScore: number | null;
}

export function memberRollup(logs: readonly EpisodeLog[], showId: number): MemberRollup {
  let watched = 0;
  let scored = 0;
  let total = 0;
  for (const log of logs) {
    if (log.showId !== showId) continue;
    watched++;
    if (log.score !== null && log.score !== undefined) {
      scored++;
      total += log.score;
    }
  }
  return {
    watched,
    scored,
    avgEpisodeScore: scored === 0 ? null : Math.round((total / scored) * 10) / 10,
  };
}

export interface FranchiseRollup {
  watched: number;
  avgEpisodeScore: number | null;
  /** Members with at least one watched episode. */
  seasonsStarted: number;
}

export function franchiseRollup(logs: readonly EpisodeLog[], memberIds: readonly number[]): FranchiseRollup {
  const ids = new Set(memberIds);
  let watched = 0;
  let scored = 0;
  let total = 0;
  const started = new Set<number>();
  for (const log of logs) {
    if (!ids.has(log.showId)) continue;
    watched++;
    started.add(log.showId);
    if (log.score !== null && log.score !== undefined) {
      scored++;
      total += log.score;
    }
  }
  return {
    watched,
    avgEpisodeScore: scored === 0 ? null : Math.round((total / scored) * 10) / 10,
    seasonsStarted: started.size,
  };
}
