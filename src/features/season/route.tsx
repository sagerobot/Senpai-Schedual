import { useMemo } from 'react';
import { useLibrary } from '../../hooks/useLibrary';
import { useOpenShow } from '../../routes/showParam';
import { SeasonView } from './SeasonView';

/**
 * Renders immediately: the view owns its own season query, which for the
 * current season falls back to the schedule cache, so it never waits on the shell.
 */
export function SeasonRoute() {
  const { library, toggleFavorite } = useLibrary();
  const openShow = useOpenShow();

  const favorites = useMemo(() => library.filter((l) => l.status === 'watching').map((l) => l.showId), [library]);

  return <SeasonView favorites={favorites} onToggleFavorite={toggleFavorite} onAnimeSelect={openShow} />;
}
