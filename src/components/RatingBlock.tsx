import { Info, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { LowScoreButtons } from './LowScoreButtons';
import { cn } from '../lib/utils';

const QUICK_SCORES = [5, 6, 7, 8, 9, 10];

interface RatingBlockProps {
  /** The episode being rated; drives every accessible name. */
  episode: number;
  /** `null` = mark watched without a score. */
  onRate: (score: number | null) => void;
  /** Header content; defaults to "Rate Episode N". Pass a Ticker to animate. */
  label?: ReactNode;
  /** Hover tint for the score buttons — success marks a finale. */
  tone?: 'accent' | 'success';
  /** Hint line under the row; the deck omits it to stay compact. */
  hint?: string;
  className?: string;
}

/**
 * The one quick-rating control shared by the hero cards.
 *
 * Header left, six score buttons on a fixed 6-column grid, then the "Watched
 * only" and "0-4" escape hatches centred beneath. Every card that shows this
 * block draws the same geometry so the rows line up across a card row — what
 * differs between cards is what sits above it, never the block itself.
 */
export function RatingBlock({ episode, onRate, label, tone = 'accent', hint, className }: RatingBlockProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      <div className="mb-2 flex items-center gap-2">
        <Zap className="h-4 w-4 fill-accent-500 text-accent-500" aria-hidden="true" />
        <span className="text-label font-medium text-hero-text-hi">{label ?? `Rate Episode ${episode}`}</span>
      </div>

      <div role="group" aria-label={`Rate episode ${episode}, 5 to 10`} className="mb-2 grid grid-cols-6 gap-2">
        {QUICK_SCORES.map((s) => (
          <motion.button
            key={s}
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={() => onRate(s)}
            aria-label={`Rate episode ${episode} a ${s} and mark watched`}
            className={cn(
              'h-11 rounded-field border border-hero-drops-edge bg-hero-drops-bg text-base font-medium text-hero-text-hi transition-all hover:text-fg-inverse focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tone === 'success'
                ? 'hover:border-success-500 hover:bg-success-600 hover:shadow-glow-success'
                : 'hover:border-accent-500 hover:bg-accent-600 hover:shadow-glow',
            )}
          >
            {s}
          </motion.button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => onRate(null)}
          aria-label={`Mark episode ${episode} watched without a score`}
          className="relative flex items-center gap-1.5 rounded-full border border-hero-drops-edge bg-hero-drops-well px-3 py-1 text-caption text-hero-text-mid transition-colors after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] hover:bg-hero-drops-well-hover hover:text-hero-text-hi focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Watched only <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <LowScoreButtons
          episode={episode}
          onSelect={onRate}
          triggerClassName="px-3 py-1 rounded-full border border-hero-drops-edge bg-hero-drops-well text-caption text-hero-text-mid hover:bg-hero-drops-well-hover hover:text-hero-text-hi after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
          buttonClassName="h-7 min-w-7 px-1.5 rounded-xs border border-hero-drops-edge bg-hero-drops-well text-caption text-hero-text-mid hover:bg-hero-drops-well-hover hover:text-hero-text-hi"
        />
      </div>

      {hint && <div className="mt-2 text-center text-micro text-hero-text-low sm:text-caption">{hint}</div>}
    </div>
  );
}
