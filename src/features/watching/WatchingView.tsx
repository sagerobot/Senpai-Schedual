import { AnimeMedia, EpisodeLog, LibraryEntry } from '../../types';
import { AnimeCard, StatusPillType } from '../../components/AnimeCard';
import { BookmarkIcon, TrendingUp, Loader2 } from 'lucide-react';
import { CatchUpQueue } from './CatchUpQueue';
import { useMemo, useState } from 'react';
import { useMediaByIds } from '../../queries/hooks';
import { SeasonRecapModal } from './SeasonRecapModal';
import { cn } from '../../lib/utils';
import { getAiredEpisodesCount } from '../../lib/aired';
import { displayTitle } from '../../lib/displayTitle';

interface WatchingViewProps {
  animeList: AnimeMedia[];
  library: LibraryEntry[];
  logs: EpisodeLog[];
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onAnimeSelect: (show: { id: number }) => void;
}

type FilterTab = 'all' | 'behind' | 'caught-up' | 'finished';
type SortOption = 'next-airing' | 'most-behind' | 'highest-score' | 'a-z';

/**
 * The Watching dashboard: only status === 'watching' lives here — everything
 * else (Planning / Completed / Shelved / Dropped) is the Library's job.
 */
export function WatchingView({ animeList, library, logs, onLog, onAnimeSelect }: WatchingViewProps) {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [sort, setSort] = useState<SortOption>('next-airing');
  const [showRecap, setShowRecap] = useState(false);

  const watchingIds = useMemo(
    () => library.filter((l) => l.status === 'watching').map((l) => l.showId),
    [library],
  );

  // Fill in anything the season fetch didn't deliver. Unresolvable ids settle
  // as `null` in the query cache instead of re-firing forever.
  const scheduleIds = useMemo(() => new Set(animeList.map((a) => a.id)), [animeList]);
  const missingIds = useMemo(
    () => watchingIds.filter((id) => !scheduleIds.has(id)),
    [watchingIds, scheduleIds],
  );
  const { media: resolvedMedia, pendingCount } = useMediaByIds(missingIds);

  const fullAnimeList = useMemo(() => {
    const map = new Map<number, AnimeMedia>();
    animeList.forEach((a) => map.set(a.id, a));
    resolvedMedia.forEach((a) => map.set(a.id, a));
    return Array.from(map.values());
  }, [animeList, resolvedMedia]);

  const currentShows = useMemo(
    () => fullAnimeList.filter((a) => watchingIds.includes(a.id)),
    [fullAnimeList, watchingIds],
  );

  const processedShows = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return currentShows.map(anime => {
      const airedCount = getAiredEpisodesCount(anime, now);
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
        title: displayTitle(anime)
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
        favorites={watchingIds}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Watching</h1>
          <p className="text-gray-400">What's airing for you right now</p>
        </div>
        {logs.length > 0 && (
          <button
            onClick={() => setShowRecap(true)}
            className="flex items-center justify-center space-x-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-500"
          >
            <TrendingUp className="h-4 w-4" />
            <span>Season Recap</span>
          </button>
        )}
      </div>

      <CatchUpQueue
        animeList={fullAnimeList}
        favorites={watchingIds}
        logs={logs}
        onLog={onLog}
        onAnimeSelect={onAnimeSelect}
      />

      {currentShows.length > 0 && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#1c1c1f] p-2 rounded-xl border border-gray-800">
          {/* Filter Tabs */}
          <div className="flex space-x-1 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
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
            className="rounded-lg border border-gray-700 bg-[#2a2a2d] px-3 py-2 text-sm font-medium text-gray-300 focus:border-accent-500 focus:outline-none"
          >
            <option value="next-airing">Next episode airing</option>
            <option value="most-behind">Most behind</option>
            <option value="highest-score">Highest score</option>
            <option value="a-z">A-Z</option>
          </select>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Loading {pendingCount} more {pendingCount === 1 ? 'show' : 'shows'}…</span>
        </div>
      )}

      {currentShows.length > 0 ? (
        filteredAndSortedShows.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 sm:gap-6">
            {filteredAndSortedShows.map(item => (
              <AnimeCard
                key={item.anime.id}
                anime={item.anime}
                onClick={onAnimeSelect}
                progress={item.progress}
                statusPill={item.statusPill}
                behindCount={item.behindCount}
                userScore={item.userScore}
              />
            ))}
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-gray-500">No shows match this filter.</p>
        )
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-800 py-32 text-center px-6">
          <BookmarkIcon className="mb-4 h-12 w-12 text-gray-700" />
          <h3 className="text-xl font-bold text-white">Nothing here yet</h3>
          <p className="mt-2 max-w-md text-gray-500">
            Bookmark a show on the Schedule or Season view and it appears here the day it airs.
          </p>
        </div>
      )}
    </div>
  );
}
