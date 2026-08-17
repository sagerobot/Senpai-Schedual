import { useEpisodeLog } from '../../hooks/useEpisodeLog';
import { useLibrary } from '../../hooks/useLibrary';
import { useScheduleContext } from '../../routes/scheduleContext';
import { useOpenShow } from '../../routes/showParam';
import { LibraryView } from './LibraryView';

export function LibraryRoute() {
  const { animeList, scheduleError, retrySchedule } = useScheduleContext();
  const { library, setLibraryBulk } = useLibrary();
  const { logs, setLogsBulk } = useEpisodeLog();
  const openShow = useOpenShow();

  return (
    <LibraryView
      library={library}
      logs={logs}
      animeList={animeList}
      onAnimeSelect={openShow}
      setLibraryBulk={setLibraryBulk}
      setLogsBulk={setLogsBulk}
      scheduleError={scheduleError}
      retrySchedule={retrySchedule}
    />
  );
}
