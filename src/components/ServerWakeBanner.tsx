import { Loader2 } from 'lucide-react';
import type { ServerWakeStatus } from '../queries/serverWake';

/**
 * The "server is spinning up" pill. Rendered only while `useServerWake`
 * reports `waking`; it sits above the mobile bottom nav and out of the way on
 * desktop. Once the server answers, the hook flips to `up` and this unmounts —
 * and the vibes refetch it triggers is what fills in the chips.
 */
export function ServerWakeBanner({ status }: { status: ServerWakeStatus }) {
  if (status !== 'waking') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-50 -translate-x-1/2 md:bottom-6"
    >
      <div className="flex items-center gap-2 rounded-full border border-edge bg-surface-1/95 px-4 py-2 text-xs font-medium text-fg-secondary shadow-e2 backdrop-blur-md">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-400" aria-hidden="true" />
        <span>Waking the server — sentiment and summaries are on their way</span>
      </div>
    </div>
  );
}
