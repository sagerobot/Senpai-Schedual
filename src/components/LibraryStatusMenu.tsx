import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { LIBRARY_STATUS_LABELS, LIBRARY_STATUS_ORDER } from '../lib/status';
import { LibraryStatus } from '../types';
import { useUserData } from '../stores/userData';

export interface LibraryTriggerState {
  /** Filled bookmark = "in library" (any status), not "watching". */
  inLibrary: boolean;
  status: LibraryStatus | null;
}

interface LibraryStatusMenuProps {
  showId: number;
  /**
   * Renders the trigger (usually a bookmark button). Must return an element
   * that forwards DOM props and refs — a plain <button> does. The menu owns
   * the click behavior and aria-label; do not attach onClick in the trigger.
   */
  renderTrigger: (state: LibraryTriggerState) => React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>;
  align?: 'start' | 'center' | 'end';
}

const itemClasses =
  'flex min-h-11 cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 text-sm text-gray-200 outline-none transition-colors data-[highlighted]:bg-accent-500/15 data-[highlighted]:text-white';

/**
 * The one bookmark behavior, everywhere a bookmark appears (PR 12):
 * - Show not in library → the trigger is a plain button; clicking adds the show
 *   as Watching with an Undo toast. No menu.
 * - Show in library (any status) → clicking opens a status menu: five statuses
 *   (current one checked) and a red "Remove from Library". Every action gets an
 *   Undo toast; Remove restores the full snapshot (entry + episode logs).
 *
 * Reads the store itself given only `showId`, so call sites stay dumb.
 */
export function LibraryStatusMenu({ showId, renderTrigger, align = 'end' }: LibraryStatusMenuProps) {
  const entry = useUserData((s) => s.library[showId]);
  const inLibrary = entry !== undefined;
  const status = entry?.status ?? null;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    useUserData.getState().addToLibrary(showId);
    toast('Added to Library — Watching', {
      action: { label: 'Undo', onClick: () => useUserData.getState().removeFromLibrary(showId) },
    });
  };

  const handleSetStatus = (next: LibraryStatus) => {
    const previous = useUserData.getState().library[showId]?.status;
    if (previous === undefined || previous === next) return;
    useUserData.getState().setStatus(showId, next);
    toast(`Moved to ${LIBRARY_STATUS_LABELS[next]}`, {
      action: { label: 'Undo', onClick: () => useUserData.getState().setStatus(showId, previous) },
    });
  };

  const handleRemove = () => {
    const snapshot = useUserData.getState().removeFromLibrary(showId);
    toast(
      'Removed from Library',
      snapshot
        ? { action: { label: 'Undo', onClick: () => useUserData.getState().restoreSnapshot(snapshot) } }
        : undefined,
    );
  };

  if (!inLibrary) {
    return React.cloneElement(renderTrigger({ inLibrary, status }), {
      onClick: handleAdd,
      'aria-label': 'Add to library',
    });
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        asChild
        aria-label="In library — change status"
        onClick={stop}
        onPointerDown={stop}
      >
        {renderTrigger({ inLibrary, status })}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          onClick={stop}
          className="z-[100] min-w-[210px] rounded-xl border border-edge bg-surface-2 p-1.5 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {LIBRARY_STATUS_ORDER.map((s) => (
            <DropdownMenu.Item key={s} className={itemClasses} onSelect={() => handleSetStatus(s)}>
              <Check className={cn('h-4 w-4 text-accent-400', s === status ? 'opacity-100' : 'opacity-0')} />
              {LIBRARY_STATUS_LABELS[s]}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-edge" />
          <DropdownMenu.Item
            className={cn(itemClasses, 'text-red-400 data-[highlighted]:bg-red-500/10 data-[highlighted]:text-red-300')}
            onSelect={handleRemove}
          >
            <Trash2 className="h-4 w-4" />
            Remove from Library
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
