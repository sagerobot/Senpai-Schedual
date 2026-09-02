import { CornerDownRight, Play } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { memo } from 'react';
import { CardMetaPills } from './CardMetaPills';
import { FitTitle } from './FitTitle';
import { RatingBlock } from './RatingBlock';
import { SwipeCell, useSwapSlots } from './SwipeCell';
import { displayTitle } from '../lib/displayTitle';
import { UpNextCandidate, UpNextReasonKind, UpNextSeries } from '../lib/upNext';
import { cn } from '../lib/utils';
import { pickWatchLink } from '../lib/watchLinks';
import { watchCta } from '../lib/watchCta';
import { useUserData } from '../stores/userData';
import { AnimeMedia } from '../types';

interface UpNextDeckProps {
  candidates: UpNextCandidate[];
  /** Arrives pre-wrapped with the host's undo toast — no toasting here. */
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onSkip: (showId: number) => void;
  onAnimeSelect: (anime: AnimeMedia) => void;
}

/** "Then Season 2 · 12 waiting", or "Then Season 2, Season 3 · 24 waiting". */
function queuedSeasonsText(then: UpNextSeries['then']): string {
  const labels = then.map((q) => q.seasonLabel).join(', ');
  const waiting = then.reduce((sum, q) => sum + q.behindCount, 0);
  return `Then ${labels} · ${waiting} waiting`;
}

/** One row on a wide screen, mirroring the Today's Drops grid. */
const DECK_SIZE = 4;

/** Reason chips share the drop cards' glassy pill grammar; never color-only. */
const REASON_CHIP: Record<UpNextReasonKind, { chip: string; dot: string }> = {
  'binge-ready': { chip: 'border-success-500/40 text-success-300', dot: 'bg-success-400' },
  'skipped-drop': { chip: 'border-accent-500/40 text-accent-300', dot: 'bg-accent-400' },
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
          {/* Scoped to the deck's own skip: drop-card "Skip this week" cards
              land here with a week-long life of their own. */}
          <p className="mt-0.5 text-sm text-fg-muted">Ranked for right now · “Not tonight” sticks for tonight</p>
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
  const { anime, reason, nextEpisode, behindCount, airedCount, userAvgScore, series } = candidate;
  const customSite = useUserData((s) => s.uiPrefs.customSource?.name);

  // A franchise card is titled by the franchise; the season pill says which
  // season is up. A lone card keeps the show's own title.
  const title = series ? series.title : displayTitle(anime);
  const hasBanner = !!(anime.bannerImage || anime.trailer?.thumbnail);
  const bgImage =
    anime.bannerImage || anime.trailer?.thumbnail || anime.coverImage.extraLarge || anime.coverImage.large;
  const watchLink = pickWatchLink(anime.externalLinks, customSite);
  const watchedCount = Math.max(0, airedCount - behindCount);
  const progressPct = airedCount > 0 ? Math.min(100, (watchedCount / airedCount) * 100) : 0;
  // The rank (chip, frame, CTA tone) may come from a later season of the
  // franchise; the CTA's wording is about the lead, whose reason is its own.
  const isBinge = reason.kind === 'binge-ready';
  const leadIsBinge = (series?.leadReason ?? reason).kind === 'binge-ready';
  const chipTone = REASON_CHIP[reason.kind];

  const seasonMatch =
    anime.title.english?.match(/Season (\d+)/i) || anime.title.userPreferred?.match(/Season (\d+)/i);
  const seasonText = series ? series.seasonLabel : seasonMatch ? `Season ${seasonMatch[1]}` : 'Series';
  const totalEpisodes = anime.episodes ?? '?';
  const thenText = series ? queuedSeasonsText(series.then) : null;

  const openShow = () => onAnimeSelect(anime);

  return (
    <div
      className={cn(
        'group flex h-full flex-col rounded-card border bg-hero-drops-bg shadow-e3 transition-all',
        isBinge ? 'border-success-500/40 shadow-glow-success' : 'border-hero-drops-edge',
      )}
    >
      {/* Same banner height and body padding as a drops card, so the two share
          a header line when the deck completes the drops row; the slack goes
          above the CTA, which bottom-anchors on both. */}
      <div className="relative h-48 w-full shrink-0 overflow-hidden rounded-t-card bg-hero-drops-bg sm:h-52">
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

      <div className="z-10 flex flex-1 flex-col p-4 sm:p-5">
        <FitTitle title={title} onClick={openShow} className="text-hero-text-hi hover:text-accent-400" />
        <CardMetaPills progress={`${seasonText} • ${watchedCount}/${totalEpisodes} watched`} userAvgScore={userAvgScore} />

        {/* Two rows, the same footprint as a drops card's "Episode N" line and
            info line, so the rating block below starts on the same y when the
            deck completes the drops row. The progress bar shares the second
            row with any queued-season note instead of taking its own. */}
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-label text-hero-text-mid">Next: Episode {nextEpisode}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-caption text-accent-400">
            <span
              className="h-1.5 w-1.5 rounded-full bg-accent-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"
              aria-hidden="true"
            />
            {behindCount === 1 ? '1 waiting' : `${behindCount} waiting`}
          </span>
        </div>

        <div className="mb-5 flex items-center gap-3 text-micro text-hero-text-low sm:text-caption">
          {thenText && (
            <span className="flex min-w-0 shrink items-center gap-1 text-hero-text-mid">
              <CornerDownRight className="h-3 w-3 shrink-0 text-hero-text-low" aria-hidden="true" />
              <span className="truncate">{thenText}</span>
            </span>
          )}
          <div className="h-[5px] min-w-16 flex-1 overflow-hidden rounded-full bg-hero-drops-edge">
            <div className="h-full rounded-full bg-accent-600" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="whitespace-nowrap">
            {watchedCount} / {airedCount}
          </span>
        </div>

        <RatingBlock
          episode={nextEpisode}
          onRate={(score) => onLog(anime.id, nextEpisode, score)}
          className="mb-4"
        />

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
              {leadIsBinge
                ? 'Start the binge'
                : watchCta({ episode: nextEpisode, started: watchedCount > 0, seasonLabel: series?.seasonLabel })}
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
