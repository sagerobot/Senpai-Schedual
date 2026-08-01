import { useOpenShow } from '../../routes/showParam';
import { SeasonView } from './SeasonView';

/**
 * Renders immediately: the view owns its own season query, which for the
 * current season falls back to the schedule cache, so it never waits on the shell.
 */
export function SeasonRoute() {
  const openShow = useOpenShow();

  return <SeasonView onAnimeSelect={openShow} />;
}
