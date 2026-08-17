import { useCallback } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '../../components/ErrorState';
import { useEpisodeLog } from '../../hooks/useEpisodeLog';
import { useLibrary } from '../../hooks/useLibrary';
import { useScheduleContext } from '../../routes/scheduleContext';
import { useOpenShow } from '../../routes/showParam';
import { WatchingView } from './WatchingView';

/**
 * Renders immediately: the view fills in anything the season fetch hasn't
 * delivered yet by id, so an empty `animeList` is a slower first paint, not a
 * blocked one.
 */
export function WatchingRoute() {
  const { animeList, scheduleError, retrySchedule } = useScheduleContext();
  const { library } = useLibrary();
  const { logs, logEpisode, unlogEpisode } = useEpisodeLog();
  const openShow = useOpenShow();

  // Logging is undoable everywhere it happens (PR 12 semantics).
  const handleLog = useCallback(
    (showId: number, episodeNumber: number, score: number | null) => {
      logEpisode(showId, episodeNumber, score);
      toast(`Logged episode ${episodeNumber}`, {
        action: { label: 'Undo', onClick: () => unlogEpisode(showId, episodeNumber) },
      });
    },
    [logEpisode, unlogEpisode],
  );

  // A failed schedule fetch must never render as "Nothing here yet" (docs §8).
  // With cached data on screen the view stays useful; only a total absence of
  // schedule data plus an error blocks the view.
  if (animeList.length === 0 && scheduleError) {
    return <ErrorState title="Failed to load the schedule." detail={scheduleError} onRetry={retrySchedule} />;
  }

  return (
    <WatchingView
      animeList={animeList}
      library={library}
      logs={logs}
      onLog={handleLog}
      onAnimeSelect={openShow}
    />
  );
}
