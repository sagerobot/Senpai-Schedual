import { useState, useEffect } from 'react';

export function useSimulcastOffsets() {
  const [offsets, setOffsets] = useState<Record<number, number>>(() => {
    const saved = localStorage.getItem('senpai_simulcast_offsets');
    if (saved) return JSON.parse(saved);
    return {};
  });

  useEffect(() => {
    localStorage.setItem('senpai_simulcast_offsets', JSON.stringify(offsets));
  }, [offsets]);

  const setOffset = (showId: number, offsetMinutes: number) => {
    setOffsets(prev => ({
      ...prev,
      [showId]: offsetMinutes
    }));
  };

  return { offsets, setOffset };
}
