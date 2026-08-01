import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useRouteError } from 'react-router';

/**
 * The screen behind the router's ErrorBoundary — most importantly, the screen
 * a visitor sees when their open tab predates a deploy.
 *
 * Every deploy renames the hashed route chunks, so a tab that loaded the old
 * shell 404s the moment it lazy-loads a route that has since been rebuilt. A
 * plain reload always heals this (documents revalidate; the fresh HTML points
 * at the fresh chunks), so that case reloads itself once — the guard below is
 * what keeps "reload didn't help" (offline, half-deployed) from looping.
 */

/** Chrome: "Failed to fetch dynamically imported module". Firefox: "error
 *  loading dynamically imported module". Safari: "Importing a module script
 *  failed". All three are the stale-chunk signature. */
const STALE_CHUNK_RE = /dynamically imported module|module script failed/i;

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return STALE_CHUNK_RE.test(message);
}

const RELOAD_GUARD_KEY = 'senpai.staleChunkReloadAt';
const RELOAD_GUARD_WINDOW_MS = 60_000;

/** One automatic reload per minute: heals every deploy, can never loop. */
export function shouldAutoReload(lastReloadAt: number, now: number): boolean {
  return now - lastReloadAt > RELOAD_GUARD_WINDOW_MS;
}

/** sessionStorage on purpose: per-tab, gone when the tab closes, and outside
 *  the localStorage quota policy that storage.ts exists to enforce. */
function claimAutoReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
    if (!shouldAutoReload(last, Date.now())) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    return true;
  } catch {
    return false; // storage unavailable — fall through to the manual screen
  }
}

export function RouteError() {
  const error = useRouteError();
  const stale = isStaleChunkError(error);
  // State initializer so the claim happens exactly once per mount, not per render.
  const [reloading] = useState(() => stale && claimAutoReload());

  useEffect(() => {
    if (reloading) window.location.reload();
  }, [reloading]);

  if (reloading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center space-y-4 text-center">
        <RefreshCw className="h-10 w-10 animate-spin text-accent-500" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-white">Just a moment</h1>
        <p className="max-w-sm text-sm text-gray-500">
          Senpai updated while this tab was open — loading the new version.
        </p>
      </div>
    );
  }

  const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  return (
    <div className="flex h-screen flex-col items-center justify-center space-y-4 px-6 text-center">
      <AlertTriangle className="h-12 w-12 text-gray-700" aria-hidden="true" />
      <h1 className="text-2xl font-bold text-white">{stale ? 'Senpai updated' : 'Something broke'}</h1>
      <p className="max-w-sm text-sm text-gray-500">
        {stale
          ? 'This tab is running an old version of the app. Reloading should fix it.'
          : 'The app hit an error it could not recover from. Your library and logs are safe — they live in this browser, not on the page.'}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => window.location.reload()}
          className="flex h-11 items-center gap-2 rounded-lg bg-accent-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-500"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reload
        </button>
        <Link
          to="/schedule"
          reloadDocument
          className="flex h-11 items-center rounded-lg border border-edge px-4 text-sm font-medium text-gray-300 transition-colors hover:bg-surface-3 hover:text-white"
        >
          Back to Schedule
        </Link>
      </div>
      {detail !== '' && <p className="max-w-md break-all font-mono text-[11px] text-gray-600">{detail}</p>}
    </div>
  );
}
