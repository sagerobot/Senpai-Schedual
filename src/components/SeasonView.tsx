
import { AnimeMedia } from '../types';
import { AnimeCard } from './AnimeCard';
import { SeriesTitle } from './SeriesTitle';
import { Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { fetchAnimeBySeason } from '../api/anilist';

interface SeasonViewProps {
  animeList: AnimeMedia[]; // Initially current season
  favorites: number[];
  onToggleFavorite: (id: number) => void;
  onAnimeSelect: (anime: AnimeMedia) => void;
}

const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

export function SeasonView({ animeList, favorites, onToggleFavorite, onAnimeSelect }: SeasonViewProps) {
  const [search, setSearch] = useState('');
  
  // Determine current real-world season/year
  const date = new Date();
  const currentYear = date.getFullYear();
  const currentMonth = date.getMonth();
  let initialSeason = 'WINTER';
  if (currentMonth >= 3 && currentMonth <= 5) initialSeason = 'SPRING';
  else if (currentMonth >= 6 && currentMonth <= 8) initialSeason = 'SUMMER';
  else if (currentMonth >= 9 && currentMonth <= 11) initialSeason = 'FALL';

  const [selectedSeason, setSelectedSeason] = useState(initialSeason);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [localList, setLocalList] = useState<AnimeMedia[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If it's the current season, just use the props animeList to save requests
    if (selectedSeason === initialSeason && selectedYear === currentYear) {
      setLocalList(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    
    fetchAnimeBySeason(selectedSeason, selectedYear)
      .then(data => {
        if (isMounted) setLocalList(data);
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) setLoading(false);
      });
      
    return () => { isMounted = false; };
  }, [selectedSeason, selectedYear, initialSeason, currentYear]);

  const displayList = localList || animeList;

  const filtered = useMemo(() => {
    if (!search) return displayList;
    return displayList.filter(a => 
      a.title.userPreferred.toLowerCase().includes(search.toLowerCase()) ||
      a.title.english?.toLowerCase().includes(search.toLowerCase())
    );
  }, [displayList, search]);

  const handlePrevSeason = () => {
    const currentIndex = SEASONS.indexOf(selectedSeason);
    if (currentIndex === 0) {
      setSelectedSeason('FALL');
      setSelectedYear(y => y - 1);
    } else {
      setSelectedSeason(SEASONS[currentIndex - 1]);
    }
  };

  const handleNextSeason = () => {
    const currentIndex = SEASONS.indexOf(selectedSeason);
    if (currentIndex === 3) {
      setSelectedSeason('WINTER');
      setSelectedYear(y => y + 1);
    } else {
      setSelectedSeason(SEASONS[currentIndex + 1]);
    }
  };

  const isCurrentSeason = selectedSeason === initialSeason && selectedYear === currentYear;

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
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 sm:gap-6">
            {filtered.map(anime => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                titleOverride={<SeriesTitle showId={anime.id} fallbackTitle={anime.title.english || anime.title.userPreferred} />}
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
