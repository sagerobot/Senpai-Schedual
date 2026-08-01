/** @vitest-environment happy-dom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentSeasonPath, maxSeasonYear, parseSeasonParams } from './season';
import { parseShowId } from './showParam';

const COWBOY_BEBOP = {
  id: 1,
  idMal: 1,
  averageScore: 86,
  title: { romaji: 'Cowboy Bebop', english: 'Cowboy Bebop', userPreferred: 'Cowboy Bebop' },
  bannerImage: null,
  coverImage: { large: 'https://example.test/cover.jpg', color: null },
  startDate: { year: 1998, month: 4, day: 3 },
  nextAiringEpisode: null,
  status: 'FINISHED',
  format: 'TV',
  episodes: 26,
  externalLinks: [],
  genres: ['Action'],
  description: 'Space bounty hunters.',
};

// Every route wrapper pulls the AniList client in; the shell must render
// without a network. `fetchAnimeByIds` is what the media micro-batcher — and
// so every by-id lookup, including the `?show=` host — actually calls.
vi.mock('../api/anilist/queries', () => ({
  fetchCurrentSeasonAnime: vi.fn(async () => []),
  fetchMediaById: vi.fn(async (id: number) => {
    if (id !== COWBOY_BEBOP.id) throw new Error('no such show');
    return COWBOY_BEBOP;
  }),
  fetchAnimeByIds: vi.fn(async (ids: number[]) => (ids.includes(COWBOY_BEBOP.id) ? [COWBOY_BEBOP] : [])),
  fetchAnimeByMalIds: vi.fn(async () => []),
  fetchAnimeBySeason: vi.fn(async () => []),
  searchAnime: vi.fn(async () => []),
}));

// The detail modal hits the app server for merged synopses; not this PR's concern.
vi.mock('../api/showDetails', () => ({
  fetchShowDetails: vi.fn(async () => ({ mal: null, kitsu: null, aiSummary: null })),
}));

// The schedule query asks the app server for the precomputed season bundle
// before falling back to AniList. Stubbed to "no bundle" so the shell renders
// off the mocked fetchers above and never reaches a real socket.
vi.mock('../queries/seasonBundle', () => ({
  loadScheduleFromBundle: vi.fn(async () => null),
  getBundleShow: vi.fn(() => undefined),
  getBundleSummary: vi.fn(() => undefined),
}));

// Sentiment chips and the modal's vibe card read the remembered-vibes file from
// the app server. Stubbed empty for the same reason as the bundle above.
vi.mock('../queries/vibes', () => ({
  useVibesIndex: () => ({ get: () => undefined, size: 0 }),
}));

describe('parseShowId', () => {
  it('accepts positive integers only', () => {
    expect(parseShowId('21')).toBe(21);
    expect(parseShowId('0')).toBeNull();
    expect(parseShowId('-3')).toBeNull();
    expect(parseShowId('21.5')).toBeNull();
    expect(parseShowId('abc')).toBeNull();
    expect(parseShowId(null)).toBeNull();
  });
});

describe('parseSeasonParams', () => {
  const now = new Date('2026-07-31T00:00:00Z');

  it('accepts a valid pair case-insensitively', () => {
    expect(parseSeasonParams('2024', 'fall', now)).toEqual({ year: 2024, season: 'fall' });
    expect(parseSeasonParams('2024', 'FALL', now)).toEqual({ year: 2024, season: 'fall' });
  });

  it('rejects nonsense years and seasons', () => {
    expect(parseSeasonParams('nope', 'fall', now)).toBeNull();
    expect(parseSeasonParams('2024', 'autumn', now)).toBeNull();
    expect(parseSeasonParams('1800', 'fall', now)).toBeNull();
    expect(parseSeasonParams(undefined, undefined, now)).toBeNull();
  });

  it('clamps the archive to one year ahead', () => {
    expect(maxSeasonYear(now)).toBe(2027);
    expect(parseSeasonParams('2027', 'winter', now)).not.toBeNull();
    expect(parseSeasonParams('2028', 'winter', now)).toBeNull();
  });

  it('derives the current season path from the date', () => {
    expect(currentSeasonPath(now)).toBe('/season/2026/summer');
  });
});

describe('router shell', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.pushState({}, '', '/schedule');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });

  async function render() {
    // `RouterProvider` comes from `react-router`, not the `react-router/dom`
    // entry main.tsx uses: under Node resolution the /dom CJS build carries its
    // own copy of the hooks, so the two entries would supply different Router
    // contexts. The browser build has no such split (both ESM entries share one
    // chunk), so this only affects the test harness.
    // Imported lazily so the history entry above is in place first.
    const [{ RouterProvider }, { router }, { QueryClient, QueryClientProvider }, { resetMediaBatcher }] =
      await Promise.all([
        import('react-router'),
        import('./router'),
        import('@tanstack/react-query'),
        import('../queries/mediaBatcher'),
      ]);
    resetMediaBatcher();
    // A throwaway client per test: no retries and no cache carried between them.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );
    });
    // The first import of a route chunk can outlast a fixed wait, so block on
    // the router reporting the initial match resolved before settling renders.
    await settle(() => router.state.initialized);
    await settle();
    return router;
  }

  /**
   * Let the route's lazy chunk (and the mocked schedule fetch) resolve: a few
   * ticks by default, or up to 100 when waiting on an explicit condition.
   */
  async function settle(until?: () => boolean) {
    const limit = until === undefined ? 8 : 100;
    for (let i = 0; i < limit; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
      if (until?.()) break;
    }
  }

  it('renders the nav and the schedule route', async () => {
    await render();
    const text = container.textContent ?? '';
    for (const label of ['Schedule', 'Season', 'Search', 'Watching', 'Library', 'For You']) {
      expect(text).toContain(label);
    }
    expect(container.querySelector('a[href="/watching"]')).not.toBeNull();
    expect(container.querySelector('a[href="/season"]')).not.toBeNull();
  });

  it('gives keyboard users a skip link and two labelled navs', async () => {
    await render();

    // The skip link must be the first focusable thing on the page.
    const skip = container.querySelector('a[href="#main-content"]');
    expect(skip?.textContent).toBe('Skip to content');

    expect(container.querySelector('nav[aria-label="Primary"]')).not.toBeNull();
    expect(container.querySelector('nav[aria-label="Primary mobile"]')).not.toBeNull();

    // ...and land somewhere focus can actually go.
    const main = container.querySelector('main#main-content');
    expect(main?.getAttribute('tabindex')).toBe('-1');
  });

  it('keeps the shell around an unknown path', async () => {
    // The router is a module singleton that captured its location at creation,
    // so navigate through it rather than pushing onto history behind its back.
    const router = await render();
    await act(async () => {
      await router.navigate('/nope');
    });
    await settle();
    expect(container.textContent).toContain('Page not found');
    // The nav survives a 404 — this is a route, not a replacement screen.
    expect(container.querySelector('a[href="/schedule"]')).not.toBeNull();
  });

  it('opens the detail modal from ?show= and closes it back to the view', async () => {
    const router = await render();

    // Two pushes, the way `useOpenShow` does it: land on a view, then add the
    // param on top of it — that's what makes Back a modal close.
    await act(async () => {
      await router.navigate('/library');
    });
    await settle();
    await act(async () => {
      await router.navigate(`/library?show=${COWBOY_BEBOP.id}`);
    });
    await settle();

    // Radix portals the dialog out of the router's container.
    expect(document.body.textContent).toContain('Cowboy Bebop');
    expect(router.state.location.search).toBe(`?show=${COWBOY_BEBOP.id}`);

    await act(async () => {
      await router.navigate(-1);
    });
    await settle();

    expect(router.state.location.pathname).toBe('/library');
    expect(router.state.location.search).toBe('');
  });

  it('turns /show/:id into a schedule deep link', async () => {
    const router = await render();

    await act(async () => {
      await router.navigate('/show/1');
    });
    await settle();

    expect(router.state.location.pathname).toBe('/schedule');
    expect(router.state.location.search).toBe('?show=1');
  });

  it('redirects a nonsense season to the current one', async () => {
    const router = await render();

    await act(async () => {
      await router.navigate('/season/1200/autumn');
    });
    await settle();

    expect(router.state.location.pathname).toBe(currentSeasonPath());
  });
});
