import { Loader2, RefreshCw } from 'lucide-react';

/**
 * Loading and failure states for the shared season fetch. These render inside a
 * route's own area — the nav and the rest of the shell stay usable.
 */

export function ScheduleLoading() {
  return (
    <div className="flex h-[50vh] flex-col items-center justify-center space-y-4 text-purple-500">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p className="text-sm font-medium text-gray-400">Fetching anime schedule...</p>
    </div>
  );
}

export function ScheduleError({
  message,
  onRetry,
  title = 'Failed to load the schedule.',
}: {
  message: string;
  onRetry: () => void;
  title?: string;
}) {
  return (
    <div className="flex h-[50vh] items-center justify-center">
      <div className="max-w-sm rounded-lg border border-red-900/50 bg-red-900/20 p-6 text-center text-red-400">
        <p>{title}</p>
        <p className="mt-2 text-sm opacity-70">{message}</p>
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-800/60 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-900/30"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    </div>
  );
}
