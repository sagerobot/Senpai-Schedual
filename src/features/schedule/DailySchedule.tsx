import { AnimeMedia, EpisodeLog } from '../../types';
import { AnimeCard } from '../../components/AnimeCard';
import { SeriesTitle } from '../../components/SeriesTitle';
import { Search, Film } from 'lucide-react';
import { useState, useMemo } from 'react';
import { cn } from '../../lib/utils';
import { displayTitle } from '../../lib/displayTitle';
import { CheckInFeed } from './CheckInFeed';
import { useUserData } from '../../stores/userData';

interface DailyScheduleProps {
  animeList: AnimeMedia[];
  favorites: number[];
  onToggleFavorite: (id: number) => void;
  onAnimeSelect: (anime: AnimeMedia) => void;
  logs: EpisodeLog[];
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function DailySchedule({ animeList, favorites, onToggleFavorite, onAnimeSelect, logs, onLog }: DailyScheduleProps) {
  const [search, setSearch] = useState('');

  // Persisted state (userData store uiPrefs)
  const includeMovies = useUserData(s => s.uiPrefs.includeMovies);
  const selectedSources = useUserData(s => s.uiPrefs.selectedSources);
  const setUiPrefs = useUserData(s => s.setUiPrefs);

  const STREAMING_SITES = ['Crunchyroll', 'Netflix', 'Hulu', 'Amazon Prime Video', 'HIDIVE', 'Disney Plus', 'Bilibili TV', 'CustomSource'];
  
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

  return (
    <div className="space-y-8 pb-12">
      <CheckInFeed 
        animeList={animeList} 
        favorites={favorites} 
        logs={logs} 
        onLog={onLog} 
        onToggleFavorite={onToggleFavorite}
        onAnimeSelect={onAnimeSelect}
      />

      <div className="flex flex-col 2xl:flex-row gap-6 items-start 2xl:items-center justify-between mb-8 bg-[#05060b]/50 border border-[#1e2336]/60 p-4 sm:p-5 rounded-2xl shadow-sm backdrop-blur-sm">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Daily Schedule
          </h2>
          <p className="text-gray-400 mt-1 text-sm">Upcoming episodes in your local timezone</p>
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
                    isFavorite={favorites.includes(anime.id)}
                    onToggleFavorite={onToggleFavorite}
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
