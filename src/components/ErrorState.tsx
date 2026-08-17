import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

/**
 * The one failure card. Renders inside a route's own area — the nav and the
 * rest of the shell stay usable — and is deliberately red-toned so a failed
 * request never reads like an empty result.
 */

/** The `error.message` when there is one, else the caller's fallback copy. */
export function errorDetail(error: unknown, fallback = 'The request did not go through.'): string {
  return error instanceof Error ? error.message : fallback;
}

export function ErrorState({
  title,
  detail,
  onRetry,
  retryLabel = 'Retry',
  icon,
  className,
}: {
  title: string;
  /** Secondary line, usually the underlying error message. */
  detail?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-[40vh] items-center justify-center', className)}>
      <div className="flex max-w-sm flex-col items-center rounded-card border border-danger-500/40 bg-danger-600/10 p-6 text-center">
        <span className="text-danger-400">{icon ?? <AlertTriangle className="h-8 w-8" aria-hidden />}</span>
        <p className="mt-3 font-medium text-danger-300">{title}</p>
        {detail && <p className="mt-2 text-sm text-danger-400/70">{detail}</p>}
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-field border border-danger-500/40 px-4 py-2 text-sm font-medium text-danger-300 transition-colors hover:bg-danger-600/20"
          >
            <RefreshCw className="h-4 w-4" />
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
