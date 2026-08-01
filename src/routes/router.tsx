import { createBrowserRouter, redirect } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { HydrateFallback } from './HydrateFallback';
import { NotFound } from './NotFound';
import { RootLayout } from './RootLayout';
import { currentSeasonPath, parseSeasonParams, seasonPath } from './season';
import { SHOW_PARAM, parseShowId } from './showParam';

/** `/season` alone means "the season we're in right now". */
function seasonIndexLoader() {
  return redirect(currentSeasonPath());
}

/**
 * Season URLs are user-editable and shareable, so a nonsense year or season
 * lands on the current season rather than an error. A valid-but-uppercase slug
 * redirects to the canonical lowercase form so links stay comparable.
 */
function seasonLoader({ params }: LoaderFunctionArgs) {
  const parsed = parseSeasonParams(params.year, params.season);
  if (parsed === null) return redirect(currentSeasonPath());
  if (params.season !== parsed.season) return redirect(seasonPath(parsed.year, parsed.season));
  return null;
}

/** `/show/:id` is the short share link; the modal itself lives on `?show=`. */
function showRedirectLoader({ params }: LoaderFunctionArgs) {
  const id = parseShowId(params.id ?? null);
  if (id === null) return redirect('/schedule');
  return redirect(`/schedule?${SHOW_PARAM}=${id}`);
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    HydrateFallback,
    children: [
      { index: true, loader: () => redirect('/schedule') },
      {
        path: 'schedule',
        lazy: async () => ({ Component: (await import('../features/schedule/route')).ScheduleRoute }),
      },
      { path: 'season', loader: seasonIndexLoader },
      {
        path: 'season/:year/:season',
        loader: seasonLoader,
        lazy: async () => ({ Component: (await import('../features/season/route')).SeasonRoute }),
      },
      {
        path: 'search',
        lazy: async () => ({ Component: (await import('../features/search/route')).SearchRoute }),
      },
      {
        path: 'watching',
        lazy: async () => ({ Component: (await import('../features/watching/route')).WatchingRoute }),
      },
      {
        path: 'library',
        lazy: async () => ({ Component: (await import('../features/library/route')).LibraryRoute }),
      },
      {
        path: 'for-you',
        lazy: async () => ({ Component: (await import('../features/for-you/route')).ForYouRoute }),
      },
      { path: 'show/:id', loader: showRedirectLoader },
      { path: '*', Component: NotFound },
    ],
  },
]);
