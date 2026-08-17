import { useMemo } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { useEpisodeLog } from '../../hooks/useEpisodeLog';
import { useLibrary } from '../../hooks/useLibrary';
import { useScheduleContext } from '../../routes/scheduleContext';
import { useOpenShow } from '../../routes/showParam';
import { DailySchedule } from './DailySchedule';

/**
 * True cold start — nothing fetched yet, not even a first page. Skeletons in
 * the same grid the real cards use, so the first page streaming in replaces
 * placeholders instead of shifting the layout.
 */
function ScheduleSkeleton() {
  return (
    <div className="space-y-4 pb-12" aria-hidden>
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded-field bg-surface-2" />
        <div className="h-4 w-64 animate-pulse rounded bg-surface-1" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 sm:gap-6">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded-inner bg-surface-1 shadow-e2">
            <div className="aspect-[3/4] w-full animate-pulse bg-surface-2" />
            <div className="space-y-2 p-3 sm:p-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-surface-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScheduleRoute() {
  const { animeList, scheduleLoading, scheduleStreaming, scheduleError, retrySchedule } = useScheduleContext();
  const { library } = useLibrary();
  const { logs, logEpisode } = useEpisodeLog();
  const openShow = useOpenShow();

  const favorites = useMemo(() => library.filter((l) => l.status === 'watching').map((l) => l.showId), [library]);
  const stacking = useMemo(() => library.filter((l) => l.status === 'stacking').map((l) => l.showId), [library]);

  // Only a total absence of data blocks the view; a partial first page renders
  // below, and a failed background refresh keeps the cached list on screen.
  if (animeList.length === 0) {
    if (scheduleLoading) return <ScheduleSkeleton />;
    if (scheduleError) {
      return <ErrorState title="Failed to load the schedule." detail={scheduleError} onRetry={retrySchedule} />;
    }
  }

  return (
    <DailySchedule
      animeList={animeList}
      favorites={favorites}
      stacking={stacking}
      onAnimeSelect={openShow}
      logs={logs}
      onLog={logEpisode}
      isStreaming={scheduleStreaming}
    />
  );
}
