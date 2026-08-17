import { Flag } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * "This reading is wrong" — the visitor's side of the vibe correction loop.
 *
 * Flags land as anonymous per-episode counters on the server (POST
 * /api/vibe-flag), ride out with the cache export, and a review pass decides
 * what to do; nothing is auto-deleted. Reasons mirror the failure modes the
 * pipeline actually has: a mismatched thread, a leaked spoiler, a misread.
 */

const REASONS = [
  { reason: 'wrong_thread', label: 'Wrong show or episode' },
  { reason: 'spoiler', label: 'Contains a spoiler' },
  { reason: 'inaccurate', label: 'Sentiment seems off' },
] as const;

export function VibeFlagButton({ showId, episode }: { showId: number; episode: number }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async (reason: string) => {
    setOpen(false);
    setSent(true); // optimistic: one report per card, no double-taps
    try {
      const response = await fetch('/api/vibe-flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId, episode, reason }),
      });
      if (!response.ok) throw new Error(String(response.status));
      toast.success('Thanks — flagged for review');
    } catch {
      setSent(false);
      toast.error("Couldn't send the report — try again later");
    }
  };

  if (sent) {
    return <p className="mt-3 text-caption text-fg-faint">Reported — thank you.</p>;
  }

  return (
    <div className="mt-3 border-t border-edge-strong/50 pt-2">
      {open ? (
        <div className="flex flex-wrap items-center gap-2">
          {REASONS.map(({ reason, label }) => (
            <button
              key={reason}
              onClick={() => void send(reason)}
              className="flex min-h-11 items-center rounded-field border border-edge-strong px-3 text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-3 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center px-2 text-xs text-fg-faint transition-colors hover:text-fg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex min-h-11 items-center gap-1.5 text-caption text-fg-faint transition-colors hover:text-fg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Flag className="h-3 w-3" aria-hidden="true" />
          Report an issue with this reading
        </button>
      )}
    </div>
  );
}
