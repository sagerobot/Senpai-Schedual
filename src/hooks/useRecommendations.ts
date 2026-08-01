import { useState, useEffect, useCallback } from 'react';
import { AnimeMedia, LibraryEntry } from '../types';
import { useLibrarySeries } from './useLibrarySeries';

interface RecommendedShow {
  show: AnimeMedia;
  score: number;
  reason: string;
  basedOn: string[];
}

interface RecState {
  lastComputedScoreCount: number;
  items: RecommendedShow[];
  notInterestedIds: number[];
}

export function useRecommendations(library: LibraryEntry[]) {
  const [state, setState] = useState<RecState>(() => {
    const saved = localStorage.getItem('senpai_recommendations');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) { }
    }
    return { lastComputedScoreCount: 0, items: [], notInterestedIds: [] };
  });

  const [loading, setLoading] = useState(false);
  const { graphs: seriesGraphs, resolving } = useLibrarySeries(library);

  useEffect(() => {
    localStorage.setItem('senpai_recommendations', JSON.stringify(state));
  }, [state]);

  const removeRecommendation = useCallback((id: number) => {
    setState(s => ({
      ...s,
      items: s.items.filter(i => i.show.id !== id),
      notInterestedIds: [...s.notInterestedIds, id]
    }));
  }, []);

  const computeIfNeeded = useCallback(async () => {
    if (resolving) return;

    const scoredEntries = library.filter(e => e.showScore !== null);
    if (scoredEntries.length === 0) return;

    if (Math.abs(scoredEntries.length - state.lastComputedScoreCount) >= 5 || state.items.length === 0) {
      setLoading(true);
      try {
        // Collect all related IDs for exclusions
        const excludeSet = new Set<number>();
        Object.values(seriesGraphs).forEach((g: any) => {
          g.entries.forEach(e => excludeSet.add(e.id));
        });

        // Group top entries by series and compute average score
        const seriesScores = new Map<number, { scoreSum: number, count: number }>();
        scoredEntries.forEach(e => {
          let sid = e.showId;
          // Find series ID
          for (const g of Object.values(seriesGraphs) as any[]) {
            if (g.entries.some(ge => ge.id === e.showId)) {
              sid = g.seriesId;
              break;
            }
          }
          if (!seriesScores.has(sid)) seriesScores.set(sid, { scoreSum: 0, count: 0 });
          const curr = seriesScores.get(sid)!;
          curr.scoreSum += e.showScore!;
          curr.count += 1;
        });

        const topSeriesIds = Array.from(seriesScores.entries())
          .map(([sid, stats]) => ({ showId: sid, showScore: stats.scoreSum / stats.count }))
          .sort((a, b) => b.showScore - a.showScore)
          .slice(0, 15);
        
        // Exclude all things from the library graphs + not interested
        const allLibraryIdsToExclude = Array.from(excludeSet);

        const res = await fetch('/api/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            libraryIds: allLibraryIdsToExclude, 
            topEntries: topSeriesIds, 
            notInterestedIds: state.notInterestedIds 
          })
        });
        if (!res.ok) throw new Error('Failed to compute recs');
        const data = await res.json();
        
        // We also need to filter out recommendations that might be part of the excluded series
        // The API returns recommendations based on similar tags, but we should make sure the returned rec isn't inside our excludeSet.
        // The API already excludes libraryIds, but if the API didn't know about series logic, this passes `allLibraryIdsToExclude`, so the API will exclude them.
        
        setState(s => ({
          ...s,
          lastComputedScoreCount: scoredEntries.length,
          items: data.recommendations
        }));
      } catch (err) {
        console.error("Failed to compute recommendations", err);
      } finally {
        setLoading(false);
      }
    }
  }, [library, seriesGraphs, resolving, state.lastComputedScoreCount, state.items.length, state.notInterestedIds]);

  useEffect(() => {
    computeIfNeeded();
  }, [computeIfNeeded]);

  return {
    recommendations: state.items,
    loading: loading || resolving,
    removeRecommendation,
    forceRecompute: () => {
      setState(s => ({...s, lastComputedScoreCount: -1}));
    }
  };
}
