import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * The one modal chrome (docs/design-language.md §9): one overlay token, one
 * panel recipe, one close button, one enter/exit spec. The four dialogs had
 * copy-pasted overlays and drifted panels; they all render through this now.
 * Compose it inside a <Dialog.Root>; children own the panel's interior.
 */
export function DialogShell({
  maxWidth = 'max-w-md',
  hideClose = false,
  panelClassName,
  children,
}: {
  maxWidth?: string;
  hideClose?: boolean;
  panelClassName?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <Dialog.Content
        className={cn(
          'fixed left-[50%] top-[50%] z-50 w-full translate-x-[-50%] translate-y-[-50%] p-4 md:p-6 duration-200',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          maxWidth,
        )}
      >
        <div
          className={cn(
            'relative flex max-h-[85vh] flex-col overflow-hidden rounded-card border border-edge bg-surface-1 text-fg-secondary shadow-e3',
            panelClassName,
          )}
        >
          {children}
          {!hideClose && (
            <Dialog.Close className="absolute right-3 top-3 rounded-field p-1.5 text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          )}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
