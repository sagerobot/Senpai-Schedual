import { useOutletContext } from 'react-router';
import { AnimeMedia } from '../types';

/**
 * The current-season schedule, handed to routes through the outlet context.
 * RootLayout derives it from `useCurrentSchedule()`, so this is a view onto the
 * `['schedule', 'current']` query rather than state of its own — any route may
 * equally well call that hook directly.
 *
 * There is no global loading gate — `animeList` is `[]` until the fetch lands
 * and each route decides whether that is worth blocking on.
 *
 * On a cold start `animeList` fills progressively (first AniList page after
 * one round-trip); `scheduleStreaming` is true while later pages are still
 * arriving so views can show a "loading more" hint instead of a spinner.
 */
export interface ScheduleContext {
  animeList: AnimeMedia[];
  scheduleLoading: boolean;
  scheduleStreaming: boolean;
  scheduleError: string | null;
  retrySchedule: () => void;
}

export function useScheduleContext(): ScheduleContext {
  return useOutletContext<ScheduleContext>();
}
