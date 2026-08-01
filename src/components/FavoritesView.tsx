import { AnimeMedia, EpisodeLog, LibraryEntry, LibraryStatus } from '../types';
import { AnimeCard, StatusPillType } from './AnimeCard';
import { BookmarkIcon, Trophy, Calendar, Star, TrendingUp, PlaySquare, Library, Archive, XCircle, Clock } from 'lucide-react';
import { CatchUpQueue } from './CatchUpQueue';
import React, { useMemo, useState, useEffect } from 'react';
import { fetchAnimeByIds } from '../api/anilist';
import { SeasonRecapModal } from './SeasonRecapModal';
import { cn } from '../lib/utils';

interface FavoritesViewProps {
  animeList: AnimeMedia[];
  library: LibraryEntry[];
  favorites: number[];
  onToggleFavorite: (id: number) => void;
  onAnimeSelect: (anime: AnimeMedia) => void;
  logs: EpisodeLog[];
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onUnlog: (showId: number, episodeNumber: number) => void;
  onUpdateEntry: (showId: number, update: Partial<LibraryEntry>) => void;
}

type FilterTab = 'all' | 'behind' | 'caught-up' | 'finished';
type SortOption = 'next-airing' | 'most-behind' | 'highest-score' | 'a-z';
type ListTab = 'watching' | 'on_hold' | 'dropped' | 'plan_to_watch';

export function FavoritesView({ animeList, library, favorites, onToggleFavorite, onAnimeSelect, logs, onLog, onUnlog, onUpdateEntry }: FavoritesViewProps) {
  const [activeList, setActiveList] = useState<ListTab>('watching');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [sort, setSort] = useState<SortOption>('next-airing');
  const [showRecap, setShowRecap] = useState(false);


  const [loadedFavorites, setLoadedFavorites] = useState<Record<number, AnimeMedia>>(() => {
    try {
      const cached = localStorage.getItem('senpai_favorites_cache');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return {};
  });
  const [loadingMissing, setLoadingMissing] = useState(false);

  const currentListIds = useMemo(() => library.filter(l => l.status === activeList).map(l => l.showId), [library, activeList]);

  useEffect(() => {
    const missingIds = currentListIds.filter(id => !animeList.find(a => a.id === id) && !loadedFavorites[id]);
    if (missingIds.length > 0 && !loadingMissing) {
      setLoadingMissing(true);
      fetchAnimeByIds(missingIds).then(newAnime => {
        setLoadedFavorites(prev => {
          const next = { ...prev };
          newAnime.forEach(a => next[a.id] = a);
          localStorage.setItem('senpai_favorites_cache', JSON.stringify(next));
          return next;
        });
        setLoadingMissing(false);
      }).catch(() => {
        setLoadingMissing(false);
      });
    }
  }, [currentListIds, animeList, loadedFavorites, loadingMissing]);

  const fullAnimeList = useMemo(() => {
    const map = new Map<number, AnimeMedia>();
    animeList.forEach(a => map.set(a.id, a));
    Object.values(loadedFavorites).forEach((a: any) => map.set(a.id, a as AnimeMedia));
    return Array.from(map.values());
  }, [animeList, loadedFavorites]);

  const currentShows = useMemo(() => fullAnimeList.filter(a => currentListIds.includes(a.id)), [fullAnimeList, currentListIds]);


  const stats = useMemo(() => {
    const watchedLogs = logs.filter(l => favorites.includes(l.showId));
    const totalWatched = watchedLogs.length;
    
    const scoredLogs = watchedLogs.filter(l => l.score != null);
    const averageScore = scoredLogs.length > 0 ? (scoredLogs.reduce((s, l) => s + l.score!, 0) / scoredLogs.length).toFixed(1) : '-';

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayCounts = new Array(7).fill(0);
    watchedLogs.forEach(l => {
      dayCounts[new Date(l.watchedAt).getDay()]++;
    });
    const mostWatchedDayIndex = dayCounts.indexOf(Math.max(...dayCounts));
    const mostWatchedDay = totalWatched > 0 ? days[mostWatchedDayIndex] : '-';

    const showScores: Record<number, { sum: number, count: number }> = {};
    scoredLogs.forEach(l => {
      if (!showScores[l.showId]) showScores[l.showId] = { sum: 0, count: 0 };
      showScores[l.showId].sum += l.score!;
      showScores[l.showId].count++;
    });
    let maxScore = -1;
    let mvpId: number | null = null;
    Object.entries(showScores).forEach(([idStr, { sum, count }]) => {
      const avg = sum / count;
      if (avg > maxScore) {
        maxScore = avg;
        mvpId = Number(idStr);
      }
    });
    const mvpTitle = mvpId ? animeList.find(a => a.id === mvpId)?.title.english || animeList.find(a => a.id === mvpId)?.title.userPreferred : '-';

    return { totalWatched, averageScore, mostWatchedDay, mvpTitle };
  }, [logs, favorites, animeList]);

  const getAiredEpisodesCount = (anime: AnimeMedia) => {
    if (anime.nextAiringEpisode) {
      return Math.max(0, anime.nextAiringEpisode.episode - 1);
    } else if (anime.status === 'FINISHED' || anime.status === 'RELEASING') {
      return anime.episodes || 0;
    }
    return 0;
  };

  const processedShows = useMemo(() => {
    return currentShows.map(anime => {
      const airedCount = getAiredEpisodesCount(anime);
      const watchedLogs = logs.filter(l => l.showId === anime.id);
      const watchedCount = watchedLogs.length;
      const behindCount = Math.max(0, airedCount - watchedCount);
      
      const scoredLogs = watchedLogs.filter(l => l.score != null);
      const userScore = scoredLogs.length > 0 ? scoredLogs.reduce((s, l) => s + l.score!, 0) / scoredLogs.length : null;

      let statusPill: StatusPillType = 'not-started';
      if (anime.status === 'FINISHED' && behindCount === 0 && airedCount > 0) {
        statusPill = 'finished';
      } else if (behindCount > 0) {
        statusPill = 'behind';
      } else if (anime.nextAiringEpisode && anime.nextAiringEpisode.timeUntilAiring > 0 && anime.nextAiringEpisode.timeUntilAiring < 24 * 3600) {
        statusPill = 'airing-soon';
      } else if (behindCount === 0 && airedCount > 0) {
        statusPill = 'caught-up';
      }
      
      return {
        anime,
        progress: { watched: watchedCount, aired: airedCount },
        behindCount,
        userScore,
        statusPill,
        nextAiringTime: anime.nextAiringEpisode?.timeUntilAiring ?? Infinity,
        title: anime.title.english || anime.title.userPreferred
      };
    });
  }, [currentShows, logs]);

  const filteredAndSortedShows = useMemo(() => {
    let result = processedShows;
    
    if (filter === 'behind') result = result.filter(s => s.statusPill === 'behind');
    else if (filter === 'caught-up') result = result.filter(s => s.statusPill === 'caught-up');
    else if (filter === 'finished') result = result.filter(s => s.statusPill === 'finished');

    result.sort((a, b) => {
      if (sort === 'next-airing') return a.nextAiringTime - b.nextAiringTime;
      if (sort === 'most-behind') return b.behindCount - a.behindCount;
      if (sort === 'highest-score') return (b.userScore || 0) - (a.userScore || 0);
      if (sort === 'a-z') return a.title.localeCompare(b.title);
      return 0;
    });

    return result;
  }, [processedShows, filter, sort]);

  return (
    <div className="space-y-8 pb-12">
      <SeasonRecapModal 
        isOpen={showRecap} 
        onClose={() => setShowRecap(false)} 
        logs={logs} 
        animeList={fullAnimeList} 
        favorites={favorites} 
      />

      <CatchUpQueue 
        animeList={fullAnimeList} 
        favorites={favorites} 
        logs={logs} 
        onLog={onLog} 
        onUnlog={onUnlog} 
        onAnimeSelect={onAnimeSelect}
      />

      {/* Season Summary Strip */}
      {logs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex flex-col rounded-xl bg-[#2a2a2d] p-4 border border-gray-800">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              <PlaySquare className="h-3.5 w-3.5" /> Watched
            </span>
            <span className="text-xl font-bold text-white">{stats.totalWatched} <span className="text-sm font-normal text-gray-400">eps</span></span>
          </div>
          <div className="flex flex-col rounded-xl bg-[#2a2a2d] p-4 border border-gray-800">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              <Star className="h-3.5 w-3.5" /> Avg Score
            </span>
            <span className="text-xl font-bold text-white">{stats.averageScore}</span>
          </div>
          <div className="flex flex-col rounded-xl bg-[#2a2a2d] p-4 border border-gray-800">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              <Calendar className="h-3.5 w-3.5" /> Peak Day
            </span>
            <span className="text-xl font-bold text-white">{stats.mostWatchedDay}</span>
          </div>
          <div className="flex flex-col rounded-xl bg-indigo-900/20 p-4 border border-indigo-500/30">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1">
              <Trophy className="h-3.5 w-3.5" /> Season MVP
            </span>
            <span className="text-base font-bold text-indigo-100 line-clamp-1">{stats.mvpTitle}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">My Watchlist</h2>
            <p className="text-gray-400">Track and manage your seasonal progress</p>
          </div>
          {logs.length > 0 && (
            <button
              onClick={() => setShowRecap(true)}
              className="flex items-center justify-center space-x-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              <TrendingUp className="h-4 w-4" />
              <span>Season Recap</span>
            </button>
          )}
        </div>

        <div className="flex space-x-1 overflow-x-auto pb-2 hide-scrollbar">
          {[
            { id: 'watching', label: 'Watching', icon: BookmarkIcon },
            { id: 'plan_to_watch', label: 'Plan to Watch', icon: Clock },
            { id: 'on_hold', label: 'Shelved', icon: Archive },
            { id: 'dropped', label: 'Dropped', icon: XCircle },
          ].map(t => {
            const count = library.filter(l => l.status === t.id).length;
            return (
              <button
                key={t.id}
                onClick={() => setActiveList(t.id as ListTab)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors border",
                  activeList === t.id 
                    ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400" 
                    : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#2a2a2d]"
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
                <span className="ml-1 rounded-full bg-black/30 px-2 py-0.5 text-xs font-semibold">{count}</span>
              </button>
            );
          })}
        </div>

        {currentShows.length > 0 && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#1c1c1f] p-2 rounded-xl border border-gray-800">
            {/* Filter Tabs */}
            <div className="flex space-x-1 overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
              {[
                { id: 'all', label: 'All' },
                { id: 'behind', label: 'Behind' },
                { id: 'caught-up', label: 'Caught up' },
                { id: 'finished', label: 'Finished' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setFilter(t.id as FilterTab)}
                  className={cn(
                    "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                    filter === t.id ? "bg-[#2a2a2d] text-white shadow-sm" : "text-gray-400 hover:text-gray-200 hover:bg-[#2a2a2d]/50"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Sort Select */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="rounded-lg border border-gray-700 bg-[#2a2a2d] px-3 py-2 text-sm font-medium text-gray-300 focus:border-indigo-500 focus:outline-none"
            >
              <option value="next-airing">Next episode airing</option>
              <option value="most-behind">Most behind</option>
              <option value="highest-score">Highest score</option>
              <option value="a-z">A-Z</option>
            </select>
          </div>
        )}
      </div>

      {currentShows.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 sm:gap-6">
          {filteredAndSortedShows.map(item => (
            <AnimeCard
              key={item.anime.id}
              anime={item.anime}
              isFavorite={favorites.includes(item.anime.id)}
              onToggleFavorite={onToggleFavorite}
              onClick={onAnimeSelect}
              progress={item.progress}
              statusPill={item.statusPill}
              behindCount={item.behindCount}
              userScore={item.userScore}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-800 py-32 text-center">
          {activeList === 'watching' ? <BookmarkIcon className="mb-4 h-12 w-12 text-gray-700" /> : <Archive className="mb-4 h-12 w-12 text-gray-700" />}
          <h3 className="text-xl font-bold text-white">No shows here</h3>
          <p className="mt-2 text-gray-500">
            {activeList === 'watching' ? "Go to the Schedule or Season view and click the bookmark icon to add shows to your watchlist." : "Shows you mark will appear here."}
          </p>
        </div>
      )}
    </div>
  );
}
