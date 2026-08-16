import { LibraryStatus } from '../types';

/** Single source of truth for library-status display names. */
export const LIBRARY_STATUS_LABELS: Record<LibraryStatus, string> = {
  watching: 'Watching',
  plan_to_watch: 'Planning',
  stacking: 'Stacking',
  completed: 'Completed',
  on_hold: 'Shelved',
  dropped: 'Dropped',
};

export const LIBRARY_STATUS_ORDER: LibraryStatus[] = [
  'watching',
  'plan_to_watch',
  'stacking',
  'completed',
  'on_hold',
  'dropped',
];

/**
 * Where the viewer stands relative to a show's airing schedule.
 * This is the only watch-state vocabulary — no per-component variants.
 */
export type WatchState = 'caught-up' | 'behind' | 'airing-soon' | 'finished' | 'not-started' | 'stack-complete';

export const WATCH_STATE_LABELS: Record<WatchState, string> = {
  'caught-up': 'Caught up',
  behind: 'Behind',
  'airing-soon': 'Airing soon',
  finished: 'Finished',
  'not-started': 'Not started',
  /** A stacking show whose wait is over — the graduation, not a debt. */
  'stack-complete': 'Stack complete',
};

/** Tailwind classes per watch state, used by StatusBadge. */
export const WATCH_STATE_CLASSES: Record<WatchState, string> = {
  'caught-up': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'stack-complete': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  behind: 'bg-accent-500/20 text-accent-300 border-accent-500/30',
  'airing-soon': 'bg-accent-500/10 text-accent-300 border-accent-500/20',
  finished: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'not-started': 'bg-surface-3 text-gray-300 border-edge',
};
