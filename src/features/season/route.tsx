import { useMemo } from 'react';
import { useParams } from 'react-router';
import { ScheduleError, ScheduleLoading } from '../../components/ScheduleState';
import { useLibrary } from '../../hooks/useLibrary';
import { useScheduleContext } from '../../routes/scheduleContext';
import { currentSeason, parseSeasonParams } from '../../routes/season';
import { useOpenShow } from '../../routes/showParam';
import { SeasonView } from './SeasonView';

export function SeasonRoute() {
  const { animeList, scheduleLoading, scheduleError, retrySchedule } = useScheduleContext();
  const { library, toggleFavorite } = useLibrary();
  const openShow = useOpenShow();
  const params = useParams();

  const favorites = useMemo(() => library.filter((l) => l.status === 'watching').map((l) => l.showId), [library]);

  // The loader has already redirected anything unparseable; this is belt-and-braces.
  const now = useMemo(() => currentSeason(), []);
  const parsed = parseSeasonParams(params.year, params.season) ?? now;
  const isCurrentSeason = parsed.year === now.year && parsed.season === now.season;

  // Only the current season reads from the shared fetch — archives fetch their own.
  if (isCurrentSeason && animeList.length === 0) {
    if (scheduleLoading) return <ScheduleLoading />;
    if (scheduleError) return <ScheduleError message={scheduleError} onRetry={retrySchedule} />;
  }

  return (
    <SeasonView
      animeList={animeList}
      favorites={favorites}
      onToggleFavorite={toggleFavorite}
      onAnimeSelect={openShow}
    />
  );
}
