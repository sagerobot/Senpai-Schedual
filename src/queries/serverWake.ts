import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { queryKeys } from './keys';

/**
 * Detects a sleeping server and reports when it comes back.
 *
 * The service worker makes the shell load instantly, but the free-tier host
 * spins the server down when idle — so on a cold visit the app paints while
 * `/api/*` is still waking up (~30-60s). The vibes fetch times out during that
 * window and caches an *empty* result for its full staleTime, which is why
 * chips silently vanish for a session. This hook is the fix for both halves:
 * the UI can say what is happening, and the moment a probe succeeds the vibes
 * query is invalidated so sentiment appears without a reload.
 *
 * Statuses: `checking` (first probe in flight), `waking` (server not answering
 * yet — show the pill), `up` (all good), `gone` (gave up; the app's existing
 * degraded modes already cover a server that is truly down).
 */

export type ServerWakeStatus = 'checking' | 'waking' | 'up' | 'gone';

const HEALTH_ENDPOINT = '/api/health';
/** Short: a warm server answers in milliseconds; a cold one not for ~30-60s. */
const PROBE_TIMEOUT_MS = 4_000;
const POLL_INTERVAL_MS = 5_000;
/** Render cold starts finish well inside this; past it, the server is down. */
const GIVE_UP_AFTER_MS = 3 * 60_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function probe(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function useServerWake(): ServerWakeStatus {
  const [status, setStatus] = useState<ServerWakeStatus>('checking');
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (await probe()) {
        if (!cancelled) setStatus('up');
        return;
      }
      if (cancelled) return;
      setStatus('waking');

      const startedAt = Date.now();
      while (!cancelled && Date.now() - startedAt < GIVE_UP_AFTER_MS) {
        await sleep(POLL_INTERVAL_MS);
        if (cancelled) return;
        if (await probe()) {
          if (cancelled) return;
          setStatus('up');
          // The vibes query most likely timed out during the cold start and
          // cached an empty index; refetching it now is what makes the chips
          // appear the moment the server is actually there.
          void queryClient.invalidateQueries({ queryKey: queryKeys.vibes() });
          return;
        }
      }
      if (!cancelled) setStatus('gone');
    })();

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  return status;
}
