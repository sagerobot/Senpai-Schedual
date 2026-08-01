import { useState, useEffect } from 'react';
import { EpisodeLog } from '../types';

export function useEpisodeLog() {
  const [logs, setLogs] = useState<EpisodeLog[]>(() => {
    const saved = localStorage.getItem('anime_episode_logs');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('anime_episode_logs', JSON.stringify(logs));
  }, [logs]);

  const logEpisode = (showId: number, episodeNumber: number, score: number | null = null) => {
    setLogs(prev => {
      const existing = prev.findIndex(l => l.showId === showId && l.episodeNumber === episodeNumber);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], watchedAt: Date.now(), score };
        return next;
      }
      return [...prev, { showId, episodeNumber, watchedAt: Date.now(), score }];
    });
  };

  const unlogEpisode = (showId: number, episodeNumber: number) => {
    setLogs(prev => prev.filter(l => !(l.showId === showId && l.episodeNumber === episodeNumber)));
  };

  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anime_logs_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setLogsBulk = (newLogs: EpisodeLog[]) => {
    setLogs(prev => {
      // Merge, avoid exact duplicates (same showId and episodeNumber)
      const existingKeys = new Set(prev.map(l => `${l.showId}-${l.episodeNumber}`));
      const toAdd = newLogs.filter(l => !existingKeys.has(`${l.showId}-${l.episodeNumber}`));
      return [...prev, ...toAdd];
    });
  };

  return { logs, logEpisode, unlogEpisode, exportLogs, setLogsBulk };
}
