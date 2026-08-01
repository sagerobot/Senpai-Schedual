import { useLibrary } from '../../hooks/useLibrary';
import { useOpenShow } from '../../routes/showParam';
import { ForYouView } from './ForYouView';

export function ForYouRoute() {
  const { library } = useLibrary();
  const openShow = useOpenShow();

  return <ForYouView library={library} onAnimeSelect={openShow} />;
}
