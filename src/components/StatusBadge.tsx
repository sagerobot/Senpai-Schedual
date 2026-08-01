import { Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { WatchState, WATCH_STATE_LABELS, WATCH_STATE_CLASSES } from '../lib/status';

interface StatusBadgeProps {
  state: WatchState;
  /** Shown instead of the plain label for the "behind" state, e.g. "3 behind". */
  behindCount?: number;
  className?: string;
}

export function StatusBadge({ state, behindCount, className }: StatusBadgeProps) {
  const label =
    state === 'behind' && behindCount != null && behindCount > 0
      ? `${behindCount} behind`
      : WATCH_STATE_LABELS[state];

  return (
    <div
      className={cn(
        'rounded-full border px-2 py-1 text-[10px] font-semibold backdrop-blur-md flex items-center gap-1',
        WATCH_STATE_CLASSES[state],
        className
      )}
    >
      {state === 'airing-soon' && <Clock className="h-3 w-3" />}
      {label}
    </div>
  );
}
