import { History, Link } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { EpisodeCard } from '../../components/EpisodeCard';
import { displayTitle } from '../../lib/displayTitle';
import { cn } from '../../lib/utils';
import { pickWatchLink } from '../../lib/watchLinks';
import { useVibesIndex } from '../../queries/vibes';
import { useSeriesGraphs } from '../../series/useSeriesGraphs';
import { AnimeMedia, EpisodeLog } from '../../types';

interface CatchUpQueueProps {
  animeList: AnimeMedia[];
  favorites: number[];
  logs: EpisodeLog[];
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onAnimeSelect: (anime: AnimeMedia) => void;
}

interface QueueItem {
  anime: AnimeMedia;
  airedCount: number;
  watched: number[];
  behindCount: number;
  nextAiring: number;
}

type SortOption = 'soonest' | 'most_behind' | 'alphabetical';

/**
 * A thin list container since PR 15: the queue math, series grouping, and
 * ordering live here; every row is the shared EpisodeCard. `onLog` arrives
 * from watching/route.tsx already wrapped with an undo toast — no toasting
 * here.
 */
export function CatchUpQueue({ animeList, favorites, logs, onLog, onAnimeSelect }: CatchUpQueueProps) {
  const [sortBy, setSortBy] = useState<SortOption>('soonest');
  const [groupSeasons, setGroupSeasons] = useState(true);
  const vibes = useVibesIndex();

  const getAiredEpisodesCount = (anime: AnimeMedia) => {
    if (anime.nextAiringEpisode) {
      return Math.max(0, anime.nextAiringEpisode.episode - 1);
    } else if (anime.status === 'FINISHED' || anime.status === 'RELEASING') {
      return anime.episodes || 0;
    }
    return 0;
  };

  const queueData = useMemo(() => {
    let totalBehind = 0;

    const queue = favorites
      .map((id): QueueItem | null => {
        const anime = animeList.find((a) => a.id === id);
        if (!anime) return null;

        const airedCount = getAiredEpisodesCount(anime);
        if (airedCount === 0) return null;

        const watched = logs.filter((l) => l.showId === id).map((l) => l.episodeNumber);
        const behindCount = airedCount - watched.length;

        if (behindCount <= 0) return null;

        totalBehind += behindCount;

        return {
          anime,
          airedCount,
          watched,
          behindCount,
          nextAiring: anime.nextAiringEpisode?.timeUntilAiring ?? Infinity,
        };
      })
      .filter((item): item is QueueItem => item !== null);

    queue.sort((a, b) => {
      if (sortBy === 'soonest') return a.nextAiring - b.nextAiring;
      if (sortBy === 'alphabetical') {
        return displayTitle(a.anime).localeCompare(displayTitle(b.anime));
      }
      return b.behindCount - a.behindCount;
    });

    return { queue, totalBehind };
  }, [animeList, favorites, logs, sortBy]);

  // One resolution pass for the whole queue. The old code called a
  // localStorage-reading lookup once per item *and* once per relation edge
  // inside the memo below — hundreds of JSON.parses on every keystroke-level
  // re-render, and the app's main source of input lag.
  const queueIds = useMemo(() => queueData.queue.map((item) => item.anime.id), [queueData.queue]);
  const { graphs } = useSeriesGraphs(queueIds);

  const seriesIdByShow = useMemo(() => {
    const map = new Map<number, number>();
    for (const graph of Object.values(graphs)) {
      for (const entry of graph.entries) map.set(entry.id, graph.seriesId);
    }
    return map;
  }, [graphs]);

  // Per-show labeling info from the resolved graphs: the REAL seasonLabel
  // (fixes the old "Season {index+1}" mislabeling when the user is only behind
  // on later seasons), the franchise title for group headers, and how many
  // seasons the franchise has (a lone-season show doesn't need a chip).
  const seriesInfoByShow = useMemo(() => {
    const map = new Map<number, { seasonLabel: string; seriesTitle: string; seasonCount: number }>();
    for (const graph of Object.values(graphs)) {
      const seasonCount = graph.entries.filter((e) => !e.isAttachment).length;
      for (const entry of graph.entries) {
        map.set(entry.id, { seasonLabel: entry.seasonLabel, seriesTitle: graph.title, seasonCount });
      }
    }
    return map;
  }, [graphs]);

  const groupedQueue = useMemo(() => {
    if (!groupSeasons) {
      return queueData.queue.map((item) => [item]);
    }

    const groups = new Map<number, QueueItem[]>();

    // Group by resolved series id; a show whose graph has not resolved yet is
    // its own root until it does.
    for (const item of queueData.queue) {
      const rootId = seriesIdByShow.get(item.anime.id) ?? item.anime.id;

      if (!groups.has(rootId)) {
        groups.set(rootId, []);
      }
      groups.get(rootId)!.push(item);
    }

    // Fallback for items whose graph is still resolving: union roots that are
    // directly related to each other, so two seasons of one franchise do not
    // render as two cards for the second or two it takes to resolve.
    const parent = new Map<number, number>();
    for (const root of groups.keys()) {
      parent.set(root, root);
    }

    function find(i: number): number {
      if (parent.get(i) === i) return i;
      const p = find(parent.get(i)!);
      parent.set(i, p);
      return p;
    }

    function union(i: number, j: number) {
      if (!parent.has(i) || !parent.has(j)) return;
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) parent.set(rootI, rootJ);
    }

    for (const group of groups.values()) {
      for (const item of group) {
        if (!item.anime.relations?.edges) continue;
        for (const edge of item.anime.relations.edges) {
          if (edge.node.type === 'ANIME') {
            const rootI = seriesIdByShow.get(item.anime.id) ?? item.anime.id;
            const rootJ = seriesIdByShow.get(edge.node.id) ?? edge.node.id;

            if (parent.has(rootI) && parent.has(rootJ)) {
              union(rootI, rootJ);
            }
          }
        }
      }
    }

    const finalGroups = new Map<number, QueueItem[]>();
    for (const [root, groupItems] of groups.entries()) {
      const finalRoot = find(root);
      if (!finalGroups.has(finalRoot)) finalGroups.set(finalRoot, []);
      finalGroups.get(finalRoot)!.push(...groupItems);
    }

    // Sort items within each group by start date, then sort the groups
    // themselves by their first item's order in the original queue.
    const originalOrder = new Map(queueData.queue.map((item, i) => [item.anime.id, i]));
    return Array.from(finalGroups.values())
      .map((group) => {
        return group.sort((a, b) => {
          const dateA = (a.anime.startDate?.year || 9999) * 10000 + (a.anime.startDate?.month || 1) * 100 + (a.anime.startDate?.day || 1);
          const dateB = (b.anime.startDate?.year || 9999) * 10000 + (b.anime.startDate?.month || 1) * 100 + (b.anime.startDate?.day || 1);
          return dateA - dateB;
        });
      })
      .sort((groupA, groupB) => {
        const minIndexA = Math.min(...groupA.map((item) => originalOrder.get(item.anime.id) ?? 99999));
        const minIndexB = Math.min(...groupB.map((item) => originalOrder.get(item.anime.id) ?? 99999));
        return minIndexA - minIndexB;
      });
  }, [queueData.queue, groupSeasons, seriesIdByShow]);

  if (queueData.queue.length === 0) return null;

  const nextUnwatchedEp = (item: QueueItem): number | undefined =>
    Array.from({ length: item.airedCount }, (_, i) => i + 1).find((ep) => !item.watched.includes(ep));

  const airsInfoFor = (item: QueueItem): string | undefined =>
    item.anime.nextAiringEpisode
      ? `Next episode in ${Math.ceil(item.anime.nextAiringEpisode.timeUntilAiring / 3600)}h`
      : undefined;

  // The chip is about the episode the row is asking you to watch next, not the
  // most recent one — that is the decision the row exists to help with.
  const vibeFor = (item: QueueItem) => vibes.get(item.anime.id, nextUnwatchedEp(item) ?? item.airedCount);

  const renderItem = (item: QueueItem) => {
    const info = seriesInfoByShow.get(item.anime.id);
    return (
      <motion.div
        key={item.anime.id}
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="h-full"
      >
        <EpisodeCard
          anime={item.anime}
          seasonLabel={info && info.seasonCount > 1 ? info.seasonLabel : undefined}
          badge="behind"
          behindCount={item.behindCount}
          progress={{ watched: item.watched.length, aired: item.airedCount }}
          nextEpisodeToWatch={nextUnwatchedEp(item)}
          airsInfo={airsInfoFor(item)}
          vibe={vibeFor(item)}
          watchLink={pickWatchLink(item.anime.externalLinks)}
          onOpen={() => onAnimeSelect(item.anime)}
          onLog={(ep, score) => onLog(item.anime.id, ep, score)}
        />
      </motion.div>
    );
  };

  const renderGroup = (group: QueueItem[]) => {
    const firstItem = group[0];
    const franchiseTitle = seriesInfoByShow.get(firstItem.anime.id)?.seriesTitle ?? displayTitle(firstItem.anime);

    const totalWatched = group.reduce((acc, item) => acc + item.watched.length, 0);
    const totalAired = group.reduce((acc, item) => acc + item.airedCount, 0);
    const totalPct = totalAired > 0 ? Math.min(100, (totalWatched / totalAired) * 100) : 0;

    // The first season with an aired-but-unwatched episode gets the action
    // row; later seasons stay compact so "continue in order" reads top-down.
    let currentIndex = group.findIndex((item) => nextUnwatchedEp(item) !== undefined);
    if (currentIndex === -1) currentIndex = 0;

    return (
      <motion.div
        key={`group-${firstItem.anime.id}`}
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="flex h-full flex-col gap-3 rounded-2xl border border-edge bg-surface-0 p-4 shadow-xl sm:col-span-2 sm:p-5"
      >
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onAnimeSelect(firstItem.anime)} className="min-w-0 text-left">
            <span className="line-clamp-1 text-base font-bold text-gray-100 transition-colors hover:text-accent-300">
              {franchiseTitle}
            </span>
          </button>
          <span className="shrink-0 rounded border border-accent-500/30 bg-accent-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-300">
            {group.length} seasons
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="progressbar"
            aria-label={`${totalWatched} of ${totalAired} episodes watched across the series`}
            aria-valuemin={0}
            aria-valuemax={totalAired}
            aria-valuenow={totalWatched}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"
          >
            <div className="h-full rounded-full bg-accent-500 transition-all duration-500" style={{ width: `${totalPct}%` }} />
          </div>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-gray-400">
            {totalWatched} / {totalAired}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-3">
          {group.map((item, idx) => (
            <EpisodeCard
              key={item.anime.id}
              anime={item.anime}
              seasonLabel={seriesInfoByShow.get(item.anime.id)?.seasonLabel}
              badge="behind"
              behindCount={item.behindCount}
              progress={{ watched: item.watched.length, aired: item.airedCount }}
              nextEpisodeToWatch={idx === currentIndex ? nextUnwatchedEp(item) : undefined}
              airsInfo={airsInfoFor(item)}
              vibe={vibeFor(item)}
              watchLink={pickWatchLink(item.anime.externalLinks)}
              onOpen={() => onAnimeSelect(item.anime)}
              onLog={(ep, score) => onLog(item.anime.id, ep, score)}
              className="h-auto"
            />
          ))}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="mb-12">
      <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between mb-8 bg-[#0c0a15]/50 border border-[#2e1d52]/60 p-4 sm:p-5 rounded-[16px] shadow-sm backdrop-blur-sm">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="relative flex h-5 w-5 items-center justify-center">
              <History className="w-5 h-5 text-[#b0a4ff]" />
            </span>
            Catch-up Queue
          </h2>
          <p className="text-gray-400 mt-1.5 text-sm flex items-center gap-2">
            You are <span className="px-2 py-0.5 bg-[#8b31ff]/20 text-[#b0a4ff] rounded border border-[#8b31ff]/30 font-bold">{queueData.totalBehind}</span> episodes behind across your tracked shows
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
          <button
            onClick={() => setSortBy('soonest')}
            className={cn("px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-all flex-1 sm:flex-auto border", sortBy === 'soonest' ? "bg-[#1f1638] border-[#8b31ff] text-[#b0a4ff] shadow-[0_0_10px_rgba(139,49,255,0.2)]" : "bg-[#0c0a15] border-[#2e1d52] text-gray-400 hover:text-gray-200 hover:border-[#3b2165]")}
          >
            Airing Soon
          </button>
          <button
            onClick={() => setSortBy('most_behind')}
            className={cn("px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-all flex-1 sm:flex-auto border", sortBy === 'most_behind' ? "bg-[#1f1638] border-[#8b31ff] text-[#b0a4ff] shadow-[0_0_10px_rgba(139,49,255,0.2)]" : "bg-[#0c0a15] border-[#2e1d52] text-gray-400 hover:text-gray-200 hover:border-[#3b2165]")}
          >
            Most Behind
          </button>
          <button
            onClick={() => setSortBy('alphabetical')}
            className={cn("px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-all flex-1 sm:flex-auto border", sortBy === 'alphabetical' ? "bg-[#1f1638] border-[#8b31ff] text-[#b0a4ff] shadow-[0_0_10px_rgba(139,49,255,0.2)]" : "bg-[#0c0a15] border-[#2e1d52] text-gray-400 hover:text-gray-200 hover:border-[#3b2165]")}
          >
            A-Z
          </button>
          <button
            onClick={() => setGroupSeasons(!groupSeasons)}
            className={cn("px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-all flex-1 sm:flex-auto flex items-center gap-1.5 justify-center border", groupSeasons ? "bg-[#1f1638] border-[#8b31ff] text-[#b0a4ff] shadow-[0_0_10px_rgba(139,49,255,0.2)]" : "bg-[#0c0a15] border-[#2e1d52] text-gray-400 hover:text-gray-200 hover:border-[#3b2165]")}
          >
            <Link className="w-3.5 h-3.5" />
            Group Series
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 grid-flow-row-dense">
        <AnimatePresence mode="popLayout">
          {groupedQueue.map((group) => {
            if (!groupSeasons || group.length === 1) {
              return group.map((item) => renderItem(item));
            }
            return renderGroup(group);
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
