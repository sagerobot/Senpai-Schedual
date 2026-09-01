/** @vitest-environment happy-dom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../queries/keys';
import type { SeriesGraph } from '../series/labeling';
import { useUserData } from '../stores/userData';
import type { AnimeMedia, LibraryEntry } from '../types';
import { resetSkippedTonight, useUpNext, type UseUpNextResult } from './useUpNext';

// An uncached graph would send the resolver to AniList; offline it fails
// fast, which is the "graph not resolved" state the second test is about.
vi.mock('../api/anilist/client', () => ({
  anilistRequest: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
}));

/** A finished season, every episode unwatched — plain backlog material. */
function finishedShow(id: number, episodes: number): AnimeMedia {
  return {
    id,
    idMal: id,
    averageScore: 80,
    title: { romaji: `Show ${id}`, english: `Show ${id}`, userPreferred: `Show ${id}` },
    bannerImage: null,
    coverImage: { large: 'https://example.test/cover.jpg', color: null },
    startDate: { year: 2026, month: 1, day: 1 },
    nextAiringEpisode: null,
    status: 'FINISHED' as const,
    format: 'TV',
    episodes,
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

const FRANCHISE: SeriesGraph = {
  seriesId: 1,
  title: 'Show 1',
  entries: [
    { id: 1, format: 'TV', startDate: { year: 2026, month: 1, day: 1 }, seasonLabel: 'Season 1', title: 'Show 1', isAttachment: false },
    { id: 2, format: 'TV', startDate: { year: 2026, month: 7, day: 1 }, seasonLabel: 'Season 2', title: 'Show 1 Season 2', isAttachment: false },
  ],
};

/**
 * The hook's wiring around the pure fold: graphs come from the query cache
 * (primed here exactly as the bundle and the resolver prime them), and a
 * "Not tonight" on the franchise card takes every folded season with it.
 */
describe('useUpNext folds same-franchise candidates', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: UseUpNextResult | null;

  function Probe({ animeList }: { animeList: AnimeMedia[] }) {
    latest = useUpNext(animeList);
    return null;
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resetSkippedTonight();
    latest = null;
    useUserData.setState({
      library: { 1: watchingEntry(1), 2: watchingEntry(2) },
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
  });

  async function render(animeList: AnimeMedia[], graphs: SeriesGraph[]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    for (const graph of graphs) {
      for (const entry of graph.entries) client.setQueryData(queryKeys.seriesByShow(entry.id), graph);
    }
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe animeList={animeList} />
        </QueryClientProvider>,
      );
    });
  }

  it('deals one card for two seasons, led by Season 1, and skips both together', async () => {
    await render([finishedShow(1, 15), finishedShow(2, 12)], [FRANCHISE]);

    expect(latest!.candidates.map((c) => c.anime.id)).toEqual([1]);
    const [card] = latest!.candidates;
    expect(card.series?.seasonLabel).toBe('Season 1');
    expect(card.series?.then.map((q) => q.anime.id)).toEqual([2]);
    expect(card.reason.text).toBe('2 seasons · 27 waiting');

    // "Not tonight" on the franchise: Season 2 must not deal in behind it.
    await act(async () => latest!.skip(1));
    expect(latest!.candidates).toEqual([]);
  });

  it('keeps the seasons apart until their graph is in the cache', async () => {
    await render([finishedShow(1, 15), finishedShow(2, 12)], []);

    expect(latest!.candidates.map((c) => c.anime.id).sort()).toEqual([1, 2]);
    expect(latest!.candidates.every((c) => c.series === undefined)).toBe(true);
  });
});
