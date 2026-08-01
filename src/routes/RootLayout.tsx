import { Save, Settings, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { SettingsDialog } from '../features/data/SettingsDialog';
import { ShowDetailModal } from '../features/show/ShowDetailModal';
import { useLibrary } from '../hooks/useLibrary';
import { useCurrentSchedule, useMediaById } from '../queries/hooks';
import { AnimeMedia } from '../types';
import { cn } from '../lib/utils';
import { NAV_ITEMS } from './nav';
import { ScheduleContext } from './scheduleContext';
import { SHOW_PARAM, parseShowId } from './showParam';

export function RootLayout() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const { library, updateEntry } = useLibrary();
  const favorites = useMemo(() => library.filter((l) => l.status === 'watching').map((l) => l.showId), [library]);

  const schedule = useCurrentSchedule();
  // Complete data wins; on a cold start the pages streamed so far paint early.
  const animeList = useMemo(
    () => schedule.data ?? schedule.partialData ?? [],
    [schedule.data, schedule.partialData],
  );
  const scheduleError = schedule.isError
    ? schedule.error instanceof Error
      ? schedule.error.message
      : 'Failed to fetch anime data'
    : null;

  const refetchSchedule = schedule.refetch;
  const retrySchedule = useCallback(() => {
    void refetchSchedule();
  }, [refetchSchedule]);

  // A failed *background* refresh (cached data still on screen) is worth one
  // toast, not a blocking error screen. The ref keeps the interval refetch
  // from re-toasting every 15 minutes; a successful refresh re-arms it.
  const refreshToastArmed = useRef(true);
  const hasScheduleData = schedule.data !== undefined;
  useEffect(() => {
    if (schedule.isError && hasScheduleData) {
      if (refreshToastArmed.current) {
        refreshToastArmed.current = false;
        toast.error("Couldn't refresh the schedule — showing cached data");
      }
    } else if (schedule.isSuccess) {
      refreshToastArmed.current = true;
    }
  }, [schedule.isError, schedule.isSuccess, hasScheduleData]);

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

  const fromList = useMemo(
    () => (showId === null ? undefined : animeList.find((a) => a.id === showId)),
    [showId, animeList],
  );

  // Anything the schedule already holds needs no request; everything else is
  // resolved by id (batched, and shared with the Library/Watching lookups).
  const fetchedShowQuery = useMediaById(fromList ? null : showId);
  const fetchedShow = fetchedShowQuery.data ?? null;

  // A link to an id AniList does not know resolves to `null`, not an error.
  const showMissing = fetchedShowQuery.isError || (fetchedShowQuery.isSuccess && fetchedShow === null);
  useEffect(() => {
    if (fromList || showId === null || !showMissing) return;
    toast.error("Couldn't load that show.");
    clearShowParam();
  }, [fromList, showId, showMissing, clearShowParam]);

  const modalShow: AnimeMedia | null = useMemo(() => {
    if (showId === null) return null;
    if (fromList) return fromList;
    // Guard against one frame of the previous show under a new `key`.
    return fetchedShow?.id === showId ? fetchedShow : null;
  }, [showId, fromList, fetchedShow]);

  const closeShow = useCallback(() => {
    // Back is the natural close when the previous entry is ours: it also steps
    // backwards through a chain of related shows opened inside the modal.
    const historyState = window.history.state as { idx?: number } | null;
    const hasInAppHistory = typeof historyState?.idx === 'number' && historyState.idx > 0;
    if (hasInAppHistory) navigate(-1);
    else clearShowParam();
  }, [navigate, clearShowParam]);

  const openShowFromModal = useCallback(
    (show: { id: number }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(SHOW_PARAM, String(show.id));
          return next;
        },
        { preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  const outletContext: ScheduleContext = useMemo(
    () => ({
      animeList,
      scheduleLoading: schedule.isPending,
      scheduleStreaming: schedule.isStreaming,
      scheduleError,
      retrySchedule,
    }),
    [animeList, schedule.isPending, schedule.isStreaming, scheduleError, retrySchedule],
  );

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex w-full items-center space-x-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
      isActive ? 'bg-purple-600/10 text-purple-400' : 'text-gray-400 hover:bg-gray-900 hover:text-white',
    );

  return (
    <div className="min-h-screen bg-black text-gray-100 selection:bg-purple-500/30">
      {/* First tab stop on every page: jump the navs and land on the view. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-accent-600 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <div className="flex min-h-screen flex-col md:flex-row">
        {/* Desktop Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-gray-900 bg-black p-6 md:flex">
          <div className="mb-10 flex items-center space-x-2 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">Senpai</span>
          </div>

          <nav aria-label="Primary" className="flex-1 space-y-2">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>
                <item.icon className="h-5 w-5" aria-hidden="true" />
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
              onClick={() => setIsSettingsOpen(true)}
              className="flex w-full items-center space-x-3 rounded-lg px-4 py-3 text-sm font-medium text-gray-400 transition-colors hover:bg-surface-2 hover:text-white"
            >
              <Save className="h-5 w-5" aria-hidden="true" />
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
            onClick={() => setIsSettingsOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-900 hover:text-white"
            aria-label="Data & Settings"
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        {/* Bottom padding clears the mobile nav (h-14) plus its safe-area inset. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-6 pb-[calc(3.5rem+1rem+env(safe-area-inset-bottom))] focus:outline-none md:px-8 md:pb-6 lg:px-12"
        >
          <div className="mx-auto w-full">
            <Outlet context={outletContext} />
          </div>
        </main>

        {modalShow && (
          <ShowDetailModal
            key={modalShow.id}
            anime={modalShow}
            onClose={closeShow}
            onAnimeSelect={openShowFromModal}
            libraryEntry={library.find((l) => l.showId === modalShow.id)}
            onUpdateEntry={updateEntry}
          />
        )}

        <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />

        {/* Mobile Bottom Navigation — fixed 56px row, six items, labels never wrap. */}
        <nav
          aria-label="Primary mobile"
          className="fixed bottom-0 left-0 z-50 w-full border-t border-gray-900 bg-black/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        >
          <div className="flex h-14 items-stretch">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap text-[10px] font-medium transition-colors',
                    isActive ? 'text-accent-400' : 'text-gray-400 hover:text-gray-200',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute top-0 h-0.5 w-8 rounded-b-full bg-accent-400" aria-hidden="true" />
                    )}
                    <span className="relative">
                      <item.icon className="h-5 w-5" aria-hidden="true" />
                      {item.to === '/watching' && favorites.length > 0 && (
                        <span className="absolute -right-2 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-semibold text-white">
                          {favorites.length}
                        </span>
                      )}
                    </span>
                    <span>{item.label}</span>
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
