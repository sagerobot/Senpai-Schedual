import { Link } from 'react-router';
import { NAV_ITEMS } from './nav';

/**
 * The 404 screen. Quiet by design (docs/design-language.md): an oversized
 * accent-tinted numeral, one line of copy, the primary way home, and a short
 * row of other destinations so a dead link never dead-ends the visit.
 *
 * Links wear the Button recipe's classes directly (same pattern as
 * RouteError) because the Button primitive renders a <button>, and these are
 * real navigations.
 */

/** Button primitive, primary/lg — kept in sync with components/ui/Button. */
const PRIMARY_LINK =
  'inline-flex h-11 items-center justify-center gap-2 rounded-control bg-accent-600 px-4 text-sm font-semibold text-fg-inverse transition-colors hover:bg-accent-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Button primitive, ghost/lg — kept in sync with components/ui/Button. */
const GHOST_LINK =
  'inline-flex h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Schedule is the primary CTA; offer a few of the other views alongside. */
const OTHER_DESTINATIONS = NAV_ITEMS.filter((item) => item.to !== '/schedule').slice(0, 4);

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-12 text-center">
      <p aria-hidden="true" className="select-none text-8xl font-bold leading-none tracking-tight text-accent-600/20">
        404
      </p>
      <h1 className="mt-2 text-2xl font-bold text-fg">Page not found</h1>
      <p className="mt-3 max-w-sm text-sm text-fg-faint">
        That link doesn&apos;t point anywhere in Senpai — maybe the show moved, or the URL lost an
        episode somewhere.
      </p>
      <Link to="/schedule" className={`${PRIMARY_LINK} mt-6`}>
        Back to Schedule
      </Link>
      <nav aria-label="Other destinations" className="mt-4 flex flex-wrap items-center justify-center gap-1">
        {OTHER_DESTINATIONS.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className={GHOST_LINK}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
