import { useState, useEffect } from 'react';
import { getCachedSeriesGraph, resolveSeriesGraph, SeriesGraph } from '../utils/seriesResolution';

export function useSeriesGraph(id: number) {
  const [graph, setGraph] = useState<SeriesGraph | null>(getCachedSeriesGraph(id));
  const [loading, setLoading] = useState(!graph);

  useEffect(() => {
    if (!graph) {
      setLoading(true);
      resolveSeriesGraph(id).then(res => {
        setGraph(res);
        setLoading(false);
      });
    }
  }, [id, graph]);

  return { graph, loading };
}
