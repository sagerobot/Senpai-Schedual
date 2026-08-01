
import { AnimeMedia } from '../../types';
import { AnimeCard } from '../../components/AnimeCard';
import { SeriesTitle } from '../../components/SeriesTitle';
import { ScheduleError } from '../../components/ScheduleState';
import { Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSeasonQuery } from '../../queries/hooks';
import { displayTitle } from '../../lib/displayTitle';
import { SEASONS, currentSeason, parseSeasonParams, seasonPath } from '../../routes/season';

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

  const handleNextSeason = () => {
    const currentIndex = SEASONS.indexOf(selectedSeason as (typeof SEASONS)[number]);
    if (currentIndex === SEASONS.length - 1) goToSeason(selectedYear + 1, 'WINTER');
    else goToSeason(selectedYear, SEASONS[currentIndex + 1]);
  };

  const isCurrentSeason = parsed.season === now.season && selectedYear === currentYear;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <button onClick={handlePrevSeason} className="p-1 hover:bg-gray-800 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            {selectedSeason} {selectedYear}
            <button onClick={handleNextSeason} className="p-1 hover:bg-gray-800 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </h2>
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
        <ScheduleError
          title={`Couldn't load ${selectedSeason.toLowerCase()} ${selectedYear}.`}
          message={query.error instanceof Error ? query.error.message : 'The request failed.'}
          onRetry={() => void query.refetch()}
        />
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
