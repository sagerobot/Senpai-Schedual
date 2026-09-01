import { getAiredEpisodesCount } from '../../lib/aired';
import type { AnimeMedia, EpisodeLog } from '../../types';

/**
 * What one pip in a Week Ruler column stands for.
 *
 * The order is load-bearing twice over: pips are sorted by it, and the
 * MAX_PIPS trim slices off the tail — so the kinds worth seeing are the ones
 * that survive a heavy Saturday.
 */
export const PIP_ORDER = ['behind', 'mine', 'stacking', 'other'] as const;
export type PipKind = (typeof PIP_ORDER)[number];

/**
 * Past this many pips a column folds the rest into `overflow`. Fifteen shows
 * on a Saturday would otherwise wrap one ruler column into a wall of squares
 * and push the whole strip taller than the cards it describes.
 */
export const MAX_PIPS = 14;

export interface DaySummary {
  /** Full day name — both the `grouped` key and the scroll-target id suffix. */
  day: string;
  /** Derived from `now`, not from the shows, so an empty day still has a date. */
  dayOfMonth: number;
  isToday: boolean;
  total: number;
  /** Watching + stacking: both are shows the user has claimed. */
  mine: number;
  /**
   * Watching shows with aired episodes they haven't logged. Stacking shows are
   * *deliberately* piling up, so they are never counted as behind — that's the
   * entire point of the status.
   */
  behind: number;
  /** Sorted by PIP_ORDER and trimmed to MAX_PIPS. */
  pips: PipKind[];
  /** Shows past the pip cap. `pips.length + overflow === total`. */
  overflow: number;
}

/**
 * The Week Ruler's data, derived from the *visible* schedule — the same
 * post-filter grouping the day sections below render. If a filter empties a
 * day, its column reads 0 and stops being a jump target, because there is no
 * section down there to jump to.
 */
export function summarizeWeek(
  grouped: Record<string, AnimeMedia[]>,
  orderedDays: readonly string[],
  watching: readonly number[],
  stacking: readonly number[],
  logs: readonly EpisodeLog[],
  now: Date,
): DaySummary[] {
  const nowSec = Math.floor(now.getTime() / 1000);
  const watchingIds = new Set(watching);
  const stackingIds = new Set(stacking);

  const loggedCounts = new Map<number, number>();
  for (const log of logs) {
    loggedCounts.set(log.showId, (loggedCounts.get(log.showId) ?? 0) + 1);
  }

  return orderedDays.map((day, index) => {
    // setDate handles month/year rollover and DST for us; a fresh Date per
    // column keeps the mutation from leaking into the next iteration.
    const date = new Date(now.getTime());
    date.setDate(date.getDate() + index);

    const shows = grouped[day] ?? [];
    const pips: PipKind[] = [];
    let mine = 0;
    let behind = 0;

    for (const anime of shows) {
      if (watchingIds.has(anime.id)) {
        mine += 1;
        const unwatched = getAiredEpisodesCount(anime, nowSec) - (loggedCounts.get(anime.id) ?? 0);
        if (unwatched > 0) {
          behind += 1;
          pips.push('behind');
        } else {
          pips.push('mine');
        }
      } else if (stackingIds.has(anime.id)) {
        mine += 1;
        pips.push('stacking');
      } else {
        pips.push('other');
      }
    }

    pips.sort((a, b) => PIP_ORDER.indexOf(a) - PIP_ORDER.indexOf(b));

    return {
      day,
      dayOfMonth: date.getDate(),
      isToday: index === 0,
      total: shows.length,
      mine,
      behind,
      pips: pips.slice(0, MAX_PIPS),
      overflow: Math.max(0, shows.length - MAX_PIPS),
    };
  });
}
