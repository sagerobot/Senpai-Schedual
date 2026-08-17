import { ChevronRight, Clock, History, Info, Link, Play, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { LowScoreButtons } from "../../components/LowScoreButtons";
import { VibeChip } from '../../components/VibeChip';
import { getAiredEpisodesCount } from '../../lib/aired';
import { displayTitle } from '../../lib/displayTitle';
import { cn } from '../../lib/utils';
import { pickWatchLink } from '../../lib/watchLinks';
import { useVibesIndex } from '../../queries/vibes';
import { useUserData } from '../../stores/userData';
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

/** The grouped card offers the whole scale; the single card keeps the quick row. */
const ALL_SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const QUICK_SCORES = [5, 6, 7, 8, 9, 10];

/**
 * The catch-up queue: one rich card per show, or one card per franchise with
 * expandable season rows when "Group Series" is on.
 *
 * `onLog` arrives from watching/route.tsx already wrapped with an undo toast —
 * no toasting here.
 */
export function CatchUpQueue({ animeList, favorites, logs, onLog, onAnimeSelect }: CatchUpQueueProps) {
  const [sortBy, setSortBy] = useState<SortOption>('soonest');
  const [groupSeasons, setGroupSeasons] = useState(true);
  const vibes = useVibesIndex();
  const customSite = useUserData((s) => s.uiPrefs.customSource?.name);

  const queueData = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    let totalBehind = 0;

    const queue = favorites
      .map((id): QueueItem | null => {
        const anime = animeList.find((a) => a.id === id);
        if (!anime) return null;

        const airedCount = getAiredEpisodesCount(anime, now);
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

  /** The graph's real label — never the row's position in the filtered group. */
  const seasonLabelFor = (item: QueueItem): string =>
    seriesInfoByShow.get(item.anime.id)?.seasonLabel ?? displayTitle(item.anime);

  // The chip is about the episode the row is asking you to watch next, not the
  // most recent one — that is the decision the row exists to help with.
  const vibeFor = (item: QueueItem) => vibes.get(item.anime.id, nextUnwatchedEp(item) ?? item.airedCount);

  /** One show, one card: cover, progress ring, per-episode ticks, rate row. */
  const renderItem = (item: QueueItem) => {
    const title = displayTitle(item.anime);
    const info = seriesInfoByShow.get(item.anime.id);
    const progress = item.airedCount > 0 ? (item.watched.length / item.airedCount) * 100 : 0;
    const nextUnwatched = nextUnwatchedEp(item);
    const watchLink = pickWatchLink(item.anime.externalLinks, customSite);
    const openShow = () => onAnimeSelect(item.anime);

    return (
      <motion.div
        layout
        key={item.anime.id}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="flex flex-col overflow-hidden rounded-card bg-hero-catchup-bg border border-hero-catchup-edge shadow-e2 group h-full"
      >
        <div className="flex gap-4 p-4 relative z-10 min-h-[132px]">
          <button
            type="button"
            onClick={openShow}
            aria-label={`Open ${title}`}
            className="relative shrink-0 w-[64px] h-[92px]"
          >
            <img
              src={item.anime.coverImage.extraLarge || item.anime.coverImage.large}
              alt={`${title} cover`}
              className="h-full w-full rounded-control object-cover shadow-e1"
            />
            <span
              className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-danger-500 text-fg-inverse text-micro font-bold flex items-center justify-center z-10 shadow-e1 border border-hero-catchup-bg"
              aria-hidden="true"
            >
              {item.behindCount}
            </span>
          </button>

          <div className="flex flex-1 flex-col min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3>
                  <button
                    type="button"
                    onClick={openShow}
                    className="block max-w-full text-left font-bold text-hero-text-hi text-sm leading-snug line-clamp-2 hover:text-hero-catchup-ink transition-colors pr-2"
                  >
                    {title}
                  </button>
                </h3>

                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-caption text-hero-text-mid font-medium">
                  <span>
                    {item.watched.length} / {item.airedCount} logged
                  </span>
                  {info && info.seasonCount > 1 && (
                    <span className="px-1.5 py-0.5 rounded border border-hero-new/50 bg-hero-new/20 text-hero-catchup-ink font-bold text-micro uppercase tracking-wider">
                      {info.seasonLabel}
                    </span>
                  )}
                  <VibeChip vibe={vibeFor(item)} showTitle={title} onOpen={openShow} />
                  {item.anime.nextAiringEpisode && (
                    <span className="flex items-center gap-1 text-warning-500 font-semibold truncate">
                      <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                      Next in {Math.ceil(item.anime.nextAiringEpisode.timeUntilAiring / 3600)}h
                    </span>
                  )}
                </div>
              </div>

              <div
                role="progressbar"
                aria-label={`${item.watched.length} of ${item.airedCount} episodes watched`}
                aria-valuemin={0}
                aria-valuemax={item.airedCount}
                aria-valuenow={item.watched.length}
                className="shrink-0 relative w-[42px] h-[42px] flex items-center justify-center border-[1.5px] border-hero-catchup-edge rounded-full bg-hero-catchup-well"
              >
                <svg className="w-[34px] h-[34px] -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                  <path
                    className="text-hero-catchup-track"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                  />
                  <path
                    className="text-hero-catchup-ink transition-all duration-1000 ease-out"
                    strokeDasharray={`${progress}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-hero-text-hi font-bold text-micro leading-none">{Math.round(progress)}%</span>
                </div>
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-1.5 pb-2">
              <div className="flex gap-[2px] h-[4px] w-full" aria-hidden="true">
                {Array.from({ length: Math.min(item.airedCount, 40) }).map((_, idx) => (
                  <div
                    key={idx}
                    className={cn('h-full flex-1 rounded-full', item.watched.includes(idx + 1) ? 'bg-hero-catchup-ink' : 'bg-hero-catchup-pip')}
                  />
                ))}
                {item.airedCount > 40 && <div className="h-full w-2 rounded-full bg-hero-catchup-ink/30" />}
              </div>
              <div className="flex justify-between items-center text-micro font-medium pt-0.5">
                <span className="text-hero-text-mid">{Math.round(progress)}% overall progress</span>
                <span className="text-hero-text-mid">{item.behindCount} left</span>
              </div>
            </div>
          </div>
        </div>

        {nextUnwatched !== undefined && (
          <div className="flex flex-col px-4 pb-4">
            <div className="flex flex-wrap items-center justify-center gap-2 mb-3 mt-1">
              <span className="flex items-center gap-1.5 text-hero-catchup-ink text-label font-bold">
                <Zap className="w-4 h-4 fill-current" aria-hidden="true" />
                Rate Episode {nextUnwatched}
              </span>
              <LowScoreButtons
                episode={nextUnwatched}
                onSelect={(score) => onLog(item.anime.id, nextUnwatched, score)}
                triggerClassName="h-7 px-2 rounded-full border border-hero-catchup-edge bg-hero-catchup-well text-micro font-bold text-hero-text-mid hover:bg-hero-catchup-well-hover hover:text-hero-text-hi after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
                buttonClassName="h-7 min-w-7 px-1.5 rounded-xs border border-hero-catchup-edge bg-hero-catchup-well text-caption font-bold text-hero-text-mid hover:bg-hero-catchup-well-hover hover:text-fg-inverse"
              />
            </div>

            <div
              role="group"
              aria-label={`Rate episode ${nextUnwatched}, 5 to 10`}
              className="grid grid-cols-6 gap-2 mb-4"
            >
              {QUICK_SCORES.map((score) => (
                <button
                  key={score}
                  type="button"
                  onClick={() => onLog(item.anime.id, nextUnwatched, score)}
                  aria-label={`Rate episode ${nextUnwatched} a ${score} and mark watched`}
                  className="flex h-11 items-center justify-center rounded-control border border-hero-catchup-edge bg-hero-catchup-well text-sm font-bold text-hero-text-mid transition-all hover:border-hero-catchup-ink hover:bg-gradient-to-b hover:from-hero-grad-from hover:to-hero-grad-to hover:text-fg-inverse"
                >
                  {score}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 h-11">
              <button
                type="button"
                onClick={() => onLog(item.anime.id, nextUnwatched, null)}
                aria-label={`Mark episode ${nextUnwatched} watched without a score`}
                className="shrink-0 h-full px-2.5 flex items-center justify-center gap-2 rounded-control border border-hero-catchup-edge bg-hero-catchup-well text-caption font-bold text-hero-text-mid hover:bg-hero-catchup-well-hover transition-colors"
              >
                Watched only <Info className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              {watchLink ? (
                <a
                  href={watchLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 h-full flex items-center justify-center gap-2 rounded-control text-label font-bold text-fg-inverse transition-all shadow-e2 bg-gradient-to-b from-hero-grad-from to-hero-grad-to hover:brightness-110"
                >
                  <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                  Continue Ep {nextUnwatched}
                </a>
              ) : (
                <p className="flex-1 h-full flex items-center justify-center gap-2 rounded-control text-label font-bold text-hero-text-mid bg-hero-catchup-well-hover border border-hero-catchup-edge">
                  No stream linked
                </p>
              )}
            </div>
          </div>
        )}
      </motion.div>
    );
  };

  /** One franchise, one card: shared ring, a row per season, one action row. */
  const renderGroup = (group: QueueItem[]) => {
    const firstItem = group[0];
    const franchiseTitle = seriesInfoByShow.get(firstItem.anime.id)?.seriesTitle ?? displayTitle(firstItem.anime);

    const totalWatched = group.reduce((acc, item) => acc + item.watched.length, 0);
    const totalAired = group.reduce((acc, item) => acc + item.airedCount, 0);
    const totalProgress = totalAired > 0 ? Math.min(100, (totalWatched / totalAired) * 100) : 0;

    // The first season with an aired-but-unwatched episode owns the action row;
    // later seasons stay compact so "continue in order" reads top-down.
    let currentIndex = group.findIndex((item) => nextUnwatchedEp(item) !== undefined);
    if (currentIndex === -1) currentIndex = 0;

    const currentItem = group[currentIndex];
    const nextEpisode = nextUnwatchedEp(currentItem);
    const currentLabel = seasonLabelFor(currentItem);
    const watchLink = pickWatchLink(currentItem.anime.externalLinks, customSite);

    return (
      <motion.div
        layout
        key={`group-${firstItem.anime.id}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="flex flex-col rounded-card border border-hero-catchup-edge bg-hero-catchup-bg shadow-e2 relative overflow-hidden group/series h-full min-h-0 sm:col-span-2"
      >
        <div className="flex flex-col h-full">
          <div className="flex p-5 pb-0 gap-5">
            <button
              type="button"
              onClick={() => onAnimeSelect(firstItem.anime)}
              aria-label={`Open ${displayTitle(firstItem.anime)}`}
              className="w-[100px] sm:w-[110px] shrink-0 relative h-[150px] sm:h-[160px]"
            >
              <img
                src={firstItem.anime.coverImage.extraLarge || firstItem.anime.coverImage.large}
                alt={`${franchiseTitle} cover`}
                className="w-full h-full object-cover rounded-inner shadow-e1"
              />
            </button>

            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex justify-between items-start gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onAnimeSelect(firstItem.anime)}
                        className="block max-w-full truncate text-left font-bold text-hero-text-hi text-base leading-snug hover:text-hero-catchup-ink transition-colors"
                      >
                        {franchiseTitle}
                      </button>
                    </h3>
                    <span className="shrink-0 px-2 py-0.5 rounded border border-hero-catchup-ink/30 bg-hero-catchup-ink/10 text-hero-catchup-ink font-bold text-micro uppercase tracking-wider">
                      {group.length} seasons
                    </span>
                  </div>

                  {nextEpisode !== undefined && (
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.div
                        key={`${currentItem.anime.id}-${nextEpisode}`}
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-wrap items-center gap-1.5"
                      >
                        <Play className="w-[10px] h-[10px] fill-accent-400 text-hero-catchup-ink" aria-hidden="true" />
                        <span className="font-medium text-hero-catchup-ink text-label whitespace-nowrap">Continue in order</span>
                        <span className="text-hero-text-mid text-label font-medium ml-1 min-w-0 truncate">
                          • Next up: {currentLabel} — Ep {nextEpisode}
                        </span>
                        <VibeChip
                          vibe={vibeFor(currentItem)}
                          showTitle={displayTitle(currentItem.anime)}
                          onOpen={() => onAnimeSelect(currentItem.anime)}
                        />
                      </motion.div>
                    </AnimatePresence>
                  )}
                </div>

                <div
                  role="progressbar"
                  aria-label={`${totalWatched} of ${totalAired} episodes watched across ${franchiseTitle}`}
                  aria-valuemin={0}
                  aria-valuemax={totalAired}
                  aria-valuenow={totalWatched}
                  className="shrink-0 relative w-[52px] h-[52px] flex items-center justify-center ml-2 border-[2px] border-hero-catchup-edge rounded-full bg-hero-catchup-well shadow-e2"
                >
                  <svg className="w-[44px] h-[44px] -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                    <path
                      className="text-hero-catchup-track"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                    />
                    <path
                      className="text-hero-catchup-ink transition-all duration-1000 ease-out"
                      strokeDasharray={`${totalProgress}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-hero-text-hi font-bold text-label leading-none">{Math.round(totalProgress)}%</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 relative min-h-0 overflow-y-auto custom-scrollbar pr-1">
                {group.map((season, idx) => {
                  const isCurrent = idx === currentIndex;
                  const label = seasonLabelFor(season);
                  const marker = isCurrent ? 'Current' : idx > currentIndex ? 'Up Next' : 'Done';

                  return (
                    <button
                      key={season.anime.id}
                      type="button"
                      onClick={() => onAnimeSelect(season.anime)}
                      aria-label={`${label}: ${season.watched.length} of ${season.airedCount} episodes watched, ${marker}. Open ${displayTitle(season.anime)}`}
                      className={cn(
                        'w-full flex items-center gap-3 text-left transition-colors p-2.5 rounded-control group/season border',
                        isCurrent ? 'bg-hero-catchup-well-hover border-hero-catchup-edge-strong' : 'bg-hero-catchup-well border-hero-catchup-edge hover:border-hero-catchup-edge-strong',
                      )}
                    >
                      <span className="shrink-0 w-6 flex items-center justify-center" aria-hidden="true">
                        {isCurrent ? (
                          <span className="w-[22px] h-[22px] rounded-full bg-hero-catchup-ink flex items-center justify-center shadow-glow-sm">
                            <Play className="w-[12px] h-[12px] fill-hero-catchup-bg text-hero-catchup-bg ml-0.5" />
                          </span>
                        ) : (
                          <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center">
                            <ChevronRight className="w-[16px] h-[16px] text-hero-catchup-ink" />
                          </span>
                        )}
                      </span>

                      <span className="flex-1 flex items-center gap-4 min-w-0">
                        <span
                          title={label}
                          className={cn(
                            'font-bold text-label w-[86px] shrink-0 truncate transition-colors',
                            isCurrent ? 'text-hero-text-hi' : 'text-hero-text-mid group-hover/season:text-hero-text-hi',
                          )}
                        >
                          {label}
                        </span>
                        <span className="flex-1 flex gap-1 h-[5px]" aria-hidden="true">
                          {Array.from({ length: Math.min(season.airedCount, 30) }).map((_, epIdx) => (
                            <span
                              key={epIdx}
                              className={cn(
                                'h-full flex-1 rounded-full',
                                season.watched.includes(epIdx + 1) ? 'bg-hero-catchup-ink' : 'bg-hero-catchup-edge',
                              )}
                            />
                          ))}
                          {season.airedCount > 30 && <span className="h-full w-2 rounded-full bg-hero-catchup-ink/30" />}
                        </span>
                        <span className="text-xs font-bold text-hero-text-mid shrink-0 text-right">
                          {season.watched.length} / {season.airedCount}
                        </span>
                      </span>

                      <span className="shrink-0 text-right min-w-[50px] flex justify-end" aria-hidden="true">
                        {isCurrent ? (
                          <span className="text-caption px-2.5 py-0.5 rounded border border-hero-catchup-ink/40 bg-hero-catchup-ink/10 font-bold text-hero-catchup-ink">
                            Current
                          </span>
                        ) : idx > currentIndex ? (
                          <span className="text-xs font-medium text-hero-text-low">Up Next</span>
                        ) : (
                          <span className="text-xs font-medium text-success-400/80">Done</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-auto px-5 pb-5">
            {nextEpisode !== undefined && (
              <div className="flex flex-col mt-4 pt-1">
                <div className="flex items-center justify-center gap-1.5 text-hero-catchup-ink text-sm font-bold mb-3 min-w-0">
                  <Zap className="w-4 h-4 fill-current shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    Rate {currentLabel} — Ep {nextEpisode}
                  </span>
                </div>

                {/* Eleven chips fit one row on desktop; on a phone they wrap into
                    two rows of 44px targets rather than shrinking to 27px. */}
                <div
                  role="group"
                  aria-label={`Rate episode ${nextEpisode}, 0 to 10`}
                  className="grid grid-cols-6 sm:flex sm:justify-center gap-1.5 sm:gap-2 mb-4"
                >
                  {ALL_SCORES.map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => onLog(currentItem.anime.id, nextEpisode, score)}
                      aria-label={`Rate episode ${nextEpisode} a ${score} and mark watched`}
                      className="flex h-11 items-center justify-center rounded-field sm:rounded-control border border-hero-catchup-edge bg-hero-catchup-well text-label sm:text-base font-bold text-hero-text-mid transition-all hover:border-hero-catchup-ink hover:bg-gradient-to-b hover:from-hero-grad-from hover:to-hero-grad-to hover:text-fg-inverse sm:h-[42px] sm:flex-1 sm:max-w-[48px]"
                    >
                      {score}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 h-11">
                  <button
                    type="button"
                    onClick={() => onLog(currentItem.anime.id, nextEpisode, null)}
                    aria-label={`Mark episode ${nextEpisode} watched without a score`}
                    className="shrink-0 h-full px-3 flex items-center justify-center gap-2 rounded-control border border-hero-catchup-edge bg-hero-catchup-well text-xs font-bold text-hero-text-mid hover:bg-hero-catchup-well-hover transition-colors"
                  >
                    Watched only <Info className="w-4 h-4" aria-hidden="true" />
                  </button>

                  {watchLink ? (
                    <a
                      href={watchLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 h-full flex items-center justify-center gap-2 rounded-control text-sm font-bold text-fg-inverse transition-all shadow-e2 bg-gradient-to-r from-hero-grad-from to-hero-grad-to hover:brightness-110"
                    >
                      <Play className="w-4 h-4 shrink-0 fill-current" aria-hidden="true" />
                      <span className="truncate">
                        Continue {currentLabel} — Ep {nextEpisode}
                      </span>
                    </a>
                  ) : (
                    <p className="flex-1 h-full flex items-center justify-center gap-2 rounded-control text-sm font-bold text-hero-text-mid bg-hero-catchup-well-hover border border-hero-catchup-edge">
                      No stream linked
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="mb-12">
      <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between mb-8 bg-hero-catchup-bg/50 border border-hero-catchup-edge/60 p-4 sm:p-5 rounded-card shadow-e1 backdrop-blur-sm">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-hero-text-hi flex items-center gap-3">
            <span className="relative flex h-5 w-5 items-center justify-center">
              <History className="w-5 h-5 text-hero-catchup-ink" aria-hidden="true" />
            </span>
            Catch-up Queue
          </h2>
          <p className="text-hero-text-mid mt-1.5 text-sm flex items-center gap-2">
            You are <span className="px-2 py-0.5 bg-hero-grad-from/20 text-hero-catchup-ink rounded border border-hero-grad-from/30 font-bold">{queueData.totalBehind}</span> episodes behind across your tracked shows
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
          <button
            onClick={() => setSortBy('soonest')}
            className={cn("px-4 py-2 rounded-control text-label font-semibold transition-all flex-1 sm:flex-auto border", sortBy === 'soonest' ? "bg-hero-catchup-active border-hero-grad-from text-hero-catchup-ink shadow-glow-sm" : "bg-hero-catchup-bg border-hero-catchup-edge text-hero-text-mid hover:text-hero-text-hi hover:border-hero-catchup-edge-strong")}
          >
            Airing Soon
          </button>
          <button
            onClick={() => setSortBy('most_behind')}
            className={cn("px-4 py-2 rounded-control text-label font-semibold transition-all flex-1 sm:flex-auto border", sortBy === 'most_behind' ? "bg-hero-catchup-active border-hero-grad-from text-hero-catchup-ink shadow-glow-sm" : "bg-hero-catchup-bg border-hero-catchup-edge text-hero-text-mid hover:text-hero-text-hi hover:border-hero-catchup-edge-strong")}
          >
            Most Behind
          </button>
          <button
            onClick={() => setSortBy('alphabetical')}
            className={cn("px-4 py-2 rounded-control text-label font-semibold transition-all flex-1 sm:flex-auto border", sortBy === 'alphabetical' ? "bg-hero-catchup-active border-hero-grad-from text-hero-catchup-ink shadow-glow-sm" : "bg-hero-catchup-bg border-hero-catchup-edge text-hero-text-mid hover:text-hero-text-hi hover:border-hero-catchup-edge-strong")}
          >
            A-Z
          </button>
          <button
            onClick={() => setGroupSeasons(!groupSeasons)}
            className={cn("px-4 py-2 rounded-control text-label font-semibold transition-all flex-1 sm:flex-auto flex items-center gap-1.5 justify-center border", groupSeasons ? "bg-hero-catchup-active border-hero-grad-from text-hero-catchup-ink shadow-glow-sm" : "bg-hero-catchup-bg border-hero-catchup-edge text-hero-text-mid hover:text-hero-text-hi hover:border-hero-catchup-edge-strong")}
          >
            <Link className="w-3.5 h-3.5" aria-hidden="true" />
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
