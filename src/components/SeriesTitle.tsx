import React, { useEffect, useState } from 'react';
import { getCachedSeriesGraph, resolveSeriesGraph, SeriesGraph } from '../utils/seriesResolution';
import { Loader2 } from 'lucide-react';

export function SeriesTitle({ showId, fallbackTitle }: { showId: number, fallbackTitle: string }) {
  const [graph, setGraph] = useState<SeriesGraph | null>(getCachedSeriesGraph(showId));
  
  useEffect(() => {
    if (!graph) {
      resolveSeriesGraph(showId).then(g => {
        if (g) setGraph(g);
      });
    }
  }, [showId, graph]);

  if (!graph) {
    return <>{fallbackTitle}</>;
  }

  const entry = graph.entries.find(e => e.id === showId);
  if (!entry) return <>{fallbackTitle}</>;

  if (entry.seasonLabel === graph.title || entry.seasonLabel === entry.title) {
    return <>{entry.title}</>;
  }

  return (
    <div className="flex flex-col">
      <span className="text-xs text-purple-400 font-medium leading-none mb-1 line-clamp-1">{graph.title}</span>
      <span className="line-clamp-1">{entry.seasonLabel}</span>
    </div>
  );
}
