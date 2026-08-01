import { useOutletContext } from 'react-router';
import { AnimeMedia } from '../types';

/**
 * The current-season schedule, fetched once in RootLayout and handed to routes
 * through the outlet context. Temporary: PR 10 replaces this with a TanStack
 * Query hook and the context goes away.
 *
 * There is no global loading gate any more — `animeList` is `[]` until the
 * fetch lands and each route decides whether that is worth blocking on.
 */
export interface ScheduleContext {
  animeList: AnimeMedia[];
  scheduleLoading: boolean;
  scheduleError: string | null;
  retrySchedule: () => void;
}

export function useScheduleContext(): ScheduleContext {
  return useOutletContext<ScheduleContext>();
}
