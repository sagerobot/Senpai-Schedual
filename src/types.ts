export interface EpisodeLog {
  showId: number;
  episodeNumber: number;
  watchedAt: number;
  score: number | null;
}

export interface AnimeMedia {
  id: number;
  idMal: number | null;
  averageScore: number | null;
  title: {
    romaji: string;
    english: string;
    userPreferred: string;
  };
  bannerImage: string | null;
  studios?: {
    nodes: {
      name: string;
    }[];
  };
  coverImage: {
    extraLarge?: string;
    large: string;
    color: string;
  };
  trailer?: {
    id: string;
    site: string;
    thumbnail: string;
  };
  startDate: {
    year: number;
    month: number;
    day: number;
  };
  nextAiringEpisode: {
    airingAt: number;
    timeUntilAiring: number;
    episode: number;
  } | null;
  status: string;
  format: string;
  episodes: number;
  externalLinks: {
    url: string;
    site: string;
    icon: string;
    color: string;
  }[];
  genres: string[];
  description: string;
  trending?: number;
  relations?: {
    edges: {
      relationType: string;
      node: {
        id: number;
        title: {
          userPreferred: string;
        };
        type: string;
        averageScore: number | null;
      };
    }[];
  };
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

export type ViewMode = 'schedule' | 'season' | 'favorites' | 'library' | 'recommendations' | 'search' | 'mockups';
