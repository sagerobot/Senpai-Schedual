/** @vitest-environment happy-dom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnimeMedia, EpisodeLog } from '../../types';
import { CheckInFeed, resetAdmittedDrops } from './CheckInFeed';

vi.mock('../../components/LibraryStatusMenu', () => ({ LibraryStatusMenu: () => null }));

const NOW = Math.floor(Date.now() / 1000);

/** Episode 8 is next week, so the latest aired episode is 7 (estimated). */
function show(airedHoursAgo: number): AnimeMedia {
  return {
    id: 1,
    idMal: 1,
    averageScore: 86,
    title: { romaji: 'Cowboy Bebop', english: 'Cowboy Bebop', userPreferred: 'Cowboy Bebop' },
    bannerImage: null,
    coverImage: { large: 'https://example.test/cover.jpg', color: null },
    startDate: { year: 1998, month: 4, day: 3 },
    nextAiringEpisode: {
      airingAt: NOW + 7 * 24 * 3600 - airedHoursAgo * 3600,
      timeUntilAiring: 7 * 24 * 3600 - airedHoursAgo * 3600,
      episode: 8,
    },
    status: 'RELEASING',
    format: 'TV',
    episodes: 26,
    externalLinks: [{ url: 'https://example.test/watch', site: 'Crunchyroll', icon: null, color: null }],
    genres: ['Action'],
  };
}

const logsThrough = (n: number): EpisodeLog[] =>
  Array.from({ length: n }, (_, i) => ({ showId: 1, episodeNumber: i + 1, watchedAt: NOW, score: 8 }));

describe('CheckInFeed drop admission', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resetAdmittedDrops();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function render(ui: ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
    });
  }

  it('does not admit a drop that is already past the 24h window', async () => {
    await render(
      <CheckInFeed animeList={[show(26)]} favorites={[1]} logs={logsThrough(3)} onLog={() => {}} onAnimeSelect={() => {}} />,
    );

    expect(container.textContent).not.toContain("Today's Drops");
  });

  it('keeps an admitted card up across the window lapsing, advancing to the next unwatched episode', async () => {
    // Admitted while in the window: behind, so the card targets episode 4.
    await render(
      <CheckInFeed animeList={[show(23)]} favorites={[1]} logs={logsThrough(3)} onLog={() => {}} onAnimeSelect={() => {}} />,
    );
    expect(container.textContent).toContain('Rate Episode 4');

    // The catch-up rating lands after the window has lapsed. The recompute
    // used to expire the card here — as though today's episode were logged.
    await render(
      <CheckInFeed animeList={[show(26)]} favorites={[1]} logs={logsThrough(4)} onLog={() => {}} onAnimeSelect={() => {}} />,
    );
    expect(container.textContent).toContain("Today's Drops");
    expect(container.textContent).toContain('Rate Episode 5');

    // Logging today's episode (7) is what resolves the card.
    await render(
      <CheckInFeed animeList={[show(26)]} favorites={[1]} logs={logsThrough(7)} onLog={() => {}} onAnimeSelect={() => {}} />,
    );
    expect(container.textContent).not.toContain("Today's Drops");
  });
});
