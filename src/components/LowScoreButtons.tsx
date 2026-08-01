import { ChevronDown, ChevronUp } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '../lib/utils';

const LOW_SCORES = [4, 3, 2, 1, 0];

export interface LowScoreButtonsProps {
  /** The episode the scores apply to; only used for the accessible names. */
  episode: number;
  onSelect: (score: number) => void;
  triggerClassName?: string;
  /** Styles each small score button when expanded. */
  buttonClassName?: string;
}

/**
 * The "0-4" escape hatch that sits beside a quick 5-10 rating row.
 *
 * Both rich card designs put six large buttons where they matter and tuck the
 * bottom half of the scale behind this. Tapping "0-4" expands it IN PLACE into
 * five small buttons (no floating menu — nothing to clip, nothing to dismiss);
 * picking a score logs it and collapses the row again. Parents should allow
 * flex-wrap so the expanded row can break to its own line in narrow cards.
 */
export function LowScoreButtons({ episode, onSelect, triggerClassName, buttonClassName }: LowScoreButtonsProps) {
  const [open, setOpen] = useState(false);
  const groupId = useId();

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-expanded={false}
        aria-controls={groupId}
        aria-label={`Show scores 0 to 4 for episode ${episode}`}
        className={cn('relative flex items-center justify-center gap-1 transition-colors', triggerClassName)}
      >
        0-4 <ChevronDown className="w-3 h-3" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      id={groupId}
      role="group"
      aria-label={`Scores 0 to 4 for episode ${episode}`}
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      {LOW_SCORES.map((score) => (
        <button
          key={score}
          type="button"
          onClick={() => {
            onSelect(score);
            setOpen(false);
          }}
          aria-label={`Rate episode ${episode} a ${score} and mark watched`}
          className={cn(
            "relative flex items-center justify-center transition-colors after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']",
            buttonClassName,
          )}
        >
          {score}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-expanded={true}
        aria-controls={groupId}
        aria-label="Hide the 0 to 4 scores"
        className={cn(
          "relative flex items-center justify-center transition-colors after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']",
          buttonClassName,
        )}
      >
        <ChevronUp className="w-3 h-3" aria-hidden="true" />
      </button>
    </div>
  );
}
