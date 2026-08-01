import { useSeriesGraph } from '../series/useSeriesGraphs';

/**
 * Renders a card title as franchise + season when the show turns out to be one
 * season of something larger. While the graph resolves (or if it fails) the
 * plain title stands in, so nothing ever renders empty.
 */
export function SeriesTitle({ showId, fallbackTitle }: { showId: number; fallbackTitle: string }) {
  const { data: graph } = useSeriesGraph(showId);

  if (!graph) {
    return <>{fallbackTitle}</>;
  }

  const entry = graph.entries.find((e) => e.id === showId);
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
