import { AnimeMedia, EpisodeLog } from '../../types';
import { AnimeCard } from '../../components/AnimeCard';
import { SeriesTitle } from '../../components/SeriesTitle';
import { UpNextDeck } from '../../components/UpNextDeck';
import { WelcomeHero } from '../../components/WelcomeHero';
import { Search, SearchX, Film, Loader2 } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { displayTitle } from '../../lib/displayTitle';
import { latestAiredEpisode } from '../../lib/aired';
import { CheckInFeed, computeDrops, wouldBeDrop } from './CheckInFeed';
import { STREAMING_SITES } from '../../lib/watchLinks';
import { useUpNext } from '../../hooks/useUpNext';
import { useUserData } from '../../stores/userData';

interface DailyScheduleProps {
  animeList: AnimeMedia[];
  favorites: number[];
  /** Stacking-status show ids — drop material only on their finale's day. */
  stacking?: number[];
  onAnimeSelect: (anime: AnimeMedia) => void;
  logs: EpisodeLog[];
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  /** More schedule pages are still streaming in behind the first paint. */
  isStreaming?: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Stable empty default — an inline `= []` would re-trigger every downstream
// memo (including CheckInFeed's clock-reading drops memo) on each render.
const NO_STACKING: number[] = [];

export function DailySchedule({ animeList, favorites, stacking = NO_STACKING, onAnimeSelect, logs, onLog, isStreaming = false }: DailyScheduleProps) {
  const [search, setSearch] = useState('');

  // The handoff: once the drops feed is quiet, the page deals the Up Next deck
  // instead of just stopping. computeDrops is idempotent, so calling it here
  // alongside CheckInFeed's own memo is safe.
  const { candidates: upNextCandidates, skip: skipUpNext } = useUpNext(animeList);
  // The drops source: the schedule list plus the deck's resolved media. The
  // deck resolves stacking shows the season list doesn't carry (a two-cour
  // show tagged to a past season, most importantly) — without the merge, that
  // show's finale could never graduate into the drops row.
  const dropSource = useMemo(() => {
    const merged = new Map(animeList.map((a) => [a.id, a]));
    for (const c of upNextCandidates) if (!merged.has(c.anime.id)) merged.set(c.anime.id, c.anime);
    return Array.from(merged.values());
  }, [animeList, upNextCandidates]);
  const activeDropCount = useMemo(
    () => computeDrops(dropSource, favorites, logs, stacking).length,
    [dropSource, favorites, logs, stacking],
  );
  // The standalone deck applies the same fresh-clock guard as the merged row:
  // a candidate whose episode just aired belongs to the drops feed, and the
  // memos above may not have re-run since the airing. Un-memoized on purpose.
  const deckNowSec = Math.floor(Date.now() / 1000);
  const deckCandidates = upNextCandidates.filter(
    (c) => !wouldBeDrop(c.anime, favorites, logs, deckNowSec, stacking),
  );
  // "You're done for today" only means something if there was a today: at least
  // one tracked episode aired in the last 24h and its log exists.
  const clearedDropsToday = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return dropSource.some((anime) => {
      if (!favorites.includes(anime.id) && !stacking.includes(anime.id)) return false;
      const latest = latestAiredEpisode(anime, now);
      if (latest === null || now - latest.airedAt > 24 * 3600) return false;
      return logs.some((l) => l.showId === anime.id && l.episodeNumber === latest.episode);
    });
  }, [dropSource, favorites, stacking, logs]);

  // Same undo-toast contract as CheckInFeed's handleLog — the deck never toasts.
  const handleDeckLog = useCallback(
    (showId: number, episodeNumber: number, score: number | null) => {
      onLog(showId, episodeNumber, score);
      toast(`Logged episode ${episodeNumber}`, {
        action: { label: 'Undo', onClick: () => useUserData.getState().unlogEpisode(showId, episodeNumber) },
      });
    },
    [onLog],
  );

  // Persisted state (userData store uiPrefs)
  const includeMovies = useUserData(s => s.uiPrefs.includeMovies);
  const selectedSources = useUserData(s => s.uiPrefs.selectedSources);
  const setUiPrefs = useUserData(s => s.setUiPrefs);

  const availableSources = useMemo(() => {
    const sources = new Set<string>();
    animeList.forEach(anime => {
      anime.externalLinks?.forEach(link => {
        if (STREAMING_SITES.includes(link.site)) {
          sources.add(link.site);
        }
      });
    });
    return Array.from(sources).sort();
  }, [animeList]);

  const schedule = useMemo(() => {
    // Only include currently airing shows with known next episode
    let filtered = animeList.filter(a => a.nextAiringEpisode);
    
    if (!includeMovies) {
      filtered = filtered.filter(a => a.format !== 'MOVIE');
    }
    
    if (selectedSources.length > 0) {
      filtered = filtered.filter(a => 
        a.externalLinks?.some(link => selectedSources.includes(link.site))
      );
    }

    if (search) {
      filtered = filtered.filter(a =>
        a.title.userPreferred?.toLowerCase().includes(search.toLowerCase()) ||
        a.title.english?.toLowerCase().includes(search.toLowerCase())
      );
    }

    const grouped: Record<string, AnimeMedia[]> = {};
    DAYS.forEach(day => grouped[day] = []);

    filtered.forEach(anime => {
      // Convert to local day of week
      const date = new Date(anime.nextAiringEpisode!.airingAt * 1000);
      const dayName = DAYS[date.getDay()];
      grouped[dayName].push(anime);
    });

    // Sort shows within each day by airing time
    DAYS.forEach(day => {
      grouped[day].sort((a, b) => 
        (a.nextAiringEpisode?.airingAt || 0) - (b.nextAiringEpisode?.airingAt || 0)
      );
    });

    return grouped;
  }, [animeList, search, includeMovies, selectedSources]);

  // Order days starting from today
  const todayIndex = new Date().getDay();
  const orderedDays = [
    ...DAYS.slice(todayIndex),
    ...DAYS.slice(0, todayIndex)
  ];

  const visibleCount = DAYS.reduce((n, day) => n + schedule[day].length, 0);
  const hasActiveFilters = search.trim().length > 0 || selectedSources.length > 0;

  const clearFilters = () => {
    setSearch('');
    setUiPrefs({ selectedSources: [], includeMovies: false });
  };

  return (
    <div className="space-y-8 pb-12">
      <WelcomeHero />

      <CheckInFeed
        animeList={dropSource}
        favorites={favorites}
        stacking={stacking}
        logs={logs}
        onLog={onLog}
        onAnimeSelect={onAnimeSelect}
        upNext={{
          candidates: upNextCandidates,
          onLog: handleDeckLog,
          onSkip: skipUpNext,
          onSelect: onAnimeSelect,
        }}
      />

      {activeDropCount === 0 && deckCandidates.length > 0 && (
        <div>
          {clearedDropsToday && (
            <div className="mb-8 flex items-center gap-3.5 text-[13px] font-semibold text-emerald-300">
              <span
                className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-500/35 to-transparent"
                aria-hidden="true"
              />
              You're done for today
              <span
                className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-500/35 to-transparent"
                aria-hidden="true"
              />
            </div>
          )}
          <UpNextDeck
            candidates={deckCandidates}
            onLog={handleDeckLog}
            onSkip={skipUpNext}
            onAnimeSelect={onAnimeSelect}
          />
        </div>
      )}

      <div className="flex flex-col 2xl:flex-row gap-6 items-start 2xl:items-center justify-between mb-8 bg-[#05060b]/50 border border-[#1e2336]/60 p-4 sm:p-5 rounded-2xl shadow-sm backdrop-blur-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Daily Schedule
          </h1>
          <p className="text-gray-400 mt-1 text-sm">Upcoming episodes in your local timezone</p>
          {isStreaming && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface-1 px-2.5 py-1 text-[11px] font-medium text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin text-accent-400" />
              Loading more shows…
            </span>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 sm:gap-4 w-full 2xl:w-auto">
          {/* Quick Filters */}
          <div className="flex items-center bg-[#0a0c16] border border-[#1e2336] rounded-xl p-1 shrink-0 w-full sm:w-auto justify-center sm:justify-start">
            <button
              onClick={() => setUiPrefs({ includeMovies: !includeMovies })}
              className={cn("px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5", includeMovies ? "bg-accent-600 text-white shadow-md" : "text-gray-400 hover:text-gray-200")}
            >
              <Film className="w-3.5 h-3.5" />
              Movies
            </button>
          </div>
          
          {/* Platform Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide max-w-full sm:max-w-[400px] w-full sm:w-auto">
            {availableSources.map(source => {
              const isSelected = selectedSources.includes(source);
              return (
                <button
                  key={source}
                  onClick={() => {
                    setUiPrefs({
                      selectedSources: isSelected
                        ? selectedSources.filter(s => s !== source)
                        : [...selectedSources, source],
                    });
                  }}
                  className={cn(
                    "whitespace-nowrap px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all flex-shrink-0",
                    isSelected 
                      ? "bg-[#2917d2]/20 border-[#543bfa]/50 text-[#8b7ff9] shadow-[0_0_10px_rgba(84,59,250,0.15)]" 
                      : "bg-[#0a0c16] border-[#1e2336] text-gray-500 hover:text-gray-300 hover:border-gray-700 hover:bg-[#0f121d]"
                  )}
                >
                  {source}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative flex-1 w-full sm:min-w-[200px] 2xl:max-w-[260px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input 
              type="text"
              placeholder="Search schedule..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[#1e2336] bg-[#0a0c16] py-2 pl-9 pr-4 text-sm text-white placeholder-gray-500 focus:border-[#543bfa] focus:outline-none focus:ring-1 focus:ring-[#543bfa] transition-all"
            />
          </div>
        </div>
      </div>

      {visibleCount === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-edge bg-surface-0 py-20 text-center">
          <SearchX className="mb-4 h-8 w-8 text-gray-600" />
          <p className="text-gray-300 font-medium">No shows match</p>
          {hasActiveFilters ? (
            <>
              <p className="mt-1 text-sm text-gray-500">Your search and platform filters hid everything airing this week.</p>
              <button
                onClick={clearFilters}
                className="mt-4 rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-500"
              >
                Clear filters
              </button>
            </>
          ) : (
            <p className="mt-1 text-sm text-gray-500">Nothing on the schedule has an announced next episode right now.</p>
          )}
        </div>
      )}

      <div className="space-y-12">
        {orderedDays.map(day => {
          const shows = schedule[day];
          if (shows.length === 0) return null;

          return (
            <div key={day} className="space-y-4">
              <div className="flex items-center space-x-3">
                <h3 className="text-xl font-bold text-white">
                  {day === DAYS[todayIndex] ? 'Today' : day}
                </h3>
                <div className="h-px flex-1 bg-gray-800" />
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 sm:gap-6">
                {shows.map(anime => (
                  <AnimeCard
                    key={anime.id}
                    anime={anime}
                    titleOverride={<SeriesTitle showId={anime.id} fallbackTitle={displayTitle(anime)} />}
                    onClick={onAnimeSelect}
                    showCountdown={false}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
