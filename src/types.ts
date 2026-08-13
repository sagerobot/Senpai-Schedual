export type { AnimeMedia } from './api/anilist/schemas';

export interface EpisodeLog {
  showId: number;
  episodeNumber: number;
  watchedAt: number;
  score: number | null;
}

export type LibraryStatus = 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch' | 'stacking';

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
