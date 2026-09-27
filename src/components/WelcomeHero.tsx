import { Import, ListPlus, X } from 'lucide-react';
import { Link } from 'react-router';
import { openOnboarding } from '../features/onboarding/onboardingStore';
import { useUserData } from '../stores/userData';
import { Button } from './ui/Button';

/** Visible exactly while the library is empty and the hero hasn't been closed. */
export function useWelcomeHeroVisible(): boolean {
  const libraryEmpty = useUserData((s) => Object.keys(s.library).length === 0);
  const dismissed = useUserData((s) => s.uiPrefs.welcomeDismissed ?? false);
  return libraryEmpty && !dismissed;
}

/**
 * First-run banner at the top of the schedule. Renders nothing once the
 * library has anything in it, or after the user closes it (persisted via
 * uiPrefs.welcomeDismissed) — so it exists exactly as long as it is useful.
 * It is also the way back into onboarding for someone who skipped it.
 */
export function WelcomeHero() {
  const visible = useWelcomeHeroVisible();
  const setUiPrefs = useUserData((s) => s.setUiPrefs);

  if (!visible) return null;

  return (
    <section className="relative overflow-hidden rounded-card border border-accent-500/30 bg-gradient-to-br from-accent-600/25 via-surface-1 to-surface-0 p-6 sm:p-8">
      <button
        onClick={() => setUiPrefs({ welcomeDismissed: true })}
        aria-label="Dismiss welcome message"
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-field text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>

      <h2 className="pr-8 text-xl font-bold tracking-tight text-fg sm:text-2xl">Track what you're watching.</h2>
      <p className="mt-2 max-w-2xl text-sm text-fg-secondary sm:text-base">
        Pick the shows you're following and each new episode lands in Today's Drops as it airs. Senpai keeps a
        catch-up queue for the rest.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => openOnboarding('pick')} className="shadow-e1">
          <ListPlus className="h-4 w-4" aria-hidden="true" />
          Pick this season's shows
        </Button>
        <Link
          to="/library"
          className="inline-flex h-11 items-center gap-2 rounded-control border border-edge bg-surface-1 px-4 text-sm font-semibold text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Import className="h-4 w-4" />
          Import from MAL
        </Link>
      </div>
    </section>
  );
}
