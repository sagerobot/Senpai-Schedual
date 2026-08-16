/** @vitest-environment happy-dom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpNextCandidate } from '../../lib/upNext';
import type { AnimeMedia, EpisodeLog, LibraryEntry } from '../../types';
import { CheckInFeed, resetAdmittedDrops, wouldBeDrop } from './CheckInFeed';

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

const logsThrough = (n: number, showId = 1): EpisodeLog[] =>
  Array.from({ length: n }, (_, i) => ({ showId, episodeNumber: i + 1, watchedAt: NOW, score: 8 }));

/** A distinct show whose episode 6 airs `airsInSec` from NOW (negative = already aired). */
function episodeSixShow(id: number, airsInSec: number): AnimeMedia {
  return {
    ...show(0),
    id,
    idMal: id,
    title: { romaji: `Show ${id}`, english: `Show ${id}`, userPreferred: `Show ${id}` },
    nextAiringEpisode: { airingAt: NOW + airsInSec, timeUntilAiring: airsInSec, episode: 6 },
  };
}

const watchingEntry = (showId: number): LibraryEntry => ({
  showId,
  idMal: showId,
  status: 'watching',
  showScore: null,
  source: 'manual',
});

function candidate(anime: AnimeMedia, behindCount: number, airedCount: number): UpNextCandidate {
  return {
    anime,
    entry: watchingEntry(anime.id),
    reason: { kind: 'backlog', text: `${behindCount} episodes waiting` },
    nextEpisode: airedCount - behindCount + 1,
    behindCount,
    airedCount,
    userAvgScore: null,
    score: behindCount,
  };
}

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
    vi.useRealTimers();
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

  it('holds a just-aired show out of the merged row while the drops memo predates the airing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW * 1000);

    const dropShow = show(23); // id 1 — an admitted drop, so the merged row exists
    const justAiring = episodeSixShow(2, 600); // episode 6 airs 10 min after mount
    const catchUp = { ...show(26), id: 3, idMal: 3, title: { romaji: 'Show 3', english: 'Show 3', userPreferred: 'Show 3' } }; // latest aired 26h ago — legit deck material
    const animeList = [dropShow, justAiring, catchUp];
    const favorites = [1, 2, 3];
    const logs = [...logsThrough(3), ...logsThrough(5, 2), ...logsThrough(3, 3)];
    const noop = () => {};
    const upNextFor = (candidates: UpNextCandidate[]) => ({ candidates, onLog: noop, onSkip: noop, onSelect: noop });

    // Mounted before the airing: the drops memo computes with this clock.
    await render(
      <CheckInFeed animeList={animeList} favorites={favorites} logs={logs} onLog={noop} onAnimeSelect={noop} upNext={upNextFor([])} />,
    );
    expect(container.textContent).toContain('Cowboy Bebop');

    // Episode 6 airs; only the deck's candidates recompute (fresher clock).
    // The drops memo's inputs are identity-equal, so it still predates the
    // airing — the would-be drop must not be dealt in as a catch-up filler,
    // while an ordinary behind candidate still is.
    vi.setSystemTime((NOW + 900) * 1000);
    await render(
      <CheckInFeed
        animeList={animeList}
        favorites={favorites}
        logs={logs}
        onLog={noop}
        onAnimeSelect={noop}
        upNext={upNextFor([candidate(justAiring, 1, 6), candidate(catchUp, 4, 7)])}
      />,
    );
    expect(container.textContent).toContain('Show 3');
    expect(container.textContent).not.toContain('Show 2');
  });
});

describe('wouldBeDrop', () => {
  const logs = logsThrough(5, 2);

  it('claims a favorited show whose unlogged episode just aired', () => {
    expect(wouldBeDrop(episodeSixShow(2, -300), [2], logs, NOW)).toBe(true);
  });

  it('ignores a show that is not favorited', () => {
    expect(wouldBeDrop(episodeSixShow(2, -300), [1], logs, NOW)).toBe(false);
  });

  it('ignores a show whose episode has not aired yet', () => {
    expect(wouldBeDrop(episodeSixShow(2, 300), [2], logs, NOW)).toBe(false);
  });

  it('ignores a show once the aired episode is logged', () => {
    expect(wouldBeDrop(episodeSixShow(2, -300), [2], logsThrough(6, 2), NOW)).toBe(false);
  });

  it('ignores a show past the 24h drops window', () => {
    expect(wouldBeDrop(episodeSixShow(2, -25 * 3600), [2], logs, NOW)).toBe(false);
  });
});
