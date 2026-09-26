import { useMemo } from 'react';
import { latestAiredEpisode } from '../lib/aired';
import { OWNING_STATUSES } from '../lib/dropAudience';
import { DROP_WINDOW_SEC } from '../lib/freshness';
import { RUNWAY_WINDOW_SEC } from '../lib/runway';
import { useSeriesGraphs } from '../series/useSeriesGraphs';
import type { AnimeMedia, LibraryEntry } from '../types';

const NO_IDS: number[] = [];
const OWNING = new Set<string>(OWNING_STATUSES);

/**
 * Is episode 1 of this entry on the runway or inside the drop window? Only
 * those shows are worth a franchise lookup — a handful a day, not the season.
 */
function premiereInReach(anime: AnimeMedia, nowSec: number): boolean {
  const next = anime.nextAiringEpisode;
  if (next?.episode === 1 && next.airingAt > nowSec && next.airingAt - nowSec <= RUNWAY_WINDOW_SEC) return true;
  const latest = latestAiredEpisode(anime, nowSec);
  if (latest?.episode !== 1) return false;
  const age = nowSec - latest.airedAt;
  return age >= 0 && age <= DROP_WINDOW_SEC;
}

/**
 * Guest season premieres: a new season whose own entry isn't in the library,
 * of a franchise you already follow (another season watching, completed,
 * shelved or stacking). AniList files every season as its own entry, so
 * without this a returning favourite's Season 2 would premiere as a stranger.
 *
 * Only the premiere candidates are resolved. Shows that arrived through the
 * season bundle already have their graph primed in the query cache, so the
 * common case costs no request at all; anything else goes through the shared
 * rate-limited AniList client like every other graph.
 *
 * Returns a stable array identity while the answer doesn't change, because
 * the drops memo downstream reads the clock whenever its inputs change.
 */
export function useGuestPremieres(animeList: AnimeMedia[], library: Record<number, LibraryEntry>): number[] {
  const candidates = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const ids = animeList.filter((a) => library[a.id] === undefined && premiereInReach(a, now)).map((a) => a.id);
    return ids.length === 0 ? NO_IDS : ids;
  }, [animeList, library]);

  const { graphs } = useSeriesGraphs(candidates);

  const key = useMemo(() => {
    if (candidates.length === 0) return '';
    const all = Object.values(graphs);
    return candidates
      .filter((id) => {
        const graph = all.find((g) => g.entries.some((e) => e.id === id));
        if (!graph) return false;
        return graph.entries.some((e) => e.id !== id && OWNING.has(library[e.id]?.status ?? ''));
      })
      .join(',');
  }, [candidates, graphs, library]);

  return useMemo(() => (key === '' ? NO_IDS : key.split(',').map(Number)), [key]);
}
