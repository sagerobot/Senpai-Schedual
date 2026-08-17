
import { AnimeMedia } from '../../types';
import { AnimeCard } from '../../components/AnimeCard';
import { SeriesTitle } from '../../components/SeriesTitle';
import { ErrorState, errorDetail } from '../../components/ErrorState';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tooltip } from '../../components/ui/Tooltip';
import { Search, CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSeasonQuery } from '../../queries/hooks';
import { displayTitle } from '../../lib/displayTitle';
import { SEASONS, currentSeason, maxSeasonYear, parseSeasonParams, seasonPath } from '../../routes/season';

/**
 * Loading is shaped like the content it becomes (docs/design-language.md §8):
 * the same auto-fill grid the loaded cards use, so arriving data replaces
 * placeholders without shifting the layout.
 */
function SeasonSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="h-4 w-56 rounded bg-surface-1" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 sm:gap-6">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded-inner bg-surface-1 shadow-e2">
            <Skeleton className="aspect-[3/4] w-full rounded-none" />
            <div className="space-y-2 p-3 sm:p-4">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded bg-surface-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface SeasonViewProps {
  onAnimeSelect: (anime: AnimeMedia) => void;
}

export function SeasonView({ onAnimeSelect }: SeasonViewProps) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const params = useParams();

  const now = useMemo(() => currentSeason(), []);
  const currentYear = now.year;

  // Which season is on screen is URL state; the route loader guarantees it parses.
  const parsed = parseSeasonParams(params.year, params.season) ?? now;
  const selectedYear = parsed.year;
  const selectedSeason = parsed.season.toUpperCase();

  const query = useSeasonQuery(parsed.year, parsed.season);
  const displayList = useMemo(() => query.data ?? [], [query.data]);
  const loading = query.isPending;

  const filtered = useMemo(() => {
    if (!search) return displayList;
    return displayList.filter(a =>
      a.title.userPreferred?.toLowerCase().includes(search.toLowerCase()) ||
      a.title.english?.toLowerCase().includes(search.toLowerCase())
    );
  }, [displayList, search]);

  const goToSeason = (year: number, season: string) => {
    setSearch('');
    navigate(seasonPath(year, season));
  };

  const handlePrevSeason = () => {
    const currentIndex = SEASONS.indexOf(selectedSeason as (typeof SEASONS)[number]);
    if (currentIndex <= 0) goToSeason(selectedYear - 1, 'FALL');
    else goToSeason(selectedYear, SEASONS[currentIndex - 1]);
  };

  // Where the next-season button would land; paging stops once that would
  // pass the last year with plausible announcements (see maxSeasonYear).
  const nextTarget = useMemo(() => {
    const currentIndex = SEASONS.indexOf(selectedSeason as (typeof SEASONS)[number]);
    return currentIndex === SEASONS.length - 1
      ? { year: selectedYear + 1, season: 'WINTER' }
      : { year: selectedYear, season: SEASONS[currentIndex + 1] };
  }, [selectedSeason, selectedYear]);
  const atForwardBoundary = nextTarget.year > maxSeasonYear();

  const handleNextSeason = () => {
    if (atForwardBoundary) return;
    goToSeason(nextTarget.year, nextTarget.season);
  };

  const isCurrentSeason = parsed.season === now.season && selectedYear === currentYear;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Tooltip label="Previous season" align="start">
              <Button
                variant="ghost"
                size="lg"
                onClick={handlePrevSeason}
                aria-label="Previous season"
                className="w-11 px-0"
              >
                <ChevronLeft className="w-5 h-5" aria-hidden="true" />
              </Button>
            </Tooltip>
            <h1 className="text-2xl font-bold tracking-tight text-fg">
              {selectedSeason} {selectedYear}
            </h1>
            {/* The forward boundary keeps its explanation: the tooltip says why
                the button is disabled instead of going silent. */}
            <Tooltip
              label={atForwardBoundary ? 'Nothing announced further out yet' : 'Next season'}
              align="center"
            >
              <Button
                variant="ghost"
                size="lg"
                onClick={handleNextSeason}
                disabled={atForwardBoundary}
                aria-label="Next season"
                className="w-11 px-0"
              >
                <ChevronRight className="w-5 h-5" aria-hidden="true" />
              </Button>
            </Tooltip>
          </div>
          <p className="text-fg-muted mt-1">
            {isCurrentSeason ? "All anime airing this season" : `Archive for ${selectedSeason.toLowerCase()} ${selectedYear}`}
          </p>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-faint" />
          <input 
            type="text"
            placeholder="Search season..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-full border border-edge bg-surface-1/50 py-2 pl-10 pr-4 text-fg placeholder-fg-faint focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-ring/40 sm:w-64"
          />
        </div>
      </div>

      {loading ? (
        <SeasonSkeleton />
      ) : query.isError ? (
        <ErrorState
          title={`Couldn't load ${selectedSeason.toLowerCase()} ${selectedYear}.`}
          detail={errorDetail(query.error, 'The request failed.')}
          onRetry={() => void query.refetch()}
        />
      ) : displayList.length === 0 ? (
        // The season really has nothing — a different answer from a search miss.
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-edge bg-surface-0 py-24 text-center">
          <CalendarClock className="mb-4 h-8 w-8 text-fg-faint" />
          <p className="text-lg text-fg-secondary">
            Nothing announced for {selectedSeason} {selectedYear} yet — check back later.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 sm:gap-6">
            {filtered.map(anime => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                titleOverride={<SeriesTitle showId={anime.id} fallbackTitle={displayTitle(anime)} />}
                onClick={onAnimeSelect}
              />
            ))}
          </div>

          {filtered.length === 0 && (
            // A search miss, not an empty season — same card language as the
            // season-empty state above, with a way back out.
            <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-edge bg-surface-0 px-6 py-24 text-center">
              <Search className="mb-4 h-8 w-8 text-fg-faint" aria-hidden="true" />
              <p className="text-lg text-fg-secondary">No shows found matching "{search}"</p>
              <p className="mt-1 text-fg-muted">
                Nothing in {selectedSeason.toLowerCase()} {selectedYear} matches — try another title.
              </p>
              <Button variant="secondary" size="lg" className="mt-6" onClick={() => setSearch('')}>
                Clear search
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
