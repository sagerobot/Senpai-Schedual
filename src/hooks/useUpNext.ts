import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { foldSeriesCandidates, rankUpNext, UpNextCandidate } from '../lib/upNext';
import { useMediaByIds } from '../queries/hooks';
import { useSeriesGraphs } from '../series/useSeriesGraphs';
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

/** A stable empty array, so the graph query set doesn't re-subscribe every render. */
const NO_IDS: number[] = [];

export interface UseUpNextResult {
  candidates: UpNextCandidate[];
  /** "Not tonight" for a card — every season folded into it goes with it. */
  skip: (showId: number) => void;
  /** Shows still resolving through the id_in micro-batcher. */
  pendingCount: number;
}

/**
 * Ranked Up Next candidates for the deck. Resolves library shows the hosting
 * view's list doesn't carry (past-season stacking shows, most importantly)
 * through the shared `['media', id]` cache, so both hosts stay cheap.
 *
 * Same-franchise candidates fold into one card (foldSeriesCandidates) using
 * the series graphs already in the query cache — the bundle primes them and
 * the Library view resolves them, so this rarely costs a request. Graphs are
 * only asked for when there are at least two candidates: one card can't fold.
 */
export function useUpNext(animeList: AnimeMedia[]): UseUpNextResult {
  const library = useUserData(selectLibraryArray);
  const logs = useUserData(selectLogsArray);
  const dropSkips = useUserData((s) => s.dropSkips);
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

  const ranked = useMemo(() => {
    void skipTick; // re-filter after a skip; the set itself is module state
    const merged = new Map<number, AnimeMedia>();
    animeList.forEach((a) => merged.set(a.id, a));
    resolvedMedia.forEach((a) => merged.set(a.id, a));
    return rankUpNext({
      animeList: Array.from(merged.values()),
      library,
      logs,
      nowSec: Math.floor(Date.now() / 1000),
      dropSkips,
    }).filter((c) => !skippedTonight.has(c.anime.id));
  }, [animeList, resolvedMedia, library, logs, dropSkips, skipTick]);

  const graphIds = useMemo(
    () => (ranked.length > 1 ? ranked.map((c) => c.anime.id) : NO_IDS),
    [ranked],
  );
  const { graphs } = useSeriesGraphs(graphIds);

  const candidates = useMemo(
    () => foldSeriesCandidates(ranked, Object.values(graphs)),
    [ranked, graphs],
  );

  // Skips are keyed by the raw show ids the ranking filters on, so a skipped
  // franchise card must mark every season it folded — hiding only the lead
  // would deal the next season straight back in, out of order.
  const foldedRef = useRef<UpNextCandidate[]>(candidates);
  useEffect(() => {
    foldedRef.current = candidates;
  }, [candidates]);

  const skip = useCallback((showId: number) => {
    skippedTonight.add(showId);
    const card = foldedRef.current.find(
      (c) => c.anime.id === showId || c.series?.then.some((q) => q.anime.id === showId),
    );
    if (card) {
      skippedTonight.add(card.anime.id);
      for (const queued of card.series?.then ?? []) skippedTonight.add(queued.anime.id);
    }
    setSkipTick((t) => t + 1);
  }, []);

  return { candidates, skip, pendingCount };
}
