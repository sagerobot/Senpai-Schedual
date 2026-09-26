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
export type WatchState =
  | 'caught-up'
  | 'behind'
  | 'airing-soon'
  | 'finished'
  | 'not-started'
  | 'stack-complete'
  | 'premiere';

export const WATCH_STATE_LABELS: Record<WatchState, string> = {
  'caught-up': 'Caught up',
  behind: 'Behind',
  'airing-soon': 'Airing soon',
  finished: 'Finished',
  'not-started': 'Not started',
  /** A stacking show whose wait is over — the graduation, not a debt. */
  'stack-complete': 'Stack complete',
  /** Episode 1 of a series or a new season. */
  premiere: 'Premiere',
};

/**
 * A guest season premiere's chip: its franchise is yours, this entry isn't
 * in Watching yet, so next week's episode won't drop unless you add it.
 */
export const NOT_IN_WATCHING_LABEL = 'Not in Watching';

/** Tailwind classes per watch state, used by StatusBadge. */
export const WATCH_STATE_CLASSES: Record<WatchState, string> = {
  'caught-up': 'bg-success-500/20 text-success-300 border-success-500/30',
  'stack-complete': 'bg-success-500/15 text-success-300 border-success-500/40',
  premiere: 'bg-accent-500/15 text-accent-300 border-accent-500/40',
  behind: 'bg-accent-500/20 text-accent-300 border-accent-500/30',
  'airing-soon': 'bg-accent-500/10 text-accent-300 border-accent-500/20',
  finished: 'bg-info-500/20 text-info-300 border-info-500/30',
  'not-started': 'bg-surface-3 text-fg-secondary border-edge',
};
