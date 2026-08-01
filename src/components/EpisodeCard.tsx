import { Bookmark, Play, Star, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { displayTitle } from '../lib/displayTitle';
import type { WatchState } from '../lib/status';
import { cn } from '../lib/utils';
import type { AnimeMedia } from '../types';
import { LibraryStatusMenu } from './LibraryStatusMenu';
import { StatusBadge } from './StatusBadge';

export interface EpisodeCardProps {
  anime: AnimeMedia;
  /** Rendered as the card title; defaults to the show's display title. */
  titleNode?: ReactNode;
  /** Real season label (from the series graph), rendered as a chip. */
  seasonLabel?: string;
  badge?: WatchState;
  /** Shown inside the "behind" badge, e.g. "3 behind". */
  behindCount?: number;
  /** The one progress visualization: a linear bar plus "x / y" text. */
  progress: { watched: number; aired: number };
  /** When set (and onLog given), the rate/log action row renders for this episode. */
  nextEpisodeToWatch?: number;
  /** One-line meta text, e.g. "Episode 8 aired today • 5:30 PM". */
  airsInfo?: string;
  /** The viewer's average episode score for this show. */
  userAvgScore?: number | null;
  watchLink?: string;
  ctaLabel?: string;
  onOpen: () => void;
  onLog?: (episodeNumber: number, score: number | null) => void;
  className?: string;
}

const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * The one horizontal media card (PR 15). Today's Drops and both Catch-Up Queue
 * render paths all draw this — cover, title, StatusBadge, a single linear
 * progress bar, and one action row (0–10 rate chips, "Watched only", watch CTA).
 *
 * Toasts are the caller's job: `onLog` receives `(episode, score|null)` and the
 * surface that owns the log action wraps it with its own undo toast, so this
 * card never double-toasts.
 */
export function EpisodeCard({
  anime,
  titleNode,
  seasonLabel,
  badge,
  behindCount,
  progress,
  nextEpisodeToWatch,
  airsInfo,
  userAvgScore,
  watchLink,
  ctaLabel,
  onOpen,
  onLog,
  className,
}: EpisodeCardProps) {
  const titleText = displayTitle(anime);
  const cover = anime.coverImage.extraLarge ?? anime.coverImage.large;
  const pct = progress.aired > 0 ? Math.min(100, Math.max(0, (progress.watched / progress.aired) * 100)) : 0;

  const actionRow =
    nextEpisodeToWatch !== undefined && onLog !== undefined ? (
      <div className="mt-auto space-y-2.5 border-t border-edge p-4 pt-3">
        <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-accent-300">
          <Zap className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          Rate Ep {nextEpisodeToWatch}
        </div>

        <div role="group" aria-label={`Rate episode ${nextEpisodeToWatch}, 0 to 10`} className="grid grid-cols-6 gap-1.5">
          {SCORES.map((score) => (
            <button
              key={score}
              type="button"
              onClick={() => onLog(nextEpisodeToWatch, score)}
              aria-label={`Rate episode ${nextEpisodeToWatch} a ${score} and mark watched`}
              className="flex h-11 items-center justify-center rounded-lg bg-surface-2 text-sm font-semibold text-gray-400 transition-colors hover:bg-accent-600 hover:text-white"
            >
              {score}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onLog(nextEpisodeToWatch, null)}
            aria-label={`Mark episode ${nextEpisodeToWatch} watched without a score`}
            className="flex h-11 shrink-0 items-center justify-center rounded-lg border border-edge bg-surface-2 px-3 text-xs font-semibold text-gray-400 transition-colors hover:bg-surface-3 hover:text-white"
          >
            Watched only
          </button>
          {watchLink && (
            <a
              href={watchLink}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-accent-600 text-sm font-semibold text-white transition-colors hover:bg-accent-500"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              <span className="line-clamp-1">{ctaLabel ?? `Continue Ep ${nextEpisodeToWatch}`}</span>
            </a>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className={cn('flex h-full flex-col overflow-hidden rounded-2xl border border-edge bg-surface-1 shadow-xl', className)}>
      <div className="flex gap-4 p-4">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${titleText}`}
          className="group relative h-[104px] w-[72px] shrink-0 overflow-hidden rounded-xl"
        >
          <img
            src={cover}
            alt={`${titleText} cover`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <button type="button" onClick={onOpen} className="block max-w-full text-left">
                <span className="line-clamp-2 text-sm font-bold leading-snug text-gray-100 transition-colors hover:text-accent-300">
                  {titleNode ?? titleText}
                </span>
              </button>
              {seasonLabel && (
                <span className="mt-1 inline-block rounded border border-accent-500/30 bg-accent-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-300">
                  {seasonLabel}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {badge && <StatusBadge state={badge} behindCount={behindCount} />}
              <LibraryStatusMenu
                showId={anime.id}
                align="end"
                renderTrigger={({ inLibrary }) => (
                  <button
                    type="button"
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border transition-colors',
                      inLibrary
                        ? 'border-accent-500/50 bg-accent-600/90 text-white'
                        : 'border-edge bg-surface-2 text-gray-400 hover:text-white',
                    )}
                  >
                    <Bookmark className="h-4 w-4" fill={inLibrary ? 'currentColor' : 'none'} aria-hidden="true" />
                  </button>
                )}
              />
            </div>
          </div>

          <div className="mt-auto flex items-center gap-2">
            <div
              role="progressbar"
              aria-label={`${progress.watched} of ${progress.aired} episodes watched`}
              aria-valuemin={0}
              aria-valuemax={progress.aired}
              aria-valuenow={progress.watched}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"
            >
              <div className="h-full rounded-full bg-accent-500 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-gray-400">
              {progress.watched} / {progress.aired}
            </span>
          </div>

          {(airsInfo || userAvgScore != null) && (
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              {airsInfo && <span className="line-clamp-1">{airsInfo}</span>}
              {userAvgScore != null && (
                <span className="ml-auto flex shrink-0 items-center gap-1 font-semibold text-accent-300">
                  <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                  {userAvgScore.toFixed(1)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {actionRow}
    </div>
  );
}
