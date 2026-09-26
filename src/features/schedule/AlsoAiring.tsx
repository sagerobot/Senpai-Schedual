import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import {
  ALSO_AIRING_CARD_HEIGHT,
  ALSO_AIRING_CARD_WIDTH,
  ALSO_AIRING_CARD_WIDTH_NARROW,
  AlsoAiringCard,
  type AlsoAiringCardProps,
} from '../../components/AlsoAiringCard';
import { computePulse, type AlsoAiringEntry, type AlsoAiringRow } from '../../lib/alsoAiring';
import { DUR, EASE_SWAP } from '../../lib/motion';
import { cn } from '../../lib/utils';
import { useVibesIndex } from '../../queries/vibes';

const GAP = 16;
/** The R1 NOW divider's own width; it sits in the track like a card, gaps included. */
const DIVIDER_WIDTH = 20;
/** Horizontal travel that counts as a swipe rather than a tap. */
const SWIPE_PX = 40;
/** Card widths switch at Tailwind's `sm`, matching the card's own classes. */
const SM_QUERY = '(min-width: 640px)';

type Handlers = Pick<AlsoAiringCardProps, 'onOpen' | 'onLog' | 'onAdopt' | 'onPlan'>;

interface AlsoAiringProps extends Handlers {
  row: AlsoAiringRow;
}

/**
 * "Also Airing" — everything in the drop window that isn't one of your drops,
 * between Today's Drops and the Daily Schedule.
 *
 * One row that never wraps: an overflow-hidden viewport over a translated
 * track (the runway's principle — no scroll container, so no scrollbar and no
 * wheel scroll), paged by edge bubbles or a swipe. A NOW hairline splits what
 * has aired from what is still to come, and the row opens with it in view.
 */
export function AlsoAiring({ row, ...handlers }: AlsoAiringProps) {
  if (row.entries.length === 0) return null;
  return <AlsoAiringSection row={row} {...handlers} />;
}

function AlsoAiringSection({ row, onOpen, onLog, onAdopt, onPlan }: AlsoAiringProps) {
  const headingId = useId();
  // One stable handlers object, so a parent re-render doesn't re-render every card.
  const handlers = useMemo(() => ({ onOpen, onLog, onAdopt, onPlan }), [onOpen, onLog, onAdopt, onPlan]);
  const { entries, nowIndex } = row;
  const upcoming = entries.length - nowIndex;
  const subtitle = [
    `${entries.length} more show${entries.length === 1 ? '' : 's'} in your window`,
    upcoming > 0 ? `${upcoming} still to air` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={headingId} className="text-xl font-bold tracking-tight text-fg">
          Also Airing
        </h2>
        <span className="text-sm text-fg-muted">{subtitle}</span>
      </div>
      <div className="rounded-card border border-hero-drops-edge bg-hero-drops-deep px-4 py-3.5">
        <Pager row={row} handlers={handlers} />
      </div>
    </section>
  );
}

function useCardWidth(): number {
  const query = () =>
    typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? true : window.matchMedia(SM_QUERY).matches;
  const [wide, setWide] = useState(query);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(SM_QUERY);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);
  return wide ? ALSO_AIRING_CARD_WIDTH : ALSO_AIRING_CARD_WIDTH_NARROW;
}

function Pager({ row, handlers }: { row: AlsoAiringRow; handlers: Handlers }) {
  const { entries, nowIndex } = row;
  const reduceMotion = useReducedMotion();
  const cardWidth = useCardWidth();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(0);
  // null until the user pages: before that the row follows the NOW line.
  const [pagedStart, setPagedStart] = useState<number | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    setViewport(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((observed) => setViewport(observed[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hasDivider = nowIndex > 0 && nowIndex < entries.length;
  const step = cardWidth + GAP;
  const cardX = (i: number) => i * step + (hasDivider && i >= nowIndex ? DIVIDER_WIDTH + GAP : 0);
  const trackWidth = entries.length > 0 ? cardX(entries.length - 1) + cardWidth : 0;
  const maxTranslate = Math.max(0, trackWidth - viewport);
  const visible = Math.max(1, Math.floor((viewport + GAP) / step));

  // The last start index worth paging to: the first card at or past the point
  // where the track's right edge meets the viewport's.
  let maxStart = entries.length - 1;
  for (let i = 0; i < entries.length; i++) {
    if (cardX(i) >= maxTranslate) {
      maxStart = i;
      break;
    }
  }
  const clampStart = (s: number) => Math.min(Math.max(0, s), maxStart);
  const initialStart = clampStart(nowIndex - visible + 2);
  const start = clampStart(pagedStart ?? initialStart);
  const translate = Math.min(cardX(start), maxTranslate);

  const canBack = start > 0;
  const canForward = translate < maxTranslate;
  const pageBy = Math.max(1, visible - 1);
  const page = (direction: 1 | -1) => {
    if (direction === 1 && !canForward) return;
    if (direction === -1 && !canBack) return;
    setPagedStart(clampStart(start + direction * pageBy));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const from = swipe.current;
    swipe.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) page(dx < 0 ? 1 : -1);
  };

  const measured = viewport > 0;

  return (
    <div className="relative" style={{ height: ALSO_AIRING_CARD_HEIGHT }}>
      <div
        ref={viewportRef}
        className="h-full touch-pan-y overflow-hidden rounded-card"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        <motion.div
          data-testid="also-airing-track"
          className="flex h-full w-max items-stretch"
          style={{ gap: GAP }}
          animate={{ x: -translate }}
          transition={reduceMotion ? { duration: 0 } : { duration: DUR.swap, ease: EASE_SWAP }}
        >
          {entries.map((entry, i) => {
            const x = cardX(i);
            const offscreen = measured && (x + cardWidth <= translate || x >= translate + viewport);
            return (
              <FragmentWithDivider key={`${entry.anime.id}-${entry.episode}`} divider={hasDivider && i === nowIndex}>
                <div className="shrink-0" inert={offscreen || undefined}>
                  <CardSlot entry={entry} handlers={handlers} />
                </div>
              </FragmentWithDivider>
            );
          })}
        </motion.div>
      </div>

      {canBack && <EdgeBubble side="start" onClick={() => page(-1)} />}
      {canForward && <EdgeBubble side="end" onClick={() => page(1)} />}
    </div>
  );
}

function FragmentWithDivider({ divider, children }: { divider: boolean; children: ReactNode }) {
  return (
    <>
      {divider && <NowDivider />}
      {children}
    </>
  );
}

/** R1: an amber hairline with a NOW tag — amber is the app's time colour (docs §16). */
function NowDivider() {
  return (
    <div
      role="separator"
      aria-label="Now: shows after this have not aired yet"
      data-testid="also-airing-now"
      className="relative flex h-full shrink-0 justify-center"
      style={{ width: DIVIDER_WIDTH }}
    >
      <span className="absolute top-0 py-0.5 text-micro font-bold tracking-widest text-warning-400" aria-hidden="true">
        NOW
      </span>
      <span
        className="absolute bottom-0 top-[22px] w-px bg-gradient-to-b from-warning-400 to-warning-400/10"
        aria-hidden="true"
      />
    </div>
  );
}

const CardSlot = memo(function CardSlot({ entry, handlers }: { entry: AlsoAiringEntry; handlers: Handlers }) {
  const vibes = useVibesIndex();
  const upto = entry.aired ? entry.episode : entry.episode - 1;
  const pulse = useMemo(() => computePulse(entry.anime, upto, vibes), [entry.anime, upto, vibes]);
  return <AlsoAiringCard entry={entry} pulse={pulse} {...handlers} />;
});

function EdgeBubble({ side, onClick }: { side: 'start' | 'end'; onClick: () => void }) {
  const Icon = side === 'start' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'start' ? 'Earlier shows' : 'Later shows'}
      className={cn(
        'absolute top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-hero-drops-edge bg-hero-drops-well text-hero-text-hi shadow-e2 transition-colors hover:bg-hero-drops-well-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        side === 'start' ? '-left-[22px]' : '-right-[22px]',
      )}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden="true" />
    </button>
  );
}
