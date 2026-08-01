import { AnimeMedia } from '../types';

export interface LatestAired {
  episode: number;
  /** Unix seconds. Exact when the schedule data itself proves the airing;
   * estimated (airingAt - 7 days) when inferred from a future next episode. */
  airedAt: number;
  estimated: boolean;
}

/**
 * The latest aired episode, robust to STALE schedule data.
 *
 * AniList advances `nextAiringEpisode` to the following episode only when the
 * data is refetched — and the season bundle refreshes every 8 hours, so for up
 * to 8 hours after an episode airs, `nextAiringEpisode` still points AT the
 * episode that just aired, with its `airingAt` in the past. An airingAt in the
 * past IS the aired signal; treating only `episode - 1` as aired made Today's
 * Drops (and behind-counts) blind to anything that aired since the last
 * refresh.
 */
export function latestAiredEpisode(anime: AnimeMedia, nowSec: number): LatestAired | null {
  const next = anime.nextAiringEpisode;
  if (!next) return null;
  if (next.airingAt <= nowSec) {
    return { episode: next.episode, airedAt: next.airingAt, estimated: false };
  }
  if (next.episode > 1) {
    return { episode: next.episode - 1, airedAt: next.airingAt - 7 * 24 * 3600, estimated: true };
  }
  return null;
}

/** Aired-episode count for progress/behind math, same staleness rule. */
export function getAiredEpisodesCount(anime: AnimeMedia, nowSec: number): number {
  const latest = latestAiredEpisode(anime, nowSec);
  if (latest !== null) return Math.max(0, latest.episode);
  if (anime.status === 'FINISHED' || anime.status === 'RELEASING') return anime.episodes ?? 0;
  return 0;
}
