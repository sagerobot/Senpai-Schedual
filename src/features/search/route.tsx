import { useOpenShow } from '../../routes/showParam';
import { SearchView } from './SearchView';

/** Renders immediately — search never waits on the season fetch. */
export function SearchRoute() {
  const openShow = useOpenShow();

  return <SearchView onAnimeSelect={openShow} />;
}
