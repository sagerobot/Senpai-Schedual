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
import { Button } from '../../components/ui/Button';

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
  const dropSkips = useUserData((s) => s.dropSkips);
  const activeDropCount = useMemo(
    () => computeDrops(dropSource, favorites, logs, stacking, dropSkips).length,
    [dropSource, favorites, logs, stacking, dropSkips],
  );
  // The standalone deck applies the same fresh-clock guard as the merged row:
  // a candidate whose episode just aired belongs to the drops feed, and the
  // memos above may not have re-run since the airing. Un-memoized on purpose.
  const deckNowSec = Math.floor(Date.now() / 1000);
  const deckCandidates = upNextCandidates.filter(
    (c) => !wouldBeDrop(c.anime, favorites, logs, deckNowSec, stacking, dropSkips),
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
      {/* The visible page leads with the lean-back deck by design; the document
          outline still leads with the view's one h1 (docs §11). */}
      <h1 className="sr-only">Daily Schedule</h1>
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
            <div className="mb-8 flex items-center gap-3.5 text-label font-semibold text-success-300">
              <span
                className="h-px flex-1 bg-gradient-to-r from-transparent via-success-500/35 to-transparent"
                aria-hidden="true"
              />
              You're done for today
              <span
                className="h-px flex-1 bg-gradient-to-r from-transparent via-success-500/35 to-transparent"
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

      <div className="flex flex-col 2xl:flex-row gap-6 items-start 2xl:items-center justify-between mb-8 bg-hero-drops-deep/50 border border-hero-drops-edge/60 p-4 sm:p-5 rounded-card shadow-e1 backdrop-blur-sm">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-fg flex items-center gap-2">
            Daily Schedule
          </h2>
          <p className="text-fg-muted mt-1 text-sm">Upcoming episodes in your local timezone</p>
          {isStreaming && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface-1 px-2.5 py-1 text-caption font-medium text-fg-muted">
              <Loader2 className="h-3 w-3 animate-spin text-accent-400" />
              Loading more shows…
            </span>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 sm:gap-4 w-full 2xl:w-auto">
          {/* Quick Filters */}
          <div className="flex items-center bg-hero-drops-bg border border-hero-drops-edge rounded-inner p-1 shrink-0 w-full sm:w-auto justify-center sm:justify-start">
            <button
              onClick={() => setUiPrefs({ includeMovies: !includeMovies })}
              className={cn("px-4 py-1.5 rounded-field text-xs font-semibold transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring", includeMovies ? "bg-accent-600 text-fg-inverse shadow-e1" : "text-fg-muted hover:text-fg-secondary")}
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
                    "whitespace-nowrap px-3 py-1.5 rounded-field text-caption font-bold border transition-all flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? "bg-hero-new/15 border-hero-new/40 text-hero-new shadow-glow-sm"
                      : "bg-hero-drops-bg border-hero-drops-edge text-fg-faint hover:text-fg-secondary hover:border-edge-strong hover:bg-hero-drops-well"
                  )}
                >
                  {source}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative flex-1 w-full sm:min-w-[200px] 2xl:max-w-[260px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
            <input
              type="text"
              placeholder="Search schedule..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-inner border border-hero-drops-edge bg-hero-drops-bg py-2 pl-9 pr-4 text-sm text-fg placeholder-fg-faint focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-ring/40 transition-all"
            />
          </div>
        </div>
      </div>

      {visibleCount === 0 && (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-edge bg-surface-0 py-20 text-center">
          <SearchX className="mb-4 h-8 w-8 text-fg-faint" />
          <p className="text-fg-secondary font-medium">No shows match</p>
          {hasActiveFilters ? (
            <>
              <p className="mt-1 text-sm text-fg-faint">Your search and platform filters hid everything airing this week.</p>
              <Button variant="primary" size="md" onClick={clearFilters} className="mt-4">
                Clear filters
              </Button>
            </>
          ) : (
            <p className="mt-1 text-sm text-fg-faint">Nothing on the schedule has an announced next episode right now.</p>
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
                <h3 className="text-xl font-bold text-fg">
                  {day === DAYS[todayIndex] ? 'Today' : day}
                </h3>
                <div className="h-px flex-1 bg-edge" />
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
