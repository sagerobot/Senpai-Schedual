import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
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
 * eleven cramped chips. Built on Radix DropdownMenu: the list renders in a
 * portal, so the cards' overflow-hidden rounded corners can never clip it, and
 * it flips above the trigger when there is no room below. Outside-tap and
 * Escape dismissal come with Radix.
 */
export function LowScoreMenu({
  episode,
  onSelect,
  triggerClassName,
  menuClassName,
  itemClassName,
}: LowScoreMenuProps) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Rate episode ${episode} 0 to 4`}
          className={cn('relative flex items-center justify-center gap-1 transition-colors', triggerClassName)}
        >
          0-4 <ChevronDown className="w-3 h-3" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="center"
          sideOffset={4}
          collisionPadding={8}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Scores 0 to 4 for episode ${episode}`}
          className={cn(
            'z-50 flex min-w-[52px] flex-col overflow-hidden rounded-lg shadow-xl',
            menuClassName,
          )}
        >
          {LOW_SCORES.map((score) => (
            <DropdownMenu.Item
              key={score}
              onSelect={() => onSelect(score)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Rate episode ${episode} a ${score} and mark watched`}
              className={cn(
                'flex min-h-11 cursor-pointer items-center justify-center px-3 text-[11px] outline-none transition-colors',
                itemClassName,
              )}
            >
              {score}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
