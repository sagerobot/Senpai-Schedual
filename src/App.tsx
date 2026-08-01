import { AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { Calendar, LayoutGrid, Bookmark, Loader2, Sparkles, Save, Search, Settings } from 'lucide-react';
import { fetchCurrentSeasonAnime } from './api/anilist/queries';
import { AnimeMedia, ViewMode } from './types';
import { useLibrary } from './hooks/useLibrary';
import { useEpisodeLog } from './hooks/useEpisodeLog';
import { DailySchedule } from './components/DailySchedule';
import { SeasonView } from './components/SeasonView';
import { FavoritesView } from './components/FavoritesView';
import { LibraryView } from './components/LibraryView';
import { ForYouView } from './components/ForYouView';
import { SearchView } from './components/SearchView';
import { ShowDetailModal } from './components/ShowDetailModal';
import { DataSyncModal } from './components/DataSyncModal';
import { cn } from './lib/utils';
import { Library } from 'lucide-react';

export default function App() {
  const [animeList, setAnimeList] = useState<AnimeMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('schedule');

  const { library, toggleFavorite, updateEntry, setLibraryBulk } = useLibrary();
  const { logs, logEpisode, setLogsBulk } = useEpisodeLog();

  const favorites = library.filter(l => l.status === 'watching').map(l => l.showId);

  const [selectedAnime, setSelectedAnime] = useState<AnimeMedia | null>(null);
  const [isDataSyncOpen, setIsDataSyncOpen] = useState(false);

  useEffect(() => {
    async function loadData(force = false) {
      try {
        const cached = localStorage.getItem('senpai_cached_schedule_v2');
        const cacheTime = localStorage.getItem('senpai_cached_schedule_time_v2');
        
        if (cached && !force) {
          setAnimeList(JSON.parse(cached));
          setLoading(false);
          
          // If cache is less than 15 minutes old, don't fetch immediately unless forced
          const age = Date.now() - parseInt(cacheTime || '0');
          if (age < 15 * 60 * 1000) {
            return;
          }
        } else if (!cached) {
          setLoading(true);
        }

        const data = await fetchCurrentSeasonAnime();
        
        localStorage.setItem('senpai_cached_schedule_v2', JSON.stringify(data));
        localStorage.setItem('senpai_cached_schedule_time_v2', Date.now().toString());
        setAnimeList(data);
      } catch (err) {
        // Only show error if we don't have any data
        setAnimeList(prev => {
          if (prev.length === 0) {
            setError(err instanceof Error ? err.message : 'Failed to fetch anime data');
          }
          return prev;
        });
      } finally {
        setLoading(false);
      }
    }

    loadData();

    // Background fetch every 15 minutes to keep data fresh
    const interval = setInterval(() => loadData(true), 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    { id: 'season', label: 'Season', icon: LayoutGrid },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'favorites', label: 'My Watchlist', icon: Bookmark },
    { id: 'library', label: 'All-Time Library', icon: Library },
    { id: 'recommendations', label: 'For You', icon: Sparkles },
  ] as const;

  return (
    <div className="min-h-screen bg-black text-gray-100 selection:bg-purple-500/30">
      <div className="flex min-h-screen flex-col md:flex-row">
        {/* Desktop Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-gray-900 bg-black p-6 md:flex overflow-y-auto">
          <div className="mb-10 flex items-center space-x-2 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">Senpai</span>
          </div>
          
          <nav className="flex-1 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setViewMode(item.id)}
                className={cn(
                  "flex w-full items-center space-x-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                  viewMode === item.id
                    ? "bg-purple-600/10 text-purple-400"
                    : "text-gray-400 hover:bg-gray-900 hover:text-white"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
                {item.id === 'favorites' && favorites.length > 0 && (
                  <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-purple-600/20 px-1.5 text-[10px] text-purple-400">
                    {favorites.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
          
          <div className="mt-auto pt-6">
            <button
              onClick={() => setIsDataSyncOpen(true)}
              className="flex w-full items-center space-x-3 rounded-lg px-4 py-3 text-sm font-medium text-gray-400 transition-colors hover:bg-[#1e2336] hover:text-white"
            >
              <Save className="h-5 w-5" />
              <span>Data & Settings</span>
            </button>
          </div>
        </aside>

        {/* Mobile Header (replaces sidebar logo on small screens) */}
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-900 bg-black p-4 md:hidden">
          <div className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">Senpai</span>
          </div>
          <button
            onClick={() => setIsDataSyncOpen(true)}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-900 hover:text-white"
            aria-label="Data & Settings"
            title="Data & Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-6 lg:px-12 min-w-0">
          <div className="mx-auto w-full">
            {loading ? (
              <div className="flex h-[50vh] flex-col items-center justify-center space-y-4 text-purple-500">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm font-medium text-gray-400">Fetching anime schedule...</p>
              </div>
            ) : error ? (
              <div className="flex h-[50vh] items-center justify-center">
                <div className="rounded-lg border border-red-900/50 bg-red-900/20 p-6 text-center text-red-400">
                  <p>Failed to load data. Please try again later.</p>
                  <p className="mt-2 text-sm opacity-70">{error}</p>
                </div>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                {viewMode === 'schedule' && (
                  <DailySchedule 
                    animeList={animeList} 
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                    onAnimeSelect={setSelectedAnime}
                    logs={logs}
                    onLog={logEpisode}
                  />
                )}
                {viewMode === 'season' && (
                  <SeasonView 
                    animeList={animeList} 
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                    onAnimeSelect={setSelectedAnime}
                  />
                )}
                {viewMode === 'favorites' && (
                  <FavoritesView 
                    animeList={animeList} 
                    library={library}
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                    onAnimeSelect={setSelectedAnime}
                    logs={logs}
                    onLog={logEpisode}
                    onUpdateEntry={updateEntry}
                  />
                )}
                {viewMode === 'library' && (
                  <LibraryView
                    library={library}
                    logs={logs}
                    animeList={animeList}
                    onAnimeSelect={setSelectedAnime}
                    setLibraryBulk={setLibraryBulk}
                    setLogsBulk={setLogsBulk}
                  />
                )}

                {viewMode === 'search' && (
                  <SearchView 
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                    onAnimeSelect={setSelectedAnime}
                  />
                )}
                {viewMode === 'recommendations' && (
                  <ForYouView 
                    library={library}
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                    onAnimeSelect={setSelectedAnime}
                  />
                )}
              </div>
            )}
          </div>
        </main>
        
        {selectedAnime && (
          <ShowDetailModal 
            anime={selectedAnime} 
            onClose={() => setSelectedAnime(null)} 
            isFavorite={favorites.includes(selectedAnime.id)}
            onToggleFavorite={toggleFavorite}
            onAnimeSelect={setSelectedAnime}
            libraryEntry={library.find(l => l.showId === selectedAnime.id)}
            onUpdateEntry={updateEntry}
          />
        )}

        <AnimatePresence>
          {isDataSyncOpen && (
            <DataSyncModal
              isOpen={isDataSyncOpen}
              onClose={() => setIsDataSyncOpen(false)}
              library={library}
              logs={logs}
              onImportLibrary={setLibraryBulk}
              onImportLogs={setLogsBulk}
            />
          )}
        </AnimatePresence>

        {/* Mobile Bottom Navigation */}
        <nav className="border-t border-gray-900 bg-black/95 p-2 backdrop-blur-md md:hidden fixed bottom-0 left-0 w-full z-50">
          <div className="flex justify-around">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setViewMode(item.id)}
                className={cn(
                  "relative flex flex-col items-center justify-center p-2 text-xs transition-colors",
                  viewMode === item.id ? "text-purple-400" : "text-gray-500 hover:text-gray-300"
                )}
              >
                <div className={cn(
                  "mb-1 flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300",
                  viewMode === item.id ? "bg-purple-600/20" : "bg-transparent"
                )}>
                  <item.icon className={cn("h-5 w-5", viewMode === item.id && "fill-purple-400/20")} />
                </div>
                <span className="font-medium">{item.label}</span>
                {item.id === 'favorites' && favorites.length > 0 && (
                  <span className="absolute right-0 top-0 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-purple-600 px-1 text-[9px] text-white">
                    {favorites.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
