import { AnimeMedia } from '../types';
import { formatTimeUntil, cn } from '../lib/utils';
import { displayTitle } from '../lib/displayTitle';
import { Bookmark, Clock, PlayCircle, Star, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import React, { useState, useEffect } from 'react';
import { StatusBadge } from './StatusBadge';
import { WatchState } from '../lib/status';
import { LibraryStatusMenu } from './LibraryStatusMenu';

export type StatusPillType = WatchState;

interface AnimeCardProps {
  key?: React.Key;
  anime: AnimeMedia;
  showCountdown?: boolean;
  onClick?: (anime: AnimeMedia) => void;
  progress?: { watched: number; aired: number };
  statusPill?: StatusPillType;
  behindCount?: number;
  userScore?: number | null;
  titleOverride?: React.ReactNode;
}

export function AnimeCard({
  anime,
  showCountdown = true,
  onClick,
  progress,
  statusPill,
  behindCount,
  userScore,
  titleOverride
}: AnimeCardProps) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!anime.nextAiringEpisode) return;
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [anime.nextAiringEpisode]);

  const nextEp = anime.nextAiringEpisode;
  const timeUntil = nextEp ? nextEp.airingAt - now : null;

  const currentDay = new Date().getDay();
  const airingDay = nextEp ? new Date(nextEp.airingAt * 1000).getDay() : -1;
  
  // If the next episode is airing on the same day of the week as today, 
  // but it's more than a day away, it means the episode for *today* already aired.
  const alreadyAiredToday = currentDay === airingDay && timeUntil !== null && timeUntil > 24 * 60 * 60;
  
  const displayEpisode = nextEp ? (alreadyAiredToday ? Math.max(1, nextEp.episode - 1) : nextEp.episode) : null;

  // Format local airing time
  const localAiringTime = nextEp 
    ? new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(nextEp.airingAt * 1000))
    : 'Finished or Unknown';

  // Filter useful streaming links (Crunchyroll, Netflix, HiDive, Hulu, Amazon)
  const streamingSites = ['Crunchyroll', 'Netflix', 'HiDive', 'Hulu', 'Amazon', 'CustomSource'];
  const streamingLinks = anime.externalLinks.filter(link =>
    streamingSites.some(s => link.site.toLowerCase().includes(s.toLowerCase()))
  );

  const titleText = typeof titleOverride === 'string' ? titleOverride : displayTitle(anime);

  return (
    <motion.div 
      onClick={() => onClick?.(anime)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl bg-gray-900 shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl"
    >
      {/* Cover Image */}
      <div className="relative aspect-[3/4] w-full overflow-hidden">
        {/* The keyboard path into the card. Everything painted after it — the
            gradient, the title, the bookmark — sits on top, so a mouse click
            still lands on the container handler and never fires twice. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick?.(anime); }}
          aria-label={`Open ${titleText}`}
          className="absolute inset-0 focus:outline-none focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-400"
        />
        <img
          src={anime.coverImage.extraLarge || anime.coverImage.large}
          alt={displayTitle(anime)}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent" />
        
        {/* Top-left: Score & Status */}
        <div className="absolute right-3 bottom-14 z-10 flex flex-col gap-2 items-end">
          {userScore != null && (
            <div className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-yellow-400 backdrop-blur-md">
              <Star className="h-3 w-3 fill-current" />
              {userScore.toFixed(1)}
            </div>
          )}
          {statusPill && statusPill !== 'not-started' && (
            <StatusBadge state={statusPill} behindCount={behindCount} />
          )}
        </div>

        {/* Library Bookmark: add when absent, status menu when present */}
        <LibraryStatusMenu
          showId={anime.id}
          align="end"
          renderTrigger={({ inLibrary }) => (
            <button
              className={cn(
                "absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md transition-colors",
                inLibrary
                  ? "bg-accent-600 text-white"
                  : "bg-black/50 text-gray-300 hover:bg-black/80 hover:text-white"
              )}
            >
              <Bookmark className="h-5 w-5" fill={inLibrary ? "currentColor" : "none"} aria-hidden="true" />
            </button>
          )}
        />

        {/* Status / Countdown */}
        <div className="absolute bottom-0 left-0 w-full p-3 sm:p-4">
          <h3 className="line-clamp-2 text-base sm:text-lg font-bold leading-tight text-white" title={titleText}>
            {titleOverride || displayTitle(anime)}
          </h3>
          
          <div className="mt-1.5 sm:mt-2 flex items-center space-x-2 text-xs sm:text-sm text-gray-300">
            {nextEp ? (
              <div className="flex items-center space-x-1 font-mono text-purple-400">
                {alreadyAiredToday ? <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                <span>
                  Ep {displayEpisode} {alreadyAiredToday ? '• Aired' : (showCountdown ? `in ${formatTimeUntil(timeUntil || 0)}` : '')}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 text-gray-400">
                <span>{anime.status}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Details & Links */}
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        {progress && progress.aired > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>Progress</span>
              <span>{progress.watched} / {progress.aired}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
              <div 
                className={cn(
                  "h-full transition-all duration-500",
                  statusPill === 'caught-up' || statusPill === 'finished' ? "bg-emerald-500" : "bg-purple-500"
                )}
                style={{ width: `${Math.min(100, (progress.watched / progress.aired) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {nextEp && !progress && (
          <div className="mb-3 sm:mb-4 flex items-center text-xs sm:text-sm text-gray-400">
            <span className="rounded-md bg-gray-800 px-2 py-1 text-[10px] sm:text-xs text-gray-200">{localAiringTime}</span>
          </div>
        )}
        
        <div className="mt-auto">
          {streamingLinks.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {streamingLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center space-x-1 rounded-full bg-gray-800 px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                >
                  <PlayCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span>{link.site}</span>
                </a>
              ))}
            </div>
          ) : (
            <span className="text-[11px] sm:text-xs text-gray-400">No verified streams</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
