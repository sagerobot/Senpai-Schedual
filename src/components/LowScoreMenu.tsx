import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

const LOW_SCORES = [4, 3, 2, 1, 0];

export interface LowScoreMenuProps {
  /** The episode the scores apply to; only used for the accessible names. */
  episode: number;
  onSelect: (score: number) => void;
  triggerClassName?: string;
  menuClassName?: string;
  itemClassName?: string;
}

/**
 * The "0-4" escape hatch that sits beside a quick 5-10 rating row.
 *
 * Both rich card designs put six large buttons where they matter and hide the
 * bottom half of the scale behind this, so a 2/10 is still one tap away without
 * eleven cramped chips. Closes on outside pointer-down and on Escape — a menu
 * that only closes by picking a score is a trap on touch.
 */
export function LowScoreMenu({
  episode,
  onSelect,
  triggerClassName,
  menuClassName,
  itemClassName,
}: LowScoreMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Rate episode ${episode} 0 to 4`}
        className={cn('relative flex items-center justify-center gap-1 transition-colors', triggerClassName)}
      >
        0-4 <ChevronDown className="w-3 h-3" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`Scores 0 to 4 for episode ${episode}`}
          className={cn(
            'absolute top-full left-1/2 z-50 mt-1 flex min-w-[52px] -translate-x-1/2 flex-col overflow-hidden rounded-lg shadow-xl',
            menuClassName,
          )}
        >
          {LOW_SCORES.map((score) => (
            <button
              key={score}
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(score);
                setOpen(false);
              }}
              aria-label={`Rate episode ${episode} a ${score} and mark watched`}
              className={cn('flex min-h-11 items-center justify-center px-3 text-[11px] transition-colors', itemClassName)}
            >
              {score}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
