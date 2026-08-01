import React, { useMemo, useState } from 'react';
import { AnimeMedia, EpisodeLog } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Clock, ChevronRight, History, Play, Link, Zap, Info } from 'lucide-react';
import { getCachedSeriesGraph } from '../utils/seriesResolution';

interface CatchUpQueueProps {
  animeList: AnimeMedia[];
  favorites: number[];
  logs: EpisodeLog[];
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onAnimeSelect: (anime: AnimeMedia) => void;
}

type SortOption = 'soonest' | 'most_behind' | 'alphabetical';

export function CatchUpQueue({ animeList, favorites, logs, onLog, onAnimeSelect }: CatchUpQueueProps) {
  const [sortBy, setSortBy] = useState<SortOption>('soonest');
  const [groupSeasons, setGroupSeasons] = useState(true);

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
    
    const queue = favorites.map(id => {
      const anime = animeList.find(a => a.id === id);
      if (!anime) return null;
      
      const airedCount = getAiredEpisodesCount(anime);
      if (airedCount === 0) return null;

      const watched = logs.filter(l => l.showId === id).map(l => l.episodeNumber);
      const behindCount = airedCount - watched.length;
      
      if (behindCount <= 0) return null;
      
      totalBehind += behindCount;

      return {
        anime,
        airedCount,
        watched,
        behindCount,
        nextAiring: anime.nextAiringEpisode?.timeUntilAiring ?? Infinity
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    queue.sort((a, b) => {
      if (sortBy === 'soonest') return a.nextAiring - b.nextAiring;
      if (sortBy === 'alphabetical') {
        const titleA = a.anime.title.english || a.anime.title.userPreferred;
        const titleB = b.anime.title.english || b.anime.title.userPreferred;
        return titleA.localeCompare(titleB);
      }
      return b.behindCount - a.behindCount;
    });

    return { queue, totalBehind };
  }, [animeList, favorites, logs, sortBy]);


  const groupedQueue = useMemo(() => {
    if (!groupSeasons) {
      return queueData.queue.map(item => [item]);
    }

    const groups = new Map<number, typeof queueData.queue>();
    
    // First, map everyone by their series ID, falling back to union-find if needed
    // But since we have getCachedSeriesGraph, we can just use it directly!
    for (const item of queueData.queue) {
      const graph = getCachedSeriesGraph(item.anime.id);
      const rootId = graph ? graph.seriesId : item.anime.id;
      
      if (!groups.has(rootId)) {
        groups.set(rootId, []);
      }
      groups.get(rootId)!.push(item);
    }
    
    // Fallback: For any items that share relations but didn't have a cached series graph,
    // let's union-find on the roots to be absolutely sure.
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
            const graphI = getCachedSeriesGraph(item.anime.id);
            const graphJ = getCachedSeriesGraph(edge.node.id);
            
            const rootI = graphI ? graphI.seriesId : item.anime.id;
            const rootJ = graphJ ? graphJ.seriesId : edge.node.id;
            
            if (parent.has(rootI) && parent.has(rootJ)) {
              union(rootI, rootJ);
            }
          }
        }
      }
    }
    
    const finalGroups = new Map<number, typeof queueData.queue>();
    for (const [root, groupItems] of groups.entries()) {
      const finalRoot = find(root);
      if (!finalGroups.has(finalRoot)) finalGroups.set(finalRoot, []);
      finalGroups.get(finalRoot)!.push(...groupItems);
    }

    // Sort items within each group by start date
    for (const group of finalGroups.values()) {
      group.sort((a, b) => {
        const dateA = (a.anime.startDate.year || 0) * 10000 + (a.anime.startDate.month || 0) * 100 + (a.anime.startDate.day || 0);
        const dateB = (b.anime.startDate.year || 0) * 10000 + (b.anime.startDate.month || 0) * 100 + (b.anime.startDate.day || 0);
        return dateA - dateB;
      });
    }
    
    // Sort groups themselves by their first item's order in the original queue
    const originalOrder = new Map(queueData.queue.map((item, i) => [item.anime.id, i]));
    return Array.from(finalGroups.values()).map(group => {
      return group.sort((a, b) => {
        const dateA = (a.anime.startDate.year || 9999) * 10000 + (a.anime.startDate.month || 1) * 100 + (a.anime.startDate.day || 1);
        const dateB = (b.anime.startDate.year || 9999) * 10000 + (b.anime.startDate.month || 1) * 100 + (b.anime.startDate.day || 1);
        return dateA - dateB;
      });
    }).sort((groupA, groupB) => {
      const minIndexA = Math.min(...groupA.map(item => originalOrder.get(item.anime.id) ?? 99999));
      const minIndexB = Math.min(...groupB.map(item => originalOrder.get(item.anime.id) ?? 99999));
      return minIndexA - minIndexB;
    });
  }, [queueData.queue, groupSeasons]);

  if (queueData.queue.length === 0) return null;


  const renderSeriesGroup = (group: typeof queueData.queue) => {
    const firstItem = group[0];
    const seriesTitle = firstItem.anime.title.english || firstItem.anime.title.userPreferred;
    
    const totalWatched = group.reduce((acc, item) => acc + item.watched.length, 0);
    const totalAired = group.reduce((acc, item) => acc + item.airedCount, 0);
    const totalProgress = totalAired > 0 ? (totalWatched / totalAired) * 100 : 0;
    
    let currentSeasonIndex = -1;
    let nextEpisodeToWatch = -1;
    let currentItem: typeof queueData.queue[0] | null = null;
    
    for (let i = 0; i < group.length; i++) {
      const item = group[i];
      const unwatched = Array.from({ length: item.airedCount }, (_, idx) => idx + 1).find(ep => !item.watched.includes(ep));
      if (unwatched) {
        currentSeasonIndex = i;
        nextEpisodeToWatch = unwatched;
        currentItem = item;
        break;
      }
    }
    
    if (currentSeasonIndex === -1 && group.length > 0) {
       currentSeasonIndex = 0;
       currentItem = group[0];
    }
    
    const watchLink = currentItem?.anime.externalLinks?.find((l: any) => 
      ['Crunchyroll', 'Netflix', 'Hulu', 'Amazon Prime Video', 'HIDIVE', 'Disney Plus', 'Bilibili TV', 'CustomSource'].includes(l.site)
    )?.url || currentItem?.anime.externalLinks?.[0]?.url;

    return (
      <motion.div
        layout
        key={`group-${firstItem.anime.id}-${nextEpisodeToWatch}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="flex flex-col rounded-[16px] border border-[#2e1d52] bg-[#0c0a15] shadow-xl relative overflow-hidden group/series h-full min-h-0 sm:col-span-2"
      >
        <div className="flex flex-col h-full">
          <div className="flex p-5 pb-0 gap-5">
            {/* Left Image */}
            <div className="w-[100px] sm:w-[110px] shrink-0 relative cursor-pointer h-[150px] sm:h-[160px]" onClick={() => onAnimeSelect(firstItem.anime)}>
              <img src={firstItem.anime.coverImage.extraLarge || firstItem.anime.coverImage.large} className="w-full h-full object-cover rounded-[12px] shadow-md" />
            </div>
            
            {/* Right Content */}
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex justify-between items-start gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-gray-100 text-[16px] leading-snug truncate cursor-pointer hover:text-[#b0a4ff] transition-colors" onClick={() => onAnimeSelect(firstItem.anime)}>
                      {seriesTitle}
                    </h3>
                    <span className="shrink-0 px-2 py-0.5 rounded border border-[#b0a4ff]/30 bg-[#b0a4ff]/10 text-[#b0a4ff] font-bold text-[10px] uppercase tracking-wider">
                      {group.length} seasons
                    </span>
                  </div>
                  
                  {currentItem && nextEpisodeToWatch !== -1 && (
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.div 
                        key={nextEpisodeToWatch}
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-1.5"
                      >
                      <Play className="w-[10px] h-[10px] fill-[#d434ff] text-[#b0a4ff]" />
                      <span className="font-medium text-[#b0a4ff] text-[13px] whitespace-nowrap">Continue in order</span>
                      <span className="text-gray-400 text-[13px] font-medium ml-1 truncate">• Next up: S{currentSeasonIndex + 1} - Ep {nextEpisodeToWatch}</span>
                      </motion.div>
                    </AnimatePresence>
                  )}
                </div>
                
                {/* Progress Ring */}
                <div className="shrink-0 relative w-[52px] h-[52px] flex items-center justify-center ml-2 border-[2px] border-[#2e1d52] rounded-full bg-[#05040a] shadow-lg">
                  <svg className="w-[44px] h-[44px] -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-[#1e1a2f]"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                    />
                    <path
                      className="text-[#b0a4ff] transition-all duration-1000 ease-out"
                      strokeDasharray={`${totalProgress}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-white font-bold text-[13px] leading-none">{Math.round(totalProgress)}%</span>
                  </div>
                </div>
              </div>
              
              {/* Seasons List */}
              <div className="flex flex-col gap-2.5 relative min-h-0 overflow-y-auto custom-scrollbar pr-1">
                {group.map((season, idx) => {
                   const isCurrent = idx === currentSeasonIndex;
                   return (
                     <div key={season.anime.id} className={cn("flex items-center gap-3 cursor-pointer transition-colors p-2.5 rounded-[10px] group/season border", isCurrent ? "bg-[#110d1c] border-[#36225e]" : "bg-[#090710] border-[#1a132e] hover:border-[#2e1d52]")} onClick={() => onAnimeSelect(season.anime)}>
                       <div className="shrink-0 w-6 flex items-center justify-center">
                         {isCurrent ? (
                           <div className="w-[22px] h-[22px] rounded-full bg-[#b0a4ff] flex items-center justify-center shadow-[0_0_10px_rgba(176,164,255,0.4)]">
                             <Play className="w-[12px] h-[12px] fill-[#0c0a15] text-[#0c0a15] ml-0.5" />
                           </div>
                         ) : (
                           <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center">
                             <ChevronRight className="w-[16px] h-[16px] text-[#b0a4ff]" />
                           </div>
                         )}
                       </div>
                       
                       <div className="flex-1 flex items-center gap-4 min-w-0">
                          <span className={cn("font-bold text-[13px] w-[65px] shrink-0 transition-colors", isCurrent ? "text-gray-100" : "text-gray-300 group-hover/season:text-gray-200")}>Season {idx + 1}</span>
                          <div className="flex-1 flex gap-1 h-[5px]">
                             {Array.from({ length: Math.min(season.airedCount, 30) }).map((_, epIdx) => {
                                const isWatched = season.watched.includes(epIdx + 1);
                                return (
                                  <div key={epIdx} className={cn("h-full flex-1 rounded-full", isWatched ? "bg-[#b0a4ff]" : "bg-[#2e1d52]")} />
                                )
                             })}
                             {season.airedCount > 30 && <div className="h-full w-2 rounded-full bg-[#b0a4ff]/30" />}
                          </div>
                          <span className="text-[12px] font-bold text-gray-400 shrink-0 text-right">{season.watched.length} / {season.airedCount}</span>
                       </div>
                       
                       <div className="shrink-0 text-right min-w-[50px] flex justify-end">
                         {isCurrent ? (
                           <span className="text-[11px] px-2.5 py-0.5 rounded border border-[#b0a4ff]/40 bg-[#b0a4ff]/10 font-bold text-[#b0a4ff]">Current</span>
                         ) : idx > currentSeasonIndex ? (
                           <span className="text-[12px] font-medium text-gray-500">Up Next</span>
                         ) : (
                           <span className="text-[12px] font-medium text-green-400/80">Done</span>
                         )}
                       </div>
                     </div>
                   );
                })}
              </div>
            </div>
          </div>
          
          {/* Bottom Actions Row */}
          <div className="mt-auto px-5 pb-5">
             {currentItem && nextEpisodeToWatch !== -1 && (
                <div className="flex flex-col mt-4 pt-1">
                  <div className="flex items-center justify-center gap-1.5 text-[#b0a4ff] text-[14px] font-bold mb-3">
                    <Zap className="w-4 h-4 fill-current" />
                    Rate S{currentSeasonIndex + 1} Ep {nextEpisodeToWatch}
                  </div>
                  
                  <div className="grid grid-cols-11 sm:flex sm:justify-center gap-1.5 sm:gap-2 mb-4">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(score => (
                      <button
                        key={score}
                        onClick={(e) => { e.stopPropagation(); onLog(currentItem!.anime.id, nextEpisodeToWatch, score); }}
                        className="flex h-[38px] sm:h-[42px] items-center justify-center rounded-[8px] sm:rounded-[10px] border border-[#2e1d52] bg-[#05040a] text-[13px] sm:text-[15px] font-bold text-gray-400 transition-all hover:border-[#b0a4ff] hover:bg-gradient-to-b hover:from-[#8b31ff] hover:to-[#5c1cba] hover:text-white sm:flex-1 max-w-[48px]"
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                  
                  <div className="flex items-center gap-2 h-[42px]">
                    <button
                      onClick={(e) => { e.stopPropagation(); onLog(currentItem!.anime.id, nextEpisodeToWatch, null); }}
                      className="shrink-0 h-full px-3 flex items-center justify-center gap-2 rounded-[10px] border border-[#2e1d52] bg-[#05040a] text-[12px] font-bold text-gray-400 hover:bg-[#120e24] transition-colors"
                      title="Mark watched only"
                    >
                      Watched only <Info className="w-4 h-4" />
                    </button>
                    
                    <a 
                      href={watchLink}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        "flex-1 h-full flex items-center justify-center gap-2 rounded-[10px] text-[14px] font-bold text-white transition-all shadow-lg",
                        watchLink ? "bg-gradient-to-r from-[#8b31ff] to-[#5c1cba] hover:brightness-110" : "bg-[#543bfa]/50 cursor-not-allowed"
                      )}
                      onClick={(e) => { if (!watchLink) e.preventDefault(); e.stopPropagation(); }}
                    >
                      <Play className="w-4 h-4 fill-current" />
                      Continue S{currentSeasonIndex + 1} Ep {nextEpisodeToWatch}
                    </a>
                  </div>
                </div>
             )}
          </div>
        </div>
      </motion.div>
    );
  };
  const renderQueueItem = (item: typeof queueData.queue[0], seasonIndex?: number) => {
    const progress = item.airedCount > 0 ? (item.watched.length / item.airedCount) * 100 : 0;
    
    const nextUnwatched = Array.from({ length: item.airedCount }, (_, i) => i + 1).find(ep => !item.watched.includes(ep));

    const Inner = (
      <>
        <div className="flex gap-4 p-4 cursor-pointer relative z-10 transition-colors group/card h-[132px]"
          onClick={() => onAnimeSelect(item.anime)}
        >
          <div className="relative shrink-0 w-[64px] h-[92px]">
            <img
              src={item.anime.coverImage.extraLarge || item.anime.coverImage.large}
              alt=""
              className="h-full w-full rounded-[10px] object-cover shadow-md"
            />
            <div className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-[#ef4444] text-white text-[10px] font-bold flex items-center justify-center z-10 shadow-sm border border-[#0c0a15]">
              {item.behindCount}
            </div>
            {seasonIndex !== undefined && (
              <div className="absolute -top-2 -left-2 min-w-[20px] h-5 px-1 rounded-md bg-[#0c102b] border border-[#b0a4ff]/80 text-[#b0a4ff] text-[10px] font-bold flex items-center justify-center z-10 shadow-sm shadow-purple-900/20 backdrop-blur-sm">
                S{seasonIndex + 1}
              </div>
            )}
          </div>
          
          <div className="flex flex-1 flex-col min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-gray-100 text-[14px] leading-snug line-clamp-2 group-hover/card:text-[#b0a4ff] transition-colors pr-2">
                  {item.anime.title.english || item.anime.title.userPreferred}
                </h3>
                
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-400 font-medium">
                  <span>{item.watched.length} / {item.airedCount} logged</span>
                  <span className="px-1.5 py-0.5 rounded border border-[#543bfa]/50 bg-[#543bfa]/20 text-[#b0a4ff] font-bold text-[9px] uppercase tracking-wider">
                    New
                  </span>
                  {item.anime.nextAiringEpisode && (
                    <span className="flex items-center gap-1 text-amber-500 ml-auto sm:ml-0 font-semibold truncate">
                      <Clock className="h-3 w-3 shrink-0" />
                      Next in {Math.ceil(item.anime.nextAiringEpisode.timeUntilAiring / 3600)}h
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Ring */}
              <div className="shrink-0 relative w-[42px] h-[42px] flex items-center justify-center border-[1.5px] border-[#2e1d52] rounded-full bg-[#05040a]">
                <svg className="w-[34px] h-[34px] -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-[#1e1a2f]"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                  />
                  <path
                    className="text-[#b0a4ff] transition-all duration-1000 ease-out"
                    strokeDasharray={`${progress}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-white font-bold text-[10px] leading-none">{Math.round(progress)}%</span>
                </div>
              </div>
            </div>
            
            {/* Progress Bar under text */}
            <div className="mt-auto flex flex-col gap-1.5 pb-2">
              <div className="flex gap-[2px] h-[4px] w-full">
                 {Array.from({ length: Math.min(item.airedCount, 40) }).map((_, idx) => (
                   <div key={idx} className={cn("h-full flex-1 rounded-full", item.watched.includes(idx + 1) ? "bg-[#b0a4ff]" : "bg-[#251b3a]")} />
                 ))}
                 {item.airedCount > 40 && <div className="h-full w-2 rounded-full bg-[#b0a4ff]/30" />}
              </div>
              <div className="flex justify-between items-center text-[10px] font-medium pt-0.5">
                <span className="text-gray-400">{Math.round(progress)}% overall progress</span>
                <span className="text-gray-400">{item.behindCount} left</span>
              </div>
            </div>
          </div>
        </div>
        
        {(() => {
          if (!nextUnwatched) return null;
          
          const watchLink = item.anime.externalLinks?.find((l: any) => 
            ['Crunchyroll', 'Netflix', 'Hulu', 'Amazon Prime Video', 'HIDIVE', 'Disney Plus', 'Bilibili TV', 'CustomSource'].includes(l.site)
          )?.url || item.anime.externalLinks?.[0]?.url;
          
          return (
            <div className="flex flex-col px-4 pb-4">
              <div className="flex items-center justify-center gap-1.5 text-[#b0a4ff] text-[13px] font-bold mb-3 mt-1">
                <Zap className="w-4 h-4 fill-current" />
                Rate Episode {nextUnwatched}
              </div>
              <div className="grid grid-cols-6 gap-2 mb-4">
                {[5, 6, 7, 8, 9, 10].map(score => (
                  <button
                    key={score}
                    onClick={(e) => { e.stopPropagation(); onLog(item.anime.id, nextUnwatched, score); }}
                    className="flex h-[38px] items-center justify-center rounded-[10px] border border-[#2e1d52] bg-[#05040a] text-[14px] font-bold text-gray-400 transition-all hover:border-[#b0a4ff] hover:bg-gradient-to-b hover:from-[#8b31ff] hover:to-[#5c1cba] hover:text-white"
                  >
                    {score}
                  </button>
                ))}
              </div>
              
              <div className="flex items-center gap-2 h-[38px]">
                <button
                  onClick={(e) => { e.stopPropagation(); onLog(item.anime.id, nextUnwatched, null); }}
                  className="shrink-0 h-full px-2.5 flex items-center justify-center gap-2 rounded-[10px] border border-[#2e1d52] bg-[#05040a] text-[11px] font-bold text-gray-400 hover:bg-[#120e24] transition-colors"
                  title="Mark watched only"
                >
                  Watched only <Info className="w-3.5 h-3.5" />
                </button>
                
                <a 
                  href={watchLink}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "flex-1 h-full flex items-center justify-center gap-2 rounded-[10px] text-[13px] font-bold text-white transition-all shadow-lg",
                    watchLink ? "bg-gradient-to-b from-[#8b31ff] to-[#5c1cba] hover:brightness-110" : "bg-[#543bfa]/50 cursor-not-allowed"
                  )}
                  onClick={(e) => { if (!watchLink) e.preventDefault(); e.stopPropagation(); }}
                >
                  <Play className="w-4 h-4 fill-current" />
                  Continue Ep {nextUnwatched}
                </a>
              </div>
            </div>
          );
        })()}
      </>
    );

    return (
      <motion.div
        layout
        key={`${item.anime.id}-${nextUnwatched}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="flex flex-col overflow-hidden rounded-[16px] bg-[#0c0a15] border border-[#2e1d52] shadow-xl group h-full"
      >
        {Inner}
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
              return group.map(item => renderQueueItem(item));
            }
            return renderSeriesGroup(group);
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
