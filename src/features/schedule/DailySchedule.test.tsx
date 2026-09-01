/** @vitest-environment happy-dom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fetchAnimeByIds } from '../../api/anilist/queries';
import { resetSkippedTonight } from '../../hooks/useUpNext';
import { queryKeys } from '../../queries/keys';
import { resetMediaBatcher } from '../../queries/mediaBatcher';
import type { SeriesGraph } from '../../series/labeling';
import { useUserData, logKey } from '../../stores/userData';
import type { AnimeMedia, EpisodeLog, LibraryEntry } from '../../types';
import { resetAdmittedDrops } from './CheckInFeed';
import { DailySchedule } from './DailySchedule';

vi.mock('../../components/LibraryStatusMenu', () => ({ LibraryStatusMenu: () => null }));
vi.mock('../../api/anilist/queries', () => ({ fetchAnimeByIds: vi.fn() }));
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

/**
 * The Mine / Everything segment: "mine" is watching + stacking, and the choice
 * is persisted so the schedule opens the way the user left it.
 */
describe('DailySchedule Mine / Everything', () => {
  let container: HTMLDivElement;
  let root: Root;

  /** Episode 6 airs in two days — day-grid material, never a drop. */
  const upcomingShow = (id: number): AnimeMedia => ({
    ...justAiredShow(id),
    nextAiringEpisode: { airingAt: NOW + 2 * 24 * 3600, timeUntilAiring: 2 * 24 * 3600, episode: 6 },
  });

  const stackingEntry = (showId: number): LibraryEntry => ({
    showId,
    idMal: showId,
    status: 'stacking',
    showScore: null,
    source: 'manual',
  });

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resetAdmittedDrops();
    resetSkippedTonight();
    useUserData.setState({
      library: { 2: watchingEntry(2), 3: stackingEntry(3) },
      logs: {},
      dropSkips: {},
      uiPrefs: { includeMovies: false, selectedSources: [] },
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

  it('keeps the untracked show until Mine is picked, then remembers the pick', async () => {
    await render(
      <DailySchedule
        animeList={[upcomingShow(2), upcomingShow(3), upcomingShow(4)]}
        favorites={[2]}
        stacking={[3]}
        onAnimeSelect={() => {}}
        logs={[]}
        onLog={() => {}}
      />,
    );

    // Everything is the default: the tab still opens as a season browser.
    expect(useUserData.getState().uiPrefs.mineOnly ?? false).toBe(false);
    expect(container.textContent).toContain('Show 4');

    const mine = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith('Mine'),
    );
    expect(mine).toBeDefined();
    await act(async () => {
      mine!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Watching and stacking both survive; the untracked show is gone.
    expect(container.textContent).toContain('Show 2');
    expect(container.textContent).toContain('Show 3');
    expect(container.textContent).not.toContain('Show 4');
    expect(useUserData.getState().uiPrefs.mineOnly).toBe(true);
  });

  it('offers the way out when Mine empties the week', async () => {
    await render(
      <DailySchedule
        animeList={[upcomingShow(4)]}
        favorites={[]}
        stacking={[]}
        onAnimeSelect={() => {}}
        logs={[]}
        onLog={() => {}}
      />,
    );

    const mine = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith('Mine'),
    );
    await act(async () => {
      mine!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('None of your shows have an episode this week');
  });
});

/**
 * A stacked Season 2 whose finale just aired, behind an unfinished Season 1:
 * the deck folds it under Season 1, and DailySchedule must still find it for
 * the drops row — the graduation card is the point of stacking.
 */
describe('DailySchedule graduation behind a folded franchise card', () => {
  let container: HTMLDivElement;
  let root: Root;

  const stackingEntry = (showId: number): LibraryEntry => ({
    showId,
    idMal: showId,
    status: 'stacking',
    showScore: null,
    source: 'manual',
  });

  /** Season 1: episode 6 airs in two days, nothing watched — deck backlog, not a drop. */
  const seasonOne: AnimeMedia = {
    ...justAiredShow(1),
    nextAiringEpisode: { airingAt: NOW + 2 * 24 * 3600, timeUntilAiring: 2 * 24 * 3600, episode: 6 },
  };
  /** Season 2: the finale (12 of 12) aired five minutes ago; not in the season list. */
  const seasonTwo: AnimeMedia = {
    ...justAiredShow(2),
    nextAiringEpisode: { airingAt: NOW - 300, timeUntilAiring: -300, episode: 12 },
  };
  const franchise: SeriesGraph = {
    seriesId: 1,
    title: 'Show 1',
    entries: [
      { id: 1, format: 'TV', startDate: { year: 2026, month: 1, day: 1 }, seasonLabel: 'Season 1', title: 'Show 1', isAttachment: false },
      { id: 2, format: 'TV', startDate: { year: 2026, month: 7, day: 1 }, seasonLabel: 'Season 2', title: 'Show 1 Season 2', isAttachment: false },
    ],
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resetAdmittedDrops();
    resetSkippedTonight();
    resetMediaBatcher();
    (fetchAnimeByIds as Mock).mockResolvedValue([seasonTwo]);
    useUserData.setState({
      library: { 1: watchingEntry(1), 2: stackingEntry(2) },
      logs: {},
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

  it('still deals the stacked finale into the drops row', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    for (const entry of franchise.entries) client.setQueryData(queryKeys.seriesByShow(entry.id), franchise);
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <DailySchedule
            animeList={[seasonOne]}
            favorites={[1]}
            stacking={[2]}
            onAnimeSelect={() => {}}
            logs={[]}
            onLog={() => {}}
          />
        </QueryClientProvider>,
      );
    });
    // Let the id_in micro-batcher deliver Season 2 to the deck.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    expect(container.textContent).toContain("Today's Drops");
    expect(container.textContent).toContain('Stack complete');
    expect(container.textContent).toContain('Then Season 2 · 12 waiting');
  });
});
