import { AnimatePresence } from 'motion/react';
import { Save, Settings, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { fetchCurrentSeasonAnime, fetchMediaById } from '../api/anilist/queries';
import { MediaSchema } from '../api/anilist/schemas';
import { DataSyncModal } from '../features/data/DataSyncModal';
import { ShowDetailModal } from '../features/show/ShowDetailModal';
import { useEpisodeLog } from '../hooks/useEpisodeLog';
import { useLibrary } from '../hooks/useLibrary';
import { readJSON, writeJSON } from '../stores/storage';
import { AnimeMedia } from '../types';
import { cn } from '../lib/utils';
import { NAV_ITEMS } from './nav';
import { ScheduleContext } from './scheduleContext';
import { SHOW_PARAM, parseShowId } from './showParam';

const SCHEDULE_CACHE_KEY = 'senpai_cached_schedule_v2';
const SCHEDULE_CACHE_TIME_KEY = 'senpai_cached_schedule_time_v2';
const SCHEDULE_TTL_MS = 15 * 60 * 1000;
const ScheduleCacheSchema = z.array(MediaSchema);

export function RootLayout() {
  const [animeList, setAnimeList] = useState<AnimeMedia[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isDataSyncOpen, setIsDataSyncOpen] = useState(false);

  const { library, toggleFavorite, updateEntry, setLibraryBulk } = useLibrary();
  const { logs, setLogsBulk } = useEpisodeLog();
  const favorites = useMemo(() => library.filter((l) => l.status === 'watching').map((l) => l.showId), [library]);

  const loadSchedule = useCallback(async (force = false) => {
    try {
      const cached = readJSON<AnimeMedia[]>(SCHEDULE_CACHE_KEY, ScheduleCacheSchema, []);

      if (cached.length > 0 && !force) {
        setAnimeList(cached);
        setScheduleLoading(false);

        const cachedAt = readJSON(SCHEDULE_CACHE_TIME_KEY, z.number(), 0);
        if (Date.now() - cachedAt < SCHEDULE_TTL_MS) return;
      } else if (cached.length === 0) {
        setScheduleLoading(true);
      }

      const data = await fetchCurrentSeasonAnime();
      writeJSON(SCHEDULE_CACHE_KEY, data);
      writeJSON(SCHEDULE_CACHE_TIME_KEY, Date.now());
      setAnimeList(data);
      setScheduleError(null);
    } catch (err) {
      // A background refresh that fails on top of good data is not an error the
      // user needs to see; only a cold failure has nothing to show.
      setAnimeList((prev) => {
        if (prev.length === 0) {
          setScheduleError(err instanceof Error ? err.message : 'Failed to fetch anime data');
        }
        return prev;
      });
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchedule();
    const interval = setInterval(() => void loadSchedule(true), SCHEDULE_TTL_MS);
    return () => clearInterval(interval);
  }, [loadSchedule]);

  const retrySchedule = useCallback(() => {
    setScheduleError(null);
    setScheduleLoading(true);
    void loadSchedule(true);
  }, [loadSchedule]);

  // ---- Show detail modal, hosted on `?show=<id>` --------------------------

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawShowParam = searchParams.get(SHOW_PARAM);
  const showId = parseShowId(rawShowParam);

  const clearShowParam = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(SHOW_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [setSearchParams]);

  // A `?show=` value that is not a media id is junk in the URL, not a show.
  useEffect(() => {
    if (rawShowParam !== null && showId === null) clearShowParam();
  }, [rawShowParam, showId, clearShowParam]);

  const [fetchedShow, setFetchedShow] = useState<AnimeMedia | null>(null);

  // Both refs keep the fetch effect keyed on `showId` alone. `setSearchParams`
  // (and so `clearShowParam`) gets a new identity on every search-param change,
  // and `animeList` changes on every background refresh — either in the dep
  // array would abort and restart an in-flight fetch.
  const animeListRef = useRef(animeList);
  animeListRef.current = animeList;
  const clearShowParamRef = useRef(clearShowParam);
  clearShowParamRef.current = clearShowParam;

  useEffect(() => {
    if (showId === null) {
      setFetchedShow(null);
      return;
    }
    // Already on screen from the season fetch — no request needed.
    if (animeListRef.current.some((a) => a.id === showId)) {
      setFetchedShow(null);
      return;
    }

    let active = true;
    setFetchedShow(null);
    fetchMediaById(showId)
      .then((media) => {
        if (active) setFetchedShow(media);
      })
      .catch(() => {
        if (!active) return;
        toast.error("Couldn't load that show.");
        clearShowParamRef.current();
      });
    return () => {
      active = false;
    };
  }, [showId]);

  const modalShow: AnimeMedia | null = useMemo(() => {
    if (showId === null) return null;
    const fromList = animeList.find((a) => a.id === showId);
    if (fromList) return fromList;
    // Guard against one frame of the previous show under a new `key`.
    return fetchedShow?.id === showId ? fetchedShow : null;
  }, [showId, animeList, fetchedShow]);

  const closeShow = useCallback(() => {
    // Back is the natural close when the previous entry is ours: it also steps
    // backwards through a chain of related shows opened inside the modal.
    const historyState = window.history.state as { idx?: number } | null;
    const hasInAppHistory = typeof historyState?.idx === 'number' && historyState.idx > 0;
    if (hasInAppHistory) navigate(-1);
    else clearShowParam();
  }, [navigate, clearShowParam]);

  const openShowFromModal = useCallback(
    (anime: AnimeMedia) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(SHOW_PARAM, String(anime.id));
          return next;
        },
        { preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  const outletContext: ScheduleContext = useMemo(
    () => ({ animeList, scheduleLoading, scheduleError, retrySchedule }),
    [animeList, scheduleLoading, scheduleError, retrySchedule],
  );

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex w-full items-center space-x-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
      isActive ? 'bg-purple-600/10 text-purple-400' : 'text-gray-400 hover:bg-gray-900 hover:text-white',
    );

  return (
    <div className="min-h-screen bg-black text-gray-100 selection:bg-purple-500/30">
      <div className="flex min-h-screen flex-col md:flex-row">
        {/* Desktop Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-gray-900 bg-black p-6 md:flex">
          <div className="mb-10 flex items-center space-x-2 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">Senpai</span>
          </div>

          <nav className="flex-1 space-y-2">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
                {item.to === '/watching' && favorites.length > 0 && (
                  <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-purple-600/20 px-1.5 text-[10px] text-purple-400">
                    {favorites.length}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto pt-6">
            <button
              onClick={() => setIsDataSyncOpen(true)}
              className="flex w-full items-center space-x-3 rounded-lg px-4 py-3 text-sm font-medium text-gray-400 transition-colors hover:bg-surface-2 hover:text-white"
            >
              <Save className="h-5 w-5" />
              <span>Data &amp; Settings</span>
            </button>
          </div>
        </aside>

        {/* Mobile Header (replaces the sidebar logo on small screens) */}
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-900 bg-black p-4 md:hidden">
          <div className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">Senpai</span>
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

        <main className="min-w-0 flex-1 px-4 py-6 pb-24 md:px-8 md:pb-6 lg:px-12">
          <div className="mx-auto w-full">
            <Outlet context={outletContext} />
          </div>
        </main>

        {modalShow && (
          <ShowDetailModal
            key={modalShow.id}
            anime={modalShow}
            onClose={closeShow}
            isFavorite={favorites.includes(modalShow.id)}
            onToggleFavorite={toggleFavorite}
            onAnimeSelect={openShowFromModal}
            libraryEntry={library.find((l) => l.showId === modalShow.id)}
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
        <nav className="fixed bottom-0 left-0 z-50 w-full border-t border-gray-900 bg-black/95 p-2 backdrop-blur-md md:hidden">
          <div className="flex justify-around">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'relative flex flex-col items-center justify-center p-2 text-xs transition-colors',
                    isActive ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <div
                      className={cn(
                        'mb-1 flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300',
                        isActive ? 'bg-purple-600/20' : 'bg-transparent',
                      )}
                    >
                      <item.icon className={cn('h-5 w-5', isActive && 'fill-purple-400/20')} />
                    </div>
                    <span className="font-medium">{item.label}</span>
                    {item.to === '/watching' && favorites.length > 0 && (
                      <span className="absolute right-0 top-0 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-purple-600 px-1 text-[9px] text-white">
                        {favorites.length}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
