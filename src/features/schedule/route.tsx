import { useMemo } from 'react';
import { ScheduleError, ScheduleLoading } from '../../components/ScheduleState';
import { useEpisodeLog } from '../../hooks/useEpisodeLog';
import { useLibrary } from '../../hooks/useLibrary';
import { useScheduleContext } from '../../routes/scheduleContext';
import { useOpenShow } from '../../routes/showParam';
import { DailySchedule } from './DailySchedule';

export function ScheduleRoute() {
  const { animeList, scheduleLoading, scheduleError, retrySchedule } = useScheduleContext();
  const { library, toggleFavorite } = useLibrary();
  const { logs, logEpisode } = useEpisodeLog();
  const openShow = useOpenShow();

  const favorites = useMemo(() => library.filter((l) => l.status === 'watching').map((l) => l.showId), [library]);

  if (animeList.length === 0) {
    if (scheduleLoading) return <ScheduleLoading />;
    if (scheduleError) return <ScheduleError message={scheduleError} onRetry={retrySchedule} />;
  }

  return (
    <DailySchedule
      animeList={animeList}
      favorites={favorites}
      onToggleFavorite={toggleFavorite}
      onAnimeSelect={openShow}
      logs={logs}
      onLog={logEpisode}
    />
  );
}
