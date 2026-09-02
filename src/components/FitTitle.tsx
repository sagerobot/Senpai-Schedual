import { useRef, type ReactNode } from 'react';
import { useFitText } from '../hooks/useFitText';
import { cn } from '../lib/utils';

/** Card title type: 20px bold at rest, the design language's `title` step. */
const TITLE_MAX_PX = 20;
/** Floor. Two lines of 20px hold three lines of 12px, so it is rarely reached. */
const TITLE_MIN_PX = 12;
const TITLE_LINE_HEIGHT = 1.25;
/** The slot: exactly two lines at the resting size. Every card reserves it. */
const TITLE_LINES = 2;

interface FitTitleProps {
  title: string;
  onClick: () => void;
  /** Applied to the button — colour, hover and focus treatment per surface. */
  className?: string;
  /** Slot height in lines; the deck and drops share the default. */
  lines?: number;
  /** Resting size; the slot is `lines` of this. Denser cards pass a smaller one. */
  maxPx?: number;
  minPx?: number;
  children?: ReactNode;
}

/**
 * A card title that keeps the whole name and never grows the card.
 *
 * Anime names run from "Frieren" to seventy-plus characters, and a card row
 * only lines up when every header ends at the same y. So the title owns a
 * fixed slot — two lines at 20px — and shrinks its font until the full name
 * fits inside it (`useFitText`). No ellipsis, no clamp: a long name gets
 * smaller, a short one sits on the first line and leaves the second empty.
 * If a name overflows even at the floor size, the slot grows to hold it.
 */
export function FitTitle({
  title,
  onClick,
  className,
  lines = TITLE_LINES,
  maxPx = TITLE_MAX_PX,
  minPx = TITLE_MIN_PX,
  children,
}: FitTitleProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const slotPx = lines * TITLE_LINE_HEIGHT * maxPx;
  const { fontSize, overflows } = useFitText(ref, inner, title, minPx, maxPx, slotPx);
  // The slot is fixed so card rows line up; only a name that overflows even at
  // the floor size is allowed to grow it — never clipped.
  const minHeight = `${slotPx}px`;
  const slotHeight = overflows ? undefined : minHeight;

  return (
    <h3 className="min-w-0" style={{ height: slotHeight, minHeight }}>
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={cn(
          'block w-full text-left font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        style={{ height: slotHeight, minHeight, fontSize: `${fontSize}px`, lineHeight: TITLE_LINE_HEIGHT }}
      >
        {/* block, not inline: ResizeObserver ignores inline boxes. */}
        <span ref={inner} className="block">
          {children ?? title}
        </span>
      </button>
    </h3>
  );
}
