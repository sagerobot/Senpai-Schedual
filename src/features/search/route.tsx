import { useMemo } from 'react';
import { useLibrary } from '../../hooks/useLibrary';
import { useOpenShow } from '../../routes/showParam';
import { SearchView } from './SearchView';

/** Renders immediately — search never waits on the season fetch. */
export function SearchRoute() {
  const { library, toggleFavorite } = useLibrary();
  const openShow = useOpenShow();

  const favorites = useMemo(() => library.filter((l) => l.status === 'watching').map((l) => l.showId), [library]);

  return <SearchView favorites={favorites} onToggleFavorite={toggleFavorite} onAnimeSelect={openShow} />;
}
