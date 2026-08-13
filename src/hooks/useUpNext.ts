import { useCallback, useMemo, useState } from 'react';
import { rankUpNext, UpNextCandidate } from '../lib/upNext';
import { useMediaByIds } from '../queries/hooks';
import { selectLibraryArray, selectLogsArray, useUserData } from '../stores/userData';
import { AnimeMedia } from '../types';

/**
 * "Not tonight" skips. Module-level so a route hop doesn't resurrect a skipped
 * card; a reload does, which is the intended "for tonight" scope. Same pattern
 * as CheckInFeed's admittedDrops.
 */
const skippedTonight = new Set<number>();

/** Test hook. */
export function resetSkippedTonight(): void {
  skippedTonight.clear();
}

export interface UseUpNextResult {
  candidates: UpNextCandidate[];
  skip: (showId: number) => void;
  /** Shows still resolving through the id_in micro-batcher. */
  pendingCount: number;
}

/**
 * Ranked Up Next candidates for the deck. Resolves library shows the hosting
 * view's list doesn't carry (past-season stacking shows, most importantly)
 * through the shared `['media', id]` cache, so both hosts stay cheap.
 */
export function useUpNext(animeList: AnimeMedia[]): UseUpNextResult {
  const library = useUserData(selectLibraryArray);
  const logs = useUserData(selectLogsArray);
  const [skipTick, setSkipTick] = useState(0);

  const neededIds = useMemo(
    () =>
      library
        .filter((e) => e.status === 'watching' || e.status === 'stacking')
        .map((e) => e.showId),
    [library],
  );
  const presentIds = useMemo(() => new Set(animeList.map((a) => a.id)), [animeList]);
  const missingIds = useMemo(
    () => neededIds.filter((id) => !presentIds.has(id)),
    [neededIds, presentIds],
  );
  const { media: resolvedMedia, pendingCount } = useMediaByIds(missingIds);

  const candidates = useMemo(() => {
    void skipTick; // re-filter after a skip; the set itself is module state
    const merged = new Map<number, AnimeMedia>();
    animeList.forEach((a) => merged.set(a.id, a));
    resolvedMedia.forEach((a) => merged.set(a.id, a));
    return rankUpNext({
      animeList: Array.from(merged.values()),
      library,
      logs,
      nowSec: Math.floor(Date.now() / 1000),
    }).filter((c) => !skippedTonight.has(c.anime.id));
  }, [animeList, resolvedMedia, library, logs, skipTick]);

  const skip = useCallback((showId: number) => {
    skippedTonight.add(showId);
    setSkipTick((t) => t + 1);
  }, []);

  return { candidates, skip, pendingCount };
}
