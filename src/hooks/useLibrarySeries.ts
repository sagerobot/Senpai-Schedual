import { useState, useEffect } from 'react';
import { getCachedSeriesGraph, resolveSeriesGraph, SeriesGraph } from '../utils/seriesResolution';
import { LibraryEntry } from '../types';

export function useLibrarySeries(library: LibraryEntry[]) {
  const [graphs, setGraphs] = useState<Record<number, SeriesGraph>>({});
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let active = true;
    
    async function resolveAll() {
      setResolving(true);
      const newGraphs = { ...graphs };
      let changed = false;

      for (const entry of library) {
        if (!active) break;
        let g = getCachedSeriesGraph(entry.showId);
        if (!g) {
          g = await resolveSeriesGraph(entry.showId);
        }
        if (g && !newGraphs[g.seriesId]) {
          newGraphs[g.seriesId] = g;
          changed = true;
        }
      }

      if (active && changed) {
        setGraphs(newGraphs);
      }
      if (active) setResolving(false);
    }

    resolveAll();
    
    return () => { active = false; };
  }, [library]);

  return { graphs, resolving };
}
