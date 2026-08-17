/**
 * The Atlas's rooms. `?view=` addresses them (absent = Overview); the value is
 * parsed defensively because it arrives from the URL. Room switches replace
 * history rather than pushing — tabs are peers, unlike the `?show=`/`?ep=`
 * layers, so Back leaves the page instead of un-tabbing.
 */

export type SeriesRoom = 'overview' | 'run' | 'episodes';

export const VIEW_PARAM = 'view';

export const ROOM_ORDER: readonly SeriesRoom[] = ['overview', 'run', 'episodes'];

export const ROOM_LABELS: Record<SeriesRoom, string> = {
  overview: 'Overview',
  run: 'The Run',
  episodes: 'Episodes',
};

export function parseRoom(value: string | null): SeriesRoom {
  return value === 'run' || value === 'episodes' ? value : 'overview';
}

/**
 * A `?show=` href that keeps the rest of the current search string — a raw
 * `to="?show=<id>"` would wipe `?view=` and flip the page back to Overview
 * underneath the modal.
 */
export function showHref(searchParams: URLSearchParams, showParam: string, id: number): string {
  const next = new URLSearchParams(searchParams);
  next.set(showParam, String(id));
  return `?${next.toString()}`;
}
