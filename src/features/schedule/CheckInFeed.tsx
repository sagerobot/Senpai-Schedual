import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { EpisodeCard } from '../../components/EpisodeCard';
import { pickWatchLink } from '../../lib/watchLinks';
import { useUserData } from '../../stores/userData';
import { AnimeMedia, EpisodeLog } from '../../types';

interface CheckInFeedProps {
  animeList: AnimeMedia[];
  favorites: number[];
  logs: EpisodeLog[];
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  /** @deprecated The bookmark uses LibraryStatusMenu; this prop is ignored. */
  onToggleFavorite?: (id: number) => void;
  onAnimeSelect?: (anime: AnimeMedia) => void;
}

/**
 * "Today's Drops": watching shows whose latest episode aired within the last
 * 24 hours and hasn't been logged yet. A thin container since PR 15 — the
 * eligibility heuristic lives here, the card is the shared EpisodeCard.
 */
export function CheckInFeed({ animeList, favorites, logs, onLog, onAnimeSelect }: CheckInFeedProps) {
  const drops = useMemo(() => {
    const recent: { anime: AnimeMedia; episode: number; airedAt: number; maxWatched: number; userAvgScore: number | null }[] = [];
    const now = Math.floor(Date.now() / 1000);

    for (const anime of animeList) {
      if (!favorites.includes(anime.id)) continue;

      if (anime.nextAiringEpisode && anime.nextAiringEpisode.episode > 1) {
        // Estimate previous episode air time (assume 7 days)
        const prevAirTime = anime.nextAiringEpisode.airingAt - 7 * 24 * 3600;
        const timeSinceAir = now - prevAirTime;

        // If it aired within the last 24 hours
        if (timeSinceAir >= 0 && timeSinceAir <= 24 * 3600) {
          const episodeNum = anime.nextAiringEpisode.episode - 1;
          const showLogs = logs.filter((l) => l.showId === anime.id);
          const log = showLogs.find((l) => l.episodeNumber === episodeNum);
          if (!log) {
            const maxWatched = showLogs.length > 0 ? Math.max(...showLogs.map((l) => l.episodeNumber)) : 0;
            const ratedLogs = showLogs.filter((l) => l.score !== null && l.score !== undefined);
            const userAvgScore =
              ratedLogs.length > 0 ? ratedLogs.reduce((acc, l) => acc + (l.score ?? 0), 0) / ratedLogs.length : null;
            recent.push({ anime, episode: episodeNum, airedAt: prevAirTime, maxWatched, userAvgScore });
          }
        }
      }
    }
    return recent.sort((a, b) => b.airedAt - a.airedAt);
  }, [animeList, favorites, logs]);

  // This surface's onLog arrives raw from schedule/route.tsx, so the undo
  // toast lives here — same pattern as watching/route.tsx (which already
  // toasts before its onLog reaches the Catch-Up Queue).
  const handleLog = useCallback(
    (showId: number, episodeNumber: number, score: number | null) => {
      onLog(showId, episodeNumber, score);
      toast(`Logged episode ${episodeNumber}`, {
        action: { label: 'Undo', onClick: () => useUserData.getState().unlogEpisode(showId, episodeNumber) },
      });
    },
    [onLog],
  );

  if (drops.length === 0) return null;

  return (
    <div className="mb-12">
      <h2 className="mb-6 flex items-center gap-3 text-xl font-bold tracking-tight text-white">
        <span className="relative flex h-4 w-4">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75"></span>
          <span className="relative inline-flex h-4 w-4 rounded-full bg-accent-500"></span>
        </span>
        Today's Drops
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <AnimatePresence>
          {drops.map((drop) => {
            const { anime, episode: todayEp, airedAt, maxWatched, userAvgScore } = drop;
            const isCaughtUp = maxWatched >= todayEp - 1;
            const nextEp = isCaughtUp ? todayEp : maxWatched + 1;
            const timeStr = new Date(airedAt * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const seasonMatch =
              anime.title.english?.match(/Season (\d+)/i) || anime.title.userPreferred?.match(/Season (\d+)/i);

            return (
              <motion.div
                key={`${anime.id}-${todayEp}`}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="h-full"
              >
                <EpisodeCard
                  anime={anime}
                  seasonLabel={seasonMatch ? `Season ${seasonMatch[1]}` : undefined}
                  badge={isCaughtUp ? 'caught-up' : 'behind'}
                  behindCount={isCaughtUp ? undefined : todayEp - maxWatched}
                  progress={{ watched: maxWatched, aired: todayEp }}
                  nextEpisodeToWatch={nextEp}
                  airsInfo={`Episode ${todayEp} aired today • ${timeStr}`}
                  userAvgScore={userAvgScore}
                  watchLink={pickWatchLink(anime.externalLinks)}
                  ctaLabel={isCaughtUp ? `Watch Episode ${todayEp}` : `Continue Episode ${nextEp}`}
                  onOpen={() => onAnimeSelect?.(anime)}
                  onLog={(ep, score) => handleLog(anime.id, ep, score)}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
