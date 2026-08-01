import { selectLogsArray, useUserData } from '../stores/userData';

/** Facade over the userData store; keeps the pre-store hook API. */
export function useEpisodeLog() {
  const logs = useUserData(selectLogsArray);
  const logEpisode = useUserData((s) => s.logEpisode);
  const unlogEpisode = useUserData((s) => s.unlogEpisode);
  const setLogsBulk = useUserData((s) => s.setLogsBulk);

  const exportLogs = () => {
    const current = selectLogsArray(useUserData.getState());
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anime_logs_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return { logs, logEpisode, unlogEpisode, exportLogs, setLogsBulk };
}
