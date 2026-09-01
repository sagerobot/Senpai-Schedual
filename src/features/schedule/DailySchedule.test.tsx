/** @vitest-environment happy-dom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSkippedTonight } from '../../hooks/useUpNext';
import { useUserData, logKey } from '../../stores/userData';
import type { AnimeMedia, EpisodeLog, LibraryEntry } from '../../types';
import { resetAdmittedDrops } from './CheckInFeed';
import { DailySchedule } from './DailySchedule';

vi.mock('../../components/LibraryStatusMenu', () => ({ LibraryStatusMenu: () => null }));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const NOW = Math.floor(Date.now() / 1000);

/** A show whose episode 6 aired 5 minutes ago — live drop material. */
function justAiredShow(id: number): AnimeMedia {
  return {
    id,
    idMal: id,
    averageScore: 80,
    title: { romaji: `Show ${id}`, english: `Show ${id}`, userPreferred: `Show ${id}` },
    bannerImage: null,
    coverImage: { large: 'https://example.test/cover.jpg', color: null },
    startDate: { year: 2026, month: 1, day: 1 },
    nextAiringEpisode: { airingAt: NOW - 300, timeUntilAiring: -300, episode: 6 },
    status: 'RELEASING',
    format: 'TV',
    episodes: 12,
    externalLinks: [],
    genres: ['Action'],
  };
}

const watchingEntry = (showId: number): LibraryEntry => ({
  showId,
  idMal: showId,
  status: 'watching',
  showScore: null,
  source: 'manual',
});

const logsThrough = (showId: number, n: number): EpisodeLog[] =>
  Array.from({ length: n }, (_, i) => ({ showId, episodeNumber: i + 1, watchedAt: NOW * 1000, score: 8 }));

/**
 * The two dropSkips wirings only this host exercises: the standalone-deck
 * wouldBeDrop filter, and useUpNext handing the store's skips to rankUpNext.
 * CheckInFeed's own tests cover the merged-row call sites.
 */
describe('DailySchedule standalone deck after a skip', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resetAdmittedDrops();
    resetSkippedTonight();
    const logs = logsThrough(2, 5);
    useUserData.setState({
      library: { 2: watchingEntry(2) },
      logs: Object.fromEntries(logs.map((l) => [logKey(l.showId, l.episodeNumber), l])),
      dropSkips: {},
    });
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

  it('shows the skipped show in the deck with the skipped-drop reason', async () => {
    useUserData.getState().skipDrop(2, 6);
    await render(
      <DailySchedule
        animeList={[justAiredShow(2)]}
        favorites={[2]}
        onAnimeSelect={() => {}}
        logs={logsThrough(2, 5)}
        onLog={() => {}}
      />,
    );

    // The skip empties the drops row and — despite the episode still being
    // inside the 24h drop window — hands the show to the standalone deck,
    // boosted. If either wiring is dropped, one of these assertions fails.
    expect(container.textContent).not.toContain("Today's Drops");
    expect(container.textContent).toContain('Up next for you');
    expect(container.textContent).toContain('Skipped this week — ready when you are');
  });

  it('without a skip, the fresh drop owns the surface and the deck stays hidden', async () => {
    await render(
      <DailySchedule
        animeList={[justAiredShow(2)]}
        favorites={[2]}
        onAnimeSelect={() => {}}
        logs={logsThrough(2, 5)}
        onLog={() => {}}
      />,
    );

    expect(container.textContent).toContain("Today's Drops");
    expect(container.textContent).not.toContain('Up next for you');
  });
});
