import { useMemo } from 'react';
import { useLibrary } from '../../hooks/useLibrary';
import { useOpenShow } from '../../routes/showParam';
import { ForYouView } from './ForYouView';

export function ForYouRoute() {
  const { library, toggleFavorite } = useLibrary();
  const openShow = useOpenShow();

  const favorites = useMemo(() => library.filter((l) => l.status === 'watching').map((l) => l.showId), [library]);

  return (
    <ForYouView library={library} favorites={favorites} onToggleFavorite={toggleFavorite} onAnimeSelect={openShow} />
  );
}
