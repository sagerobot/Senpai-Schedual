import { useMemo } from 'react';
import { useEpisodeLog } from '../../hooks/useEpisodeLog';
import { useLibrary } from '../../hooks/useLibrary';
import { useScheduleContext } from '../../routes/scheduleContext';
import { useOpenShow } from '../../routes/showParam';
import { FavoritesView } from './FavoritesView';

/**
 * Renders immediately: the view fills in anything the season fetch hasn't
 * delivered yet by id, so an empty `animeList` is a slower first paint, not a
 * blocked one.
 */
export function WatchingRoute() {
  const { animeList } = useScheduleContext();
  const { library, toggleFavorite, updateEntry } = useLibrary();
  const { logs, logEpisode } = useEpisodeLog();
  const openShow = useOpenShow();

  const favorites = useMemo(() => library.filter((l) => l.status === 'watching').map((l) => l.showId), [library]);

  return (
    <FavoritesView
      animeList={animeList}
      library={library}
      favorites={favorites}
      onToggleFavorite={toggleFavorite}
      onAnimeSelect={openShow}
      logs={logs}
      onLog={logEpisode}
      onUpdateEntry={updateEntry}
    />
  );
}
