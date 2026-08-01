import { Check } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { selectLogsArray, useUserData } from '../../stores/userData';
import type { AnimeMedia } from '../../types';

interface EpisodeTrackerProps {
  anime: AnimeMedia;
}

/**
 * The detail modal's episode strip, as real tracking: tap an episode to log
 * it, tap again to unlog. Every mutation gets an undo toast; logging ahead of
 * a gap additionally offers "Mark 1–N watched".
 */
export function EpisodeTracker({ anime }: EpisodeTrackerProps) {
  const logs = useUserData(selectLogsArray);
  const logEpisode = useUserData((s) => s.logEpisode);
  const unlogEpisode = useUserData((s) => s.unlogEpisode);
  const logEpisodesThrough = useUserData((s) => s.logEpisodesThrough);
  const setLogsBulk = useUserData((s) => s.setLogsBulk);

  // Total: the known episode count, else how many have aired, else one chip.
  const airedCount = anime.nextAiringEpisode ? anime.nextAiringEpisode.episode - 1 : null;
  const totalEpisodes = Math.max(1, anime.episodes ?? airedCount ?? 1);

  const showLogs = useMemo(() => logs.filter((log) => log.showId === anime.id), [logs, anime.id]);
  const watched = useMemo(() => new Set(showLogs.map((log) => log.episodeNumber)), [showLogs]);

  const watchedCount = useMemo(() => {
    let count = 0;
    for (let ep = 1; ep <= totalEpisodes; ep++) if (watched.has(ep)) count++;
    return count;
  }, [watched, totalEpisodes]);

  const missingThrough = (n: number): number[] => {
    const missing: number[] = [];
    for (let ep = 1; ep <= n; ep++) if (!watched.has(ep)) missing.push(ep);
    return missing;
  };

  // Scroll the first unwatched episode into view on open (the modal remounts
  // per show via key={id}, so mount is open).
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let firstUnwatched = totalEpisodes;
    for (let ep = 1; ep <= totalEpisodes; ep++) {
      if (!watched.has(ep)) {
        firstUnwatched = ep;
        break;
      }
    }
    const target = container.querySelector<HTMLElement>(`[data-episode="${firstUnwatched}"]`);
    if (!target) return;
    container.scrollLeft = Math.max(0, target.offsetLeft - container.clientWidth / 2 + target.clientWidth / 2);
    // Run once on open — later logging must not yank the strip around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTap = (ep: number) => {
    const existing = showLogs.find((log) => log.episodeNumber === ep);

    if (existing) {
      unlogEpisode(anime.id, ep);
      toast(`Episode ${ep} unlogged`, {
        // Restore the exact log — score and watch date included.
        action: { label: 'Undo', onClick: () => setLogsBulk([existing]) },
      });
      return;
    }

    logEpisode(anime.id, ep);
    const earlierUnwatched = missingThrough(ep - 1);

    if (earlierUnwatched.length === 0) {
      toast(`Episode ${ep} logged`, {
        action: { label: 'Undo', onClick: () => unlogEpisode(anime.id, ep) },
      });
      return;
    }

    toast(`Episode ${ep} logged`, {
      action: {
        label: `Mark 1–${ep} watched`,
        onClick: () => {
          logEpisodesThrough(anime.id, ep);
          toast(`Episodes 1–${ep} marked watched`, {
            action: {
              // Reverts the bulk action only; the tapped episode stays logged.
              label: 'Undo',
              onClick: () => {
                for (const missed of earlierUnwatched) unlogEpisode(anime.id, missed);
              },
            },
          });
        },
      },
      cancel: { label: 'Undo', onClick: () => unlogEpisode(anime.id, ep) },
    });
  };

  const canMarkAll = anime.status === 'FINISHED' && anime.episodes !== null;

  const handleMarkAll = () => {
    const missing = missingThrough(totalEpisodes);
    if (missing.length === 0) return;
    logEpisodesThrough(anime.id, totalEpisodes);
    toast(`All ${totalEpisodes} episodes marked watched`, {
      action: {
        label: 'Undo',
        onClick: () => {
          for (const missed of missing) unlogEpisode(anime.id, missed);
        },
      },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-medium text-gray-300">Episodes</h3>
          <span className="text-xs text-gray-500">
            {watchedCount} / {totalEpisodes} watched
          </span>
        </div>
        {canMarkAll && (
          <button
            onClick={handleMarkAll}
            disabled={watchedCount >= totalEpisodes}
            className="text-xs font-medium text-accent-400 transition-colors hover:text-accent-300 disabled:cursor-default disabled:text-gray-600"
          >
            Mark all watched
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {Array.from({ length: totalEpisodes }, (_, i) => i + 1).map((ep) => {
          const isWatched = watched.has(ep);
          return (
            <button
              key={ep}
              data-episode={ep}
              onClick={() => handleTap(ep)}
              aria-pressed={isWatched}
              aria-label={isWatched ? `Episode ${ep}, watched` : `Episode ${ep}, not watched`}
              className={cn(
                'flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors',
                isWatched
                  ? 'bg-accent-600 text-white hover:bg-accent-500'
                  : 'bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-white',
              )}
            >
              {isWatched && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              {ep}
            </button>
          );
        })}
      </div>
    </div>
  );
}
