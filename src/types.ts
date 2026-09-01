export type { AnimeMedia } from './api/anilist/schemas';

export interface EpisodeLog {
  showId: number;
  episodeNumber: number;
  watchedAt: number;
  score: number | null;
}

export type LibraryStatus = 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch' | 'stacking';

/**
 * A "skip this week" on a Today's Drops card. Keyed by showId in the store —
 * one live skip per show — and scoped to a single episode: episode N never
 * drops again, next week's N+1 admits normally. `skippedAt` (ms epoch, like
 * EpisodeLog.watchedAt) lets the Up Next boost expire for episodes that no
 * newer airing ever supersedes (finales).
 */
export interface DropSkip {
  episode: number;
  skippedAt: number;
}

export interface LibraryEntry {
  showId: number;
  idMal: number | null;
  status: LibraryStatus;
  showScore: number | null;
  source: 'manual' | 'mal_import';
  updatedAt?: number;
  simulcastOffset?: number;
  /**
   * Stacking wake condition: surface the show as binge-ready once this many
   * episodes have aired. Absent = wake when the season finishes airing.
   * Only meaningful while status === 'stacking'; kept across status moves so
   * flipping back to Stacking doesn't forget the choice.
   */
  stackWakeCount?: number;
}
