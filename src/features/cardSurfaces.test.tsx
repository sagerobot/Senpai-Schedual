/** @vitest-environment happy-dom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnimeMedia, EpisodeLog } from '../types';
import { CheckInFeed } from './schedule/CheckInFeed';
import { CatchUpQueue } from './watching/CatchUpQueue';

vi.mock('../components/LibraryStatusMenu', () => ({ LibraryStatusMenu: () => null }));

const NOW = Math.floor(Date.now() / 1000);

const ANIME: AnimeMedia = {
  id: 1,
  idMal: 1,
  averageScore: 86,
  title: { romaji: 'Cowboy Bebop', english: 'Cowboy Bebop', userPreferred: 'Cowboy Bebop' },
  bannerImage: null,
  coverImage: { large: 'https://example.test/cover.jpg', color: null },
  startDate: { year: 1998, month: 4, day: 3 },
  // prevAirTime = airingAt - 7d, i.e. 23 hours ago
  nextAiringEpisode: { airingAt: NOW + 6 * 24 * 3600 + 3600, timeUntilAiring: 6 * 24 * 3600, episode: 8 },
  status: 'RELEASING',
  format: 'TV',
  episodes: 26,
  externalLinks: [{ url: 'https://example.test/watch', site: 'Crunchyroll', icon: null, color: null }],
  genres: ['Action'],
};

const LOGS: EpisodeLog[] = [1, 2, 3].map((n) => ({ showId: 1, episodeNumber: n, watchedAt: NOW, score: 8 }));

describe('restored card surfaces render', () => {
  let container: HTMLDivElement;
  let root: Root;
  let errors: unknown[];

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    errors = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
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

  it('CheckInFeed draws the banner card with no React errors', async () => {
    await render(<CheckInFeed animeList={[ANIME]} favorites={[1]} logs={LOGS} onLog={() => {}} onAnimeSelect={() => {}} />);

    expect(container.textContent).toContain("Today's Drops");
    expect(container.textContent).toContain('Cowboy Bebop');
    expect(container.textContent).toContain('Rate Episode 4');
    expect(container.querySelector('button[aria-label="Open Cowboy Bebop"]')).not.toBeNull();
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.test/watch');
    expect(errors).toEqual([]);
  });

  it('CatchUpQueue draws the queue card with no React errors', async () => {
    await render(<CatchUpQueue animeList={[ANIME]} favorites={[1]} logs={LOGS} onLog={() => {}} onAnimeSelect={() => {}} />);

    expect(container.textContent).toContain('Catch-up Queue');
    expect(container.textContent).toContain('Cowboy Bebop');
    expect(container.textContent).toContain('3 / 7 logged');
    expect(container.textContent).toContain('Rate Episode 4');
    expect(errors).toEqual([]);
  });
});
