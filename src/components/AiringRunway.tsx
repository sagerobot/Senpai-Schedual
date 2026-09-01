import { Check, ChevronLeft, ChevronRight, Play, Timer } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { displayTitle } from '../lib/displayTitle';
import { DUR, EASE_SWAP, SPRING_POP } from '../lib/motion';
import {
  CHIP_GAP,
  CHIP_PEEK,
  computeRunway,
  laneLayout,
  runwaySummary,
  shortTitle,
  type RunwayMoment,
  type RunwayShow,
} from '../lib/runway';
import { cn, describeCountdown, formatCountdown } from '../lib/utils';
import { pickWatchLink } from '../lib/watchLinks';
import { useUserData } from '../stores/userData';
import { AnimeMedia, EpisodeLog } from '../types';

interface AiringRunwayProps {
  animeList: AnimeMedia[];
  favorites: number[];
  /** Stacking show ids — runway material only on their finale. */
  stacking?: number[];
  logs: EpisodeLog[];
  onAnimeSelect?: (anime: AnimeMedia) => void;
}

/** Stable empty default — an inline `= []` would retrigger the tick effect. */
const NO_STACKING: number[] = [];

/** Live while something is on the runway; a lazy poll the rest of the day. */
const TICK_ACTIVE_MS = 1000;
const TICK_IDLE_MS = 30_000;

function formatAirTime(airingAt: number): string {
  return new Date(airingAt * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * "On the Runway" — the hour before your shows air, above Today's Drops.
 *
 * The strip is keyed to an airing *moment*, so three shows landing at 11:30
 * share one clock instead of rendering three identical ones. It has no skip:
 * before the episode exists, "skip" cannot say whether it means this queue or
 * tonight's drop, so skipping stays on the drop card where the episode
 * actually is (see src/lib/runway.ts for why the two never collide).
 *
 * At T-0 nothing coordinates the handoff: `latestAiredEpisode` already reads a
 * passed `airingAt` as aired, so the show drops out of here and `computeDrops`
 * admits it below on the same render.
 */
export function AiringRunway({
  animeList,
  favorites,
  stacking = NO_STACKING,
  logs,
  onAnimeSelect,
}: AiringRunwayProps) {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  // One interval for the whole strip — never one per show. It reads the clock
  // here and nowhere else, so CheckInFeed's drops memo (and its admission
  // pins, which re-read the clock when they recompute) stays untouched.
  const moments = computeRunway(animeList, favorites, logs, nowSec, stacking);
  const active = moments.length > 0;

  useEffect(() => {
    const id = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      active ? TICK_ACTIVE_MS : TICK_IDLE_MS,
    );
    return () => clearInterval(id);
  }, [active]);

  // The strip unmounts entirely when the hour is empty, which is also what
  // gives RunwayStrip a real element to measure the first time it renders.
  if (!active) return null;

  return <RunwayStrip moments={moments} nowSec={nowSec} onAnimeSelect={onAnimeSelect} />;
}

function RunwayStrip({
  moments,
  nowSec,
  onAnimeSelect,
}: {
  moments: RunwayMoment[];
  nowSec: number;
  onAnimeSelect?: (anime: AnimeMedia) => void;
}) {
  const reduceMotion = useReducedMotion();
  const laneRef = useRef<HTMLDivElement>(null);
  const [laneWidth, setLaneWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  // Which way the last press went, so the stagger runs from the edge the row
  // is leaving rather than always from the left.
  const forward = useRef(true);

  useLayoutEffect(() => {
    const el = laneRef.current;
    if (!el) return;
    setLaneWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => setLaneWidth(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const headline = moments[0];
  const remaining = Math.max(0, headline.airingAt - nowSec);
  const chips = moments.flatMap((moment) => moment.shows.map((show) => ({ show, moment })));

  const layout = laneLayout(laneWidth, chips.length);
  // Clamped in render rather than reconciled in an effect: a show leaving the
  // hour can shrink the list under the current offset at any tick.
  const at = Math.min(offset, layout.maxOffset);
  const step = layout.chipWidth + CHIP_GAP;
  // Once moved, the row sits a peek to the right of flush: that sliver of the
  // outgoing chip is what the back bubble covers, instead of the leading
  // chip's cover art.
  const shift = at > 0 ? CHIP_PEEK : 0;

  const advance = (direction: 1 | -1) => {
    forward.current = direction === 1;
    setOffset((current) => Math.min(Math.max(0, Math.min(current, layout.maxOffset) + direction), layout.maxOffset));
  };

  const summary = runwaySummary(moments, formatAirTime);
  const spoken =
    chips.length === 1
      ? `${displayTitle(chips[0].show.anime)} airs ${describeCountdown(remaining)}`
      : `${chips.length} shows air ${describeCountdown(remaining)}`;

  return (
    <section
      aria-label="Airing next"
      className="relative overflow-hidden rounded-card border border-warning-500/35 bg-gradient-to-b from-hero-drops-bg to-hero-drops-deep shadow-e3 shadow-glow-warning"
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-warning-400/45 to-transparent"
      />

      <div className="flex flex-col gap-5 p-5 md:flex-row md:items-stretch md:gap-6">
        <div className="flex shrink-0 flex-col justify-center gap-1.5 md:w-[254px]">
          <h2 className="flex items-center gap-2 font-display text-micro font-bold uppercase tracking-widest text-warning-400">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning-400 opacity-60 motion-reduce:animate-none" />
              <span className="relative m-[3px] inline-flex h-1 w-1 rounded-full bg-warning-300" />
            </span>
            On the runway
          </h2>

          <time
            dateTime={new Date(headline.airingAt * 1000).toISOString()}
            aria-live="off"
            className="font-mono text-5xl font-bold leading-none tracking-tighter md:text-6xl text-warning-300 tabular-nums"
          >
            {formatCountdown(remaining)}
          </time>
          <span className="sr-only">{spoken}</span>

          <p className="text-sm text-hero-text-mid">{summary}</p>
        </div>

        <span
          aria-hidden="true"
          className="hidden w-px shrink-0 bg-gradient-to-b from-transparent via-hero-drops-edge to-transparent md:block"
        />

        {/* The lane is overflow-hidden over a transformed row, not a scroll
            container: that is what structurally rules out a scrollbar and
            wheel scrolling, rather than suppressing them after the fact. */}
        <div ref={laneRef} className="relative min-w-0 flex-1">
          <div className="overflow-hidden">
            <div className="flex" style={{ gap: CHIP_GAP }}>
              {chips.map(({ show, moment }, index) => {
                const hidden = index < at || index >= at + layout.visible;
                const delayIndex = forward.current ? index : chips.length - 1 - index;
                return (
                  <motion.div
                    key={`${show.anime.id}-${show.episode}`}
                    className="shrink-0"
                    style={{ width: layout.chipWidth }}
                    animate={{ x: -at * step + shift }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : // The whole trick: chips nearest the edge the row is
                          // leaving start first and the incoming one lands
                          // last, so it travels like a hand of cards rather
                          // than a slab. Capped so a long row still settles
                          // inside one swap.
                          { duration: DUR.swap, ease: EASE_SWAP, delay: Math.min(delayIndex, 3) * 0.018 }
                    }
                    inert={hidden || undefined}
                  >
                    <RunwayChip
                      show={show}
                      width={layout.chipWidth}
                      showTime={moment.airingAt !== headline.airingAt}
                      onAnimeSelect={onAnimeSelect}
                    />
                  </motion.div>
                );
              })}
            </div>
          </div>

          <AnimatePresence>
            {layout.paginated && at > 0 && (
              <EdgeBubble key="back" side="start" onClick={() => advance(-1)} reduceMotion={!!reduceMotion} />
            )}
            {layout.paginated && at < layout.maxOffset && (
              <EdgeBubble key="next" side="end" onClick={() => advance(1)} reduceMotion={!!reduceMotion} />
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="h-1 overflow-hidden rounded-full bg-hero-drops-edge">
          <div
            className="h-full rounded-full bg-gradient-to-r from-warning-600 to-warning-400"
            style={{ width: `${Math.min(100, Math.max(0, (1 - remaining / 3600) * 100))}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-display text-micro font-bold uppercase tracking-widest text-hero-text-low">
            An hour ago
          </span>
          <span className="font-display text-micro font-bold uppercase tracking-widest text-warning-300">
            {formatAirTime(headline.airingAt)}
            {chips.length > 1 ? ' — they land' : ' — it lands'}
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * The edge control. It leaves rather than greying out: a disabled arrow is a
 * dead control asking to be pressed. It carries no count either — its being
 * there is the message, and a number is one more thing to read on a strip
 * meant for a glance.
 */
function EdgeBubble({
  side,
  onClick,
  reduceMotion,
}: {
  side: 'start' | 'end';
  onClick: () => void;
  reduceMotion: boolean;
}) {
  const Icon = side === 'start' ? ChevronLeft : ChevronRight;
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 w-24',
          side === 'start'
            ? '-left-3 bg-gradient-to-l from-transparent via-hero-drops-deep/85 to-hero-drops-deep'
            : '-right-3 bg-gradient-to-r from-transparent via-hero-drops-deep/85 to-hero-drops-deep',
        )}
      />
      <motion.button
        type="button"
        onClick={onClick}
        aria-label={side === 'start' ? 'Show earlier airings' : 'Show later airings'}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
        transition={{ duration: DUR.fast }}
        whileTap={reduceMotion ? undefined : { scale: 0.92 }}
        className={cn(
          'absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-warning-500/45 bg-hero-drops-well text-warning-300 shadow-e2 transition-colors hover:bg-hero-drops-well-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          side === 'start' ? '-left-3' : '-right-3',
        )}
      >
        <motion.span whileTap={reduceMotion ? undefined : { x: side === 'start' ? -2 : 2 }} transition={SPRING_POP}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden="true" />
        </motion.span>
      </motion.button>
    </>
  );
}

/**
 * Sizing tiers. Each one sheds a piece of information rather than squeezing
 * the same layout thinner — your average goes first (least urgent thing on a
 * chip about something that has not aired), then the studio, then the title
 * falls back to its short form.
 */
function tierFor(width: number) {
  if (width >= 700) return { cover: 'h-[88px] w-[62px]', title: 'text-lg', studio: true, average: true, cut: 60 };
  if (width >= 420) return { cover: 'h-[76px] w-[54px]', title: 'text-base', studio: true, average: false, cut: 40 };
  if (width >= 300) return { cover: 'h-[65px] w-[46px]', title: 'text-sm', studio: false, average: false, cut: 26 };
  return { cover: 'h-[57px] w-10', title: 'text-label', studio: false, average: false, cut: 22 };
}

const RunwayChip = memo(function RunwayChip({
  show,
  width,
  showTime,
  onAnimeSelect,
}: {
  show: RunwayShow;
  width: number;
  /** True when this chip belongs to a later moment than the headline clock. */
  showTime: boolean;
  onAnimeSelect?: (anime: AnimeMedia) => void;
}) {
  const { anime, episode, behindCount, nextEpisode, closable, finale } = show;
  const tier = tierFor(width);
  const full = displayTitle(anime);
  const title = shortTitle(full, tier.cut);
  const customSite = useUserData((s) => s.uiPrefs.customSource?.name);
  const watchLink = pickWatchLink(anime.externalLinks, customSite);
  const openShow = () => onAnimeSelect?.(anime);

  const meta = [
    `Ep. ${episode}${finale ? ' • finale' : ''}`,
    showTime ? formatAirTime(show.airingAt) : null,
    behindCount === 0 ? 'caught up' : behindCount === 1 ? 'one behind' : `${behindCount} behind`,
    tier.studio ? anime.studios?.nodes?.[0]?.name : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <div className="flex h-full items-center gap-3 rounded-inner border border-hero-drops-edge bg-hero-drops-bg p-2.5">
      <button
        type="button"
        onClick={openShow}
        aria-label={`Open ${full}`}
        className="shrink-0 overflow-hidden rounded-xs border border-warning-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img src={anime.coverImage.large} alt="" className={cn('object-cover', tier.cover)} />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <button
          type="button"
          onClick={openShow}
          className={cn(
            'truncate text-left font-bold leading-tight text-hero-text-hi transition-colors hover:text-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            tier.title,
          )}
        >
          {title}
        </button>

        <span className="truncate text-caption text-hero-text-low">{meta}</span>

        {behindCount === 0 ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-success-500/40 px-2 py-0.5 text-micro font-semibold text-success-300">
            <Check className="h-3 w-3" strokeWidth={2.6} aria-hidden="true" />
            Ready
          </span>
        ) : closable && watchLink ? (
          // Only a gap you can act on before it lands gets a button. Three
          // behind is not an offer, so that chip says where you are instead.
          <a
            href={watchLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 rounded-full border border-accent-600 px-2 py-0.5 text-micro font-medium text-accent-400 shadow-glow-sm transition-colors hover:bg-accent-600 hover:text-fg-inverse focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
            Catch up — Ep. {nextEpisode}
          </a>
        ) : (
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-hero-text-low/45 px-2 py-0.5 text-micro font-semibold text-hero-text-mid">
            <Timer className="h-3 w-3" aria-hidden="true" />
            Ep. {nextEpisode} next
          </span>
        )}
      </div>
    </div>
  );
});
