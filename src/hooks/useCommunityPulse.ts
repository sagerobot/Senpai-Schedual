import { useState, useEffect } from 'react';

interface VibeCheck {
  upvotes: number;
  comments: number;
  url: string;
  summary: string;
  goods?: string[];
  bads?: string[];
  indicator?: 'positive' | 'mixed' | 'negative';
}

export function useCommunityPulse(title: string, episodeNumber: number, showId: number) {
  const [pulse, setPulse] = useState<VibeCheck | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPulse = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const vibeRes = await fetch('/api/community-vibe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId, episodeNumber, title, forceRefresh })
      });
      
      if (!vibeRes.ok) {
        throw new Error("Failed to fetch vibe check");
      }
      
      const vibeData = await vibeRes.json();
      
      if (vibeData.url) {
        setPulse({
          upvotes: vibeData.upvotes,
          comments: vibeData.comments,
          url: vibeData.url,
          summary: vibeData.summary,
          goods: vibeData.goods,
          bads: vibeData.bads,
          indicator: vibeData.indicator
        });
      } else {
        setPulse(null);
      }
    } catch (err) {
      console.error("Failed to fetch community pulse", err);
      setPulse(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPulse();
  }, [title, episodeNumber, showId]);

  return { pulse, loading, refresh: () => fetchPulse(true) };
}
