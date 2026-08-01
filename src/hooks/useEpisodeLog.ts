import { selectLogsArray, useUserData } from '../stores/userData';

/** Facade over the userData store; keeps the pre-store hook API. */
export function useEpisodeLog() {
  const logs = useUserData(selectLogsArray);
  const logEpisode = useUserData((s) => s.logEpisode);
  const unlogEpisode = useUserData((s) => s.unlogEpisode);
  const setLogsBulk = useUserData((s) => s.setLogsBulk);

  return { logs, logEpisode, unlogEpisode, setLogsBulk };
}
