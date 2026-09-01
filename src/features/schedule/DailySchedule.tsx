import { AnimeMedia, EpisodeLog } from '../../types';
import { AiringRunway } from '../../components/AiringRunway';
import { AnimeCard } from '../../components/AnimeCard';
import { SeriesTitle } from '../../components/SeriesTitle';
import { UpNextDeck } from '../../components/UpNextDeck';
import { WelcomeHero } from '../../components/WelcomeHero';
import { Search, SearchX, Film, Loader2, X } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { displayTitle } from '../../lib/displayTitle';
import { latestAiredEpisode } from '../../lib/aired';
import { DROP_WINDOW_SEC } from '../../lib/freshness';
import { CheckInFeed, computeDrops, wouldBeDrop } from './CheckInFeed';
import { WeekRuler } from './WeekRuler';
import { summarizeWeek } from './weekSummary';
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

/**
 * The hit-area idiom from design-language §5: the filter chips stay visually
 * compact while a pseudo-element carries the 44px touch floor. Same trick as
 * UpNextDeck's and VibeChip's controls.
 */
const TOUCH_EXTEND =
  "relative after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']";

function matchesTitle(anime: AnimeMedia, term: string): boolean {
  return (
    anime.title.userPreferred?.toLowerCase().includes(term) === true ||
    anime.title.english?.toLowerCase().includes(term) === true
  );
}

/** Every streaming site this show can be watched on, deduped — a show with two
 * Crunchyroll links must still count once against the chip's tally. */
function sitesFor(anime: AnimeMedia): Set<string> {
  const sites = new Set<string>();
  for (const link of anime.externalLinks ?? []) {
    if (STREAMING_SITES.includes(link.site)) sites.add(link.site);
  }
  return sites;
}

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
  // Seasons folded behind a franchise card count too: a stacked Season 2
  // whose finale just aired is queued behind an unfinished Season 1 in the
  // deck, but its graduation card still belongs in the drops row.
  const dropSource = useMemo(() => {
    const merged = new Map(animeList.map((a) => [a.id, a]));
    for (const c of upNextCandidates) {
      if (!merged.has(c.anime.id)) merged.set(c.anime.id, c.anime);
      for (const queued of c.series?.then ?? []) {
        if (!merged.has(queued.anime.id)) merged.set(queued.anime.id, queued.anime);
      }
    }
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
  // one tracked episode aired inside the drop window and its log exists. Shares
  // DROP_WINDOW_SEC with computeDrops — a done-tag on a different clock to the
  // surface it describes is how you get "done" over a row of unwatched cards.
  const clearedDropsToday = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return dropSource.some((anime) => {
      if (!favorites.includes(anime.id) && !stacking.includes(anime.id)) return false;
      const latest = latestAiredEpisode(anime, now);
      if (latest === null) return false;
      // The lower bound matters: latestAiredEpisode's estimated branch guesses
      // airedAt as airingAt − 7 days, which lands in the *future* for a show on
      // a break. Without this, such a show reported a cleared "today" that
      // never happened.
      const sinceAir = now - latest.airedAt;
      if (sinceAir < 0 || sinceAir > DROP_WINDOW_SEC) return false;
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
  const mineOnly = useUserData(s => s.uiPrefs.mineOnly ?? false);
  const setUiPrefs = useUserData(s => s.setUiPrefs);

  /** "Mine" is watching + stacking: both are shows the user has claimed. */
  const mineIds = useMemo(() => new Set([...favorites, ...stacking]), [favorites, stacking]);

  /**
   * Everything the schedule *could* show. Movies shape this baseline rather
   * than filtering it — the toggle decides what counts as being on your
   * schedule at all, which is what keeps the Mine/Everything tallies beside it
   * comparable.
   */
  const baseList = useMemo(() => {
    const airing = animeList.filter(a => a.nextAiringEpisode);
    return includeMovies ? airing : airing.filter(a => a.format !== 'MOVIE');
  }, [animeList, includeMovies]);

  const mineCount = useMemo(
    () => baseList.reduce((n, a) => (mineIds.has(a.id) ? n + 1 : n), 0),
    [baseList, mineIds],
  );

  const term = search.trim().toLowerCase();

  /**
   * Every filter *except* the source chips. Source counts are computed against
   * it so a chip's number is exactly what clicking it yields, and the schedule
   * below is this list with the chip selection applied.
   */
  const sourceScope = useMemo(() => {
    let list = baseList;
    if (mineOnly) list = list.filter(a => mineIds.has(a.id));
    if (term) list = list.filter(a => matchesTitle(a, term));
    return list;
  }, [baseList, mineOnly, mineIds, term]);

  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const anime of sourceScope) {
      for (const site of sitesFor(anime)) counts.set(site, (counts.get(site) ?? 0) + 1);
    }
    return counts;
  }, [sourceScope]);

  const availableSources = useMemo(() => {
    const sources = new Set<string>();
    for (const anime of baseList) {
      for (const site of sitesFor(anime)) sources.add(site);
    }
    return Array.from(sources).sort();
  }, [baseList]);

  const schedule = useMemo(() => {
    let filtered = sourceScope;

    if (selectedSources.length > 0) {
      filtered = filtered.filter(a =>
        a.externalLinks?.some(link => selectedSources.includes(link.site))
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
  }, [sourceScope, selectedSources]);

  // Order days starting from today
  const todayIndex = new Date().getDay();
  const orderedDays = useMemo(
    () => [...DAYS.slice(todayIndex), ...DAYS.slice(0, todayIndex)],
    [todayIndex],
  );

  // The ruler describes the *visible* schedule, so it can never disagree with
  // the grid below it — a filter that empties a day empties its column too.
  const weekDays = useMemo(
    () => summarizeWeek(schedule, orderedDays, favorites, stacking, logs, new Date()),
    [schedule, orderedDays, favorites, stacking, logs],
  );

  const jumpToDay = useCallback((day: string) => {
    const target = document.getElementById(`schedule-day-${day}`);
    if (!target || typeof target.scrollIntoView !== 'function') return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, []);

  const visibleCount = DAYS.reduce((n, day) => n + schedule[day].length, 0);
  const todayCount = schedule[DAYS[todayIndex]].length;
  // includeMovies is deliberately absent: it only ever *adds* shows, so it can
  // never be the reason the grid came back empty.
  const hasActiveFilters = term.length > 0 || selectedSources.length > 0 || mineOnly;

  const clearFilters = () => {
    setSearch('');
    setUiPrefs({ selectedSources: [], includeMovies: false, mineOnly: false });
  };

  return (
    <div className="space-y-8 pb-12">
      {/* The visible page leads with the lean-back deck by design; the document
          outline still leads with the view's one h1 (docs §11). */}
      <h1 className="sr-only">Daily Schedule</h1>
      <WelcomeHero />

      {/* The hour before the drop. Its own section rather than a fifth card
          class, so the drops grid — tray spans, fill maths, merged deck row —
          is untouched. It unmounts itself when nothing is within the hour. */}
      <AiringRunway
        animeList={dropSource}
        favorites={favorites}
        stacking={stacking}
        logs={logs}
        onAnimeSelect={onAnimeSelect}
      />

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

      <section
        aria-labelledby="schedule-heading"
        className="mb-8 space-y-4 rounded-card border border-hero-drops-edge/60 bg-hero-drops-deep/50 p-4 shadow-e1 backdrop-blur-sm sm:p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 id="schedule-heading" className="text-2xl font-bold tracking-tight text-fg">
              Daily Schedule
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
              <span className="tabular-nums text-fg-secondary">
                {visibleCount}
                {visibleCount !== baseList.length && (
                  <span className="text-fg-faint"> of {baseList.length}</span>
                )}
              </span>
              <span>episode{visibleCount === 1 ? '' : 's'} this week</span>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-edge-strong" />
              <span className="tabular-nums text-fg-secondary">{todayCount}</span>
              <span>today</span>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-edge-strong" />
              <span className="text-fg-faint">times in your timezone</span>
            </p>
            {isStreaming && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface-1 px-2.5 py-1 text-caption font-medium text-fg-muted">
                <Loader2 className="h-3 w-3 animate-spin text-accent-400" />
                Loading more shows…
              </span>
            )}
          </div>

          <div className="relative w-full lg:w-[260px] lg:shrink-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
            <input
              type="text"
              placeholder="Search schedule..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-11 w-full rounded-inner border border-hero-drops-edge bg-hero-drops-bg pl-9 pr-4 text-sm text-fg placeholder-fg-faint transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
        </div>

        {/* One wrapping row. Nothing here scrolls sideways or gets clipped:
            a narrow window buys another line, never a hidden chip. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-inner border border-hero-drops-edge bg-hero-drops-bg p-1">
            {([
              { mine: true, label: 'Mine', count: mineCount },
              { mine: false, label: 'Everything', count: baseList.length },
            ] as const).map(seg => (
              <button
                key={seg.label}
                type="button"
                aria-pressed={mineOnly === seg.mine}
                onClick={() => setUiPrefs({ mineOnly: seg.mine })}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-field px-3.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  TOUCH_EXTEND,
                  mineOnly === seg.mine
                    ? 'bg-accent-600 text-fg-inverse shadow-e1'
                    : 'text-fg-muted hover:text-fg-secondary',
                )}
              >
                {seg.label}
                <span className={cn('text-micro tabular-nums', mineOnly === seg.mine ? 'opacity-75' : 'text-fg-faint')}>
                  {seg.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-inner border border-hero-drops-edge bg-hero-drops-bg p-1">
            <button
              type="button"
              aria-pressed={includeMovies}
              onClick={() => setUiPrefs({ includeMovies: !includeMovies })}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-field px-3.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                TOUCH_EXTEND,
                includeMovies
                  ? 'bg-accent-600 text-fg-inverse shadow-e1'
                  : 'text-fg-muted hover:text-fg-secondary',
              )}
            >
              <Film className="h-3.5 w-3.5" />
              Movies
            </button>
          </div>

          {availableSources.length > 0 && (
            <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-hero-drops-edge sm:block" />
          )}

          {availableSources.map(source => {
            const isSelected = selectedSources.includes(source);
            const count = sourceCounts.get(source) ?? 0;
            return (
              <button
                key={source}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setUiPrefs({
                    selectedSources: isSelected
                      ? selectedSources.filter(s => s !== source)
                      : [...selectedSources, source],
                  });
                }}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-field border px-3 py-1.5 text-caption font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  TOUCH_EXTEND,
                  isSelected
                    ? 'border-hero-new/40 bg-hero-new/15 text-hero-new shadow-glow-sm'
                    : 'border-hero-drops-edge bg-hero-drops-bg text-fg-faint hover:border-edge-strong hover:bg-hero-drops-well hover:text-fg-secondary',
                  // Nothing behind this chip right now — still clickable, just
                  // not worth a click.
                  !isSelected && count === 0 && 'opacity-50',
                )}
              >
                {source}
                <span className={cn('text-micro tabular-nums font-medium', isSelected ? 'opacity-75' : 'opacity-70')}>
                  {count}
                </span>
              </button>
            );
          })}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-field border border-dashed border-edge-strong px-3 py-1.5 text-caption font-semibold text-fg-muted transition-colors hover:border-edge-strong hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                TOUCH_EXTEND,
              )}
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>

        <WeekRuler days={weekDays} onJump={jumpToDay} />
      </section>

      {visibleCount === 0 && (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-edge bg-surface-0 py-20 text-center">
          <SearchX className="mb-4 h-8 w-8 text-fg-faint" />
          <p className="text-fg-secondary font-medium">No shows match</p>
          {hasActiveFilters ? (
            <>
              <p className="mt-1 text-sm text-fg-faint">
                {mineOnly && selectedSources.length === 0 && term.length === 0
                  ? "None of your shows have an episode this week — switch to Everything to see what's airing."
                  : 'Your filters hid everything airing this week.'}
              </p>
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
            // scroll-mt clears the sticky mobile header the ruler's jump would
            // otherwise park this heading behind.
            <div
              key={day}
              id={`schedule-day-${day}`}
              className="scroll-mt-20 space-y-4 md:scroll-mt-6"
            >
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
