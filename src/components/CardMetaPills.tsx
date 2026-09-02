import { Star } from 'lucide-react';
import type { ReactNode } from 'react';

interface CardMetaPillsProps {
  /** "Season 2 • 8/12 watched" — the left pill. */
  progress: ReactNode;
  /** The user's running average across logged episodes, or null before any. */
  userAvgScore: number | null;
}

/**
 * The header pills every hero card shares, right-aligned on their own row so
 * the title above keeps its full width and the pills land at the same spot
 * on every card in a row.
 */
export function CardMetaPills({ progress, userAvgScore }: CardMetaPillsProps) {
  return (
    <div className="mb-1 mt-1.5 flex h-6 items-center justify-end gap-1.5">
      <span className="whitespace-nowrap rounded-full border border-hero-drops-edge bg-hero-drops-well px-2 py-0.5 text-caption text-hero-text-mid">
        {progress}
      </span>
      {userAvgScore !== null && (
        <span className="flex items-center gap-1 whitespace-nowrap rounded-full border border-accent-500/30 bg-hero-drops-accent-well px-2 py-0.5 text-caption font-semibold text-accent-300 shadow-glow-sm">
          <Star className="h-3 w-3 fill-accent-400 text-accent-400" aria-hidden="true" />
          Your Avg {userAvgScore.toFixed(1)}
        </span>
      )}
    </div>
  );
}
