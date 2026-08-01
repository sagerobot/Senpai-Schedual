import { cn } from '../lib/utils';
import type { VibeEntry } from '../lib/vibesFile';

/** Sentiment is spelled out, never colour alone. */
const SENTIMENT = {
  positive: {
    label: 'Positive',
    flat: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    glass: 'border-emerald-400/40 bg-[#0a0c16]/80 text-emerald-200 backdrop-blur-md shadow-lg',
    dot: 'bg-emerald-400',
  },
  mixed: {
    label: 'Mixed',
    flat: 'border-pink-500/40 bg-pink-500/10 text-pink-300',
    glass: 'border-pink-400/40 bg-[#0a0c16]/80 text-pink-200 backdrop-blur-md shadow-lg',
    dot: 'bg-pink-400',
  },
  negative: {
    label: 'Negative',
    flat: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
    glass: 'border-rose-400/40 bg-[#0a0c16]/80 text-rose-200 backdrop-blur-md shadow-lg',
    dot: 'bg-rose-400',
  },
} as const;

function compactCount(value: number): string {
  if (value < 1000) return String(value);
  const thousands = value / 1000;
  return `${thousands < 10 ? thousands.toFixed(1) : Math.round(thousands)}k`;
}

/** Enough of the summary to be worth hovering, without a paragraph in a tooltip. */
function firstSentence(summary: string): string {
  const end = summary.search(/[.!?](\s|$)/);
  return end === -1 ? summary : summary.slice(0, end + 1);
}

export interface VibeChipProps {
  /** The remembered reading; `undefined` or `not_found` renders nothing. */
  vibe: VibeEntry | undefined;
  /** The show's display title, for the chip's accessible name. */
  showTitle: string;
  onOpen: () => void;
  /** `glass` sits on top of artwork, `flat` inside a card body. */
  variant?: 'flat' | 'glass';
  className?: string;
}

/**
 * The r/anime sentiment chip, shared by the rich Today's Drops banner and the
 * Catch-Up Queue cards. `EpisodeCard` draws its own copy inline; this exists so
 * the two restored designs cannot drift from each other or from the vocabulary
 * (Positive / Mixed / Negative + comment count, wording identical everywhere).
 *
 * An absent chip already says "no signal", so a missing or `not_found` entry
 * renders nothing rather than an empty state.
 */
export function VibeChip({ vibe, showTitle, onOpen, variant = 'flat', className }: VibeChipProps) {
  if (vibe === undefined || vibe.status !== 'found') return null;

  const tone = SENTIMENT[vibe.indicator];

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={firstSentence(vibe.summary)}
      aria-label={`Episode ${vibe.episode} community vibe: ${tone.label}${
        vibe.comments > 0 ? `, ${vibe.comments} comments` : ''
      }. Open ${showTitle}`}
      className={cn(
        'relative flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors',
        // The chip stays small so it cannot crowd the card, but the touch target
        // does not: the overlay gives it the 44px height the rest of the app's
        // controls have without taking that much room.
        "after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']",
        variant === 'glass' ? tone.glass : tone.flat,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden="true" />
      {tone.label}
      {vibe.comments > 0 && <span className="font-medium opacity-80">· {compactCount(vibe.comments)}</span>}
    </button>
  );
}
