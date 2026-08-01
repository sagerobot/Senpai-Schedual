import { useCallback } from 'react';
import { toast } from 'sonner';
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
  const { animeList } = useScheduleContext();
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
