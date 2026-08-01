export type { AnimeMedia } from './api/anilist/schemas';

export interface EpisodeLog {
  showId: number;
  episodeNumber: number;
  watchedAt: number;
  score: number | null;
}

export type LibraryStatus = 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch';

export interface LibraryEntry {
  showId: number;
  idMal: number | null;
  status: LibraryStatus;
  showScore: number | null;
  source: 'manual' | 'mal_import';
  updatedAt?: number;
  simulcastOffset?: number;
}
