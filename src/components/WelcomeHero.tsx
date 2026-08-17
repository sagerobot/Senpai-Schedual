import { Compass, Import, X } from 'lucide-react';
import { Link } from 'react-router';
import { useUserData } from '../stores/userData';

/**
 * First-run banner at the top of the schedule. Renders nothing once the
 * library has anything in it, or after the user closes it (persisted via
 * uiPrefs.welcomeDismissed) — so it exists exactly as long as it is useful.
 */
export function WelcomeHero() {
  const libraryEmpty = useUserData((s) => Object.keys(s.library).length === 0);
  const dismissed = useUserData((s) => s.uiPrefs.welcomeDismissed ?? false);
  const setUiPrefs = useUserData((s) => s.setUiPrefs);

  if (!libraryEmpty || dismissed) return null;

  return (
    <section className="relative overflow-hidden rounded-card border border-accent-500/30 bg-gradient-to-br from-accent-600/25 via-surface-1 to-surface-0 p-6 sm:p-8">
      <button
        onClick={() => setUiPrefs({ welcomeDismissed: true })}
        aria-label="Dismiss welcome message"
        className="absolute right-3 top-3 rounded-field p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <X className="h-4 w-4" />
      </button>

      <h2 className="pr-8 text-xl font-bold tracking-tight text-fg sm:text-2xl">Track what you're watching.</h2>
      <p className="mt-2 max-w-2xl text-sm text-fg-secondary sm:text-base">
        Bookmark a show below and it shows up in Today's Drops the day it airs — Senpai keeps a catch-up queue for
        the rest.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          to="/season"
          className="inline-flex items-center gap-2 rounded-inner bg-accent-600 px-4 py-2.5 text-sm font-semibold text-fg-inverse shadow-e1 transition-colors hover:bg-accent-500"
        >
          <Compass className="h-4 w-4" />
          Browse this season
        </Link>
        <Link
          to="/library"
          className="inline-flex items-center gap-2 rounded-inner border border-edge bg-surface-1 px-4 py-2.5 text-sm font-semibold text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <Import className="h-4 w-4" />
          Import from MAL
        </Link>
      </div>
    </section>
  );
}
