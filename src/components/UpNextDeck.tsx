import { Info, Play, Star, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo } from 'react';
import { LowScoreButtons } from './LowScoreButtons';
import { SwipeCell, useSwapSlots } from './SwipeCell';
import { displayTitle } from '../lib/displayTitle';
import { UpNextCandidate, UpNextReasonKind } from '../lib/upNext';
import { cn } from '../lib/utils';
import { pickWatchLink } from '../lib/watchLinks';
import { useUserData } from '../stores/userData';
import { AnimeMedia } from '../types';

interface UpNextDeckProps {
  candidates: UpNextCandidate[];
  /** Arrives pre-wrapped with the host's undo toast — no toasting here. */
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onSkip: (showId: number) => void;
  onAnimeSelect: (anime: AnimeMedia) => void;
}

const QUICK_SCORES = [5, 6, 7, 8, 9, 10];

/** One row on a wide screen, mirroring the Today's Drops grid. */
const DECK_SIZE = 4;

/** Reason chips share the drop cards' glassy pill grammar; never color-only. */
const REASON_CHIP: Record<UpNextReasonKind, { chip: string; dot: string }> = {
  'binge-ready': { chip: 'border-success-500/40 text-success-300', dot: 'bg-success-400' },
  'finish-line': { chip: 'border-success-500/40 text-success-300', dot: 'bg-success-400' },
  urgency: { chip: 'border-warning-500/40 text-warning-300', dot: 'bg-warning-400' },
  momentum: { chip: 'border-accent-500/40 text-accent-300', dot: 'bg-accent-400' },
  affinity: { chip: 'border-sent-mixed/40 text-sent-mixed-fg', dot: 'bg-sent-mixed' },
  backlog: { chip: 'border-hero-text-low/40 text-hero-text-mid', dot: 'bg-hero-text-mid' },
};

/**
 * The Up Next deck: the top ranked picks in the same grid rhythm as Today's
 * Drops (4-up on wide screens). "Not tonight" removes a card and the next
 * candidate deals into the row, so what's visible is always the deck's best
 * remaining reasons to press play.
 */
export function UpNextDeck({ candidates, onLog, onSkip, onAnimeSelect }: UpNextDeckProps) {
  const visible = candidates.slice(0, DECK_SIZE);
  const remaining = candidates.length - visible.length;

  // Sticky slots: a skipped card's slot is taken over by the next candidate
  // (SwipeCell's in-place gallery swipe) instead of the row re-flowing. Hook
  // runs before the empty return so the hook order is stable.
  const byKey = new Map(visible.map((c) => [`up-${c.anime.id}`, c]));
  const slots = useSwapSlots([...byKey.keys()]);

  if (candidates.length === 0) return null;

  return (
    <section aria-label="Up next for you" className="mb-12">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-fg">Up next for you</h2>
          <p className="mt-0.5 text-sm text-fg-muted">Ranked for right now · skips stick for tonight</p>
        </div>
        {remaining > 0 && (
          <span className="whitespace-nowrap pb-1 text-caption text-fg-faint">
            +{remaining} more in the deck
          </span>
        )}
      </div>

      {/* relative: popLayout absolutely positions exiting cells against this grid. */}
      <div className="relative grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <AnimatePresence mode="popLayout">
          {slots.map((slot) => (
            <SwipeCell key={slot.slotId} occupantKey={slot.key}>
              <UpNextCard
                candidate={byKey.get(slot.key)!}
                onLog={onLog}
                onSkip={onSkip}
                onAnimeSelect={onAnimeSelect}
              />
            </SwipeCell>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

/**
 * One deck card. Exported standalone so CheckInFeed can deal deck cards into
 * the Today's Drops grid (the merged row). Animation belongs to the hosting
 * SwipeCell, not the card. The art area grows, so next to the taller drop
 * cards the extra height becomes key art, not dead space.
 */
export const UpNextCard = memo(function UpNextCard({
  candidate,
  onLog,
  onSkip,
  onAnimeSelect,
}: {
  candidate: UpNextCandidate;
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onSkip: (showId: number) => void;
  onAnimeSelect: (anime: AnimeMedia) => void;
}) {
  const { anime, reason, nextEpisode, behindCount, airedCount, userAvgScore } = candidate;
  const customSite = useUserData((s) => s.uiPrefs.customSource?.name);

  const title = displayTitle(anime);
  const hasBanner = !!(anime.bannerImage || anime.trailer?.thumbnail);
  const bgImage =
    anime.bannerImage || anime.trailer?.thumbnail || anime.coverImage.extraLarge || anime.coverImage.large;
  const watchLink = pickWatchLink(anime.externalLinks, customSite);
  const watchedCount = Math.max(0, airedCount - behindCount);
  const progressPct = airedCount > 0 ? Math.min(100, (watchedCount / airedCount) * 100) : 0;
  const isBinge = reason.kind === 'binge-ready';
  const chipTone = REASON_CHIP[reason.kind];

  const seasonMatch =
    anime.title.english?.match(/Season (\d+)/i) || anime.title.userPreferred?.match(/Season (\d+)/i);
  const seasonText = seasonMatch ? `Season ${seasonMatch[1]}` : 'Series';
  const totalEpisodes = anime.episodes ?? '?';

  const openShow = () => onAnimeSelect(anime);

  return (
    <div
      className={cn(
        'group flex h-full flex-col rounded-card border bg-hero-drops-bg shadow-e3 transition-all',
        isBinge ? 'border-success-500/40 shadow-glow-success' : 'border-hero-drops-edge',
      )}
    >
      <div className="relative min-h-36 w-full grow overflow-hidden rounded-t-card bg-hero-drops-bg">
        <button
          type="button"
          onClick={openShow}
          aria-label={`Open ${title}`}
          className="absolute inset-0 flex items-center justify-center"
        >
          {hasBanner ? (
            <img
              src={bgImage}
              alt={`${title} key art`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <>
              <span className="absolute inset-0">
                <img src={bgImage} alt="" className="h-full w-full scale-110 object-cover opacity-40 blur-xl" />
              </span>
              <img
                src={bgImage}
                alt={`${title} cover`}
                className="relative h-full object-contain py-2 transition-transform duration-500 group-hover:scale-105"
              />
            </>
          )}
          {/* transform-gpu + srgb: the scrim must rasterize as its own layer with
              the plain gradient path, or GPUs draw seam lines through its alpha
              range while the swipe animates the subtree. */}
          <span
            className="pointer-events-none absolute -inset-1 top-0 transform-gpu will-change-transform bg-linear-to-t/srgb from-hero-drops-bg via-hero-drops-bg/50 to-transparent"
            aria-hidden="true"
          />
        </button>

        <div className="absolute left-3 top-3 z-20 max-w-[calc(100%-24px)]">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border bg-hero-drops-bg/80 px-2.5 py-1 text-caption font-semibold shadow-e2 backdrop-blur-md',
              chipTone.chip,
            )}
          >
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', chipTone.dot)} aria-hidden="true" />
            <span className="truncate">{reason.text}</span>
          </span>
        </div>
      </div>

      <div className="z-10 flex flex-col p-4">
        <h3 className="min-w-0">
          <button
            type="button"
            onClick={openShow}
            className="block max-w-full truncate text-left text-lg font-bold leading-tight text-hero-text-hi transition-colors hover:text-accent-400"
          >
            {title}
          </button>
        </h3>

        <div className="mb-1 mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="whitespace-nowrap rounded-full border border-hero-drops-edge bg-hero-drops-well px-2 py-0.5 text-caption text-hero-text-mid">
            {seasonText} • {watchedCount}/{totalEpisodes} watched
          </span>
          {userAvgScore !== null && (
            <span className="flex items-center gap-1 whitespace-nowrap rounded-full border border-accent-500/30 bg-hero-drops-accent-well px-2 py-0.5 text-caption font-semibold text-accent-300 shadow-glow-sm">
              <Star className="h-3 w-3 fill-accent-400 text-accent-400" aria-hidden="true" />
              Your Avg {userAvgScore.toFixed(1)}
            </span>
          )}
        </div>

        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-label text-hero-text-mid">Next: Episode {nextEpisode}</span>
          <span className="flex items-center gap-1.5 text-caption text-accent-400">
            <span
              className="h-1.5 w-1.5 rounded-full bg-accent-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"
              aria-hidden="true"
            />
            {behindCount === 1 ? '1 waiting' : `${behindCount} waiting`}
          </span>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-hero-drops-edge">
            <div className="h-full rounded-full bg-accent-600" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="whitespace-nowrap text-caption text-hero-text-mid">
            {watchedCount} / {airedCount}
          </span>
        </div>

        <div className="mb-2 flex items-center gap-2">
          <Zap className="h-4 w-4 fill-accent-500 text-accent-500" aria-hidden="true" />
          <span className="text-label font-medium text-hero-text-hi">Rate Episode {nextEpisode}</span>
        </div>
        <div
          role="group"
          aria-label={`Rate episode ${nextEpisode}, 5 to 10`}
          className="mb-2 flex w-full justify-between gap-1.5"
        >
          {QUICK_SCORES.map((s) => (
            <motion.button
              key={s}
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => onLog(anime.id, nextEpisode, s)}
              aria-label={`Rate episode ${nextEpisode} a ${s} and mark watched`}
              className="h-10 flex-1 rounded-field border border-hero-drops-edge bg-hero-drops-bg text-base font-medium text-hero-text-hi transition-all hover:border-accent-500 hover:bg-accent-600 hover:text-fg-inverse hover:shadow-glow"
            >
              {s}
            </motion.button>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => onLog(anime.id, nextEpisode, null)}
            aria-label={`Mark episode ${nextEpisode} watched without a score`}
            className="relative flex items-center gap-1.5 rounded-full border border-hero-drops-edge bg-hero-drops-well px-3 py-1 text-caption text-hero-text-mid transition-colors after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] hover:bg-hero-drops-well-hover hover:text-hero-text-hi"
          >
            Watched only <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <LowScoreButtons
            episode={nextEpisode}
            onSelect={(score) => onLog(anime.id, nextEpisode, score)}
            triggerClassName="px-3 py-1 rounded-full border border-hero-drops-edge bg-hero-drops-well text-caption text-hero-text-mid hover:bg-hero-drops-well-hover hover:text-hero-text-hi after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
            buttonClassName="h-7 min-w-7 px-1.5 rounded-xs border border-hero-drops-edge bg-hero-drops-well text-caption text-hero-text-mid hover:bg-hero-drops-well-hover hover:text-hero-text-hi"
          />
        </div>

        <div className="mt-auto">
          {watchLink ? (
            <a
              href={watchLink}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'flex h-11 w-full items-center justify-center gap-2 rounded-inner text-sm font-medium transition-all',
                isBinge
                  ? 'bg-success-600 text-fg-inverse hover:bg-success-500'
                  : 'border border-accent-600 bg-hero-drops-bg text-accent-400 shadow-glow hover:bg-accent-600 hover:text-fg-inverse hover:shadow-glow-lg',
              )}
            >
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              {isBinge ? 'Start the binge' : `Continue Episode ${nextEpisode}`}
            </a>
          ) : (
            <p className="flex h-11 w-full items-center justify-center rounded-inner bg-hero-drops-edge text-sm font-medium text-hero-text-mid">
              No stream linked
            </p>
          )}
          <button
            type="button"
            onClick={() => onSkip(anime.id)}
            className="mt-2 flex h-8 w-full items-center justify-center rounded-field text-caption font-medium text-hero-text-low transition-colors hover:bg-hero-drops-well hover:text-hero-text-mid"
          >
            Not tonight →
          </button>
        </div>
      </div>
    </div>
  );
});
