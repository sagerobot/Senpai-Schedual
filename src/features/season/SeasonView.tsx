
import { AnimeMedia } from '../../types';
import { AnimeCard } from '../../components/AnimeCard';
import { SeriesTitle } from '../../components/SeriesTitle';
import { ErrorState, errorDetail } from '../../components/ErrorState';
import { Search, CalendarClock, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSeasonQuery } from '../../queries/hooks';
import { cn } from '../../lib/utils';
import { displayTitle } from '../../lib/displayTitle';
import { SEASONS, currentSeason, maxSeasonYear, parseSeasonParams, seasonPath } from '../../routes/season';

interface SeasonViewProps {
  favorites: number[];
  onToggleFavorite: (id: number) => void;
  onAnimeSelect: (anime: AnimeMedia) => void;
}

export function SeasonView({ favorites, onToggleFavorite, onAnimeSelect }: SeasonViewProps) {
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
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrevSeason}
              aria-label="Previous season"
              title="Previous season"
              className="p-1 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {selectedSeason} {selectedYear}
            </h1>
            <button
              onClick={handleNextSeason}
              disabled={atForwardBoundary}
              aria-label="Next season"
              title={atForwardBoundary ? 'Nothing announced further out yet' : 'Next season'}
              className={cn(
                'p-1 rounded-lg transition-colors',
                atForwardBoundary ? 'cursor-not-allowed text-gray-700' : 'hover:bg-gray-800',
              )}
            >
              <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          <p className="text-gray-400 mt-1">
            {isCurrentSeason ? "All anime airing this season" : `Archive for ${selectedSeason.toLowerCase()} ${selectedYear}`}
          </p>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
          <input 
            type="text"
            placeholder="Search season..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-full border border-gray-800 bg-gray-900/50 py-2 pl-10 pr-4 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 sm:w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        </div>
      ) : query.isError ? (
        <ErrorState
          title={`Couldn't load ${selectedSeason.toLowerCase()} ${selectedYear}.`}
          detail={errorDetail(query.error, 'The request failed.')}
          onRetry={() => void query.refetch()}
        />
      ) : displayList.length === 0 ? (
        // The season really has nothing — a different answer from a search miss.
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-edge bg-surface-0 py-24 text-center">
          <CalendarClock className="mb-4 h-8 w-8 text-gray-600" />
          <p className="text-lg text-gray-300">
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
                isFavorite={favorites.includes(anime.id)}
                onToggleFavorite={onToggleFavorite}
                onClick={onAnimeSelect}
              />
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-lg text-gray-400">No shows found matching "{search}"</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
