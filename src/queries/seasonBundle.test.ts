/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeasonBundle } from '../lib/seasonBundle';
import type { SeriesGraph } from '../series/labeling';
import { useUserData, type SeriesOverrides } from '../stores/userData';
import { queryClient } from './client';
import { queryKeys } from './keys';
import {
  getBundleShow,
  getBundleSummary,
  loadScheduleFromBundle,
  primeSeriesFromBundle,
  resetSeasonBundle,
  selectPrimableGraphs,
} from './seasonBundle';

const NOW = Date.parse('2026-07-31T12:00:00.000Z');

function graph(seriesId: number, memberIds: number[]): SeriesGraph {
  return {
    seriesId,
    title: `Series ${seriesId}`,
    entries: memberIds.map((id) => ({
      id,
      format: 'TV',
      startDate: { year: 2026, month: 1, day: 1 },
      seasonLabel: `Season ${id}`,
      title: `Show ${id}`,
      isAttachment: false,
      episodes: 12,
    })),
  };
}

function overrides(partial: Partial<SeriesOverrides> = {}): SeriesOverrides {
  return { merges: {}, splits: [], ...partial };
}

function show(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    idMal: null,
    averageScore: 75,
    title: { romaji: `Show ${id}`, english: null, userPreferred: `Show ${id}` },
    bannerImage: null,
    coverImage: { large: 'https://example.test/c.jpg', color: null },
    startDate: { year: 2026, month: 7, day: 1 },
    nextAiringEpisode: null,
    status: 'RELEASING',
    format: 'TV',
    episodes: 12,
    externalLinks: [],
    genres: [],
    ...extra,
  };
}

function bundlePayload(overridesToBundle: Partial<SeasonBundle> = {}) {
  return {
    version: 1,
    generatedAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
    shows: [show(1), show(2)],
    seriesGraphs: { '1': graph(1, [1, 2]) },
    memberIndex: { '1': 1, '2': 1 },
    summaries: { '1': 'A summary of show one.' },
    ...overridesToBundle,
  };
}

function mockSeasonResponse(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resetSeasonBundle();
  queryClient.clear();
  useUserData.getState().setOverrides(overrides());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('selectPrimableGraphs', () => {
  const graphs = [graph(1, [1, 2]), graph(10, [10, 11]), graph(20, [20])];

  it('primes everything when the user has no overrides', () => {
    expect(selectPrimableGraphs(graphs, overrides()).map((g) => g.seriesId)).toEqual([1, 10, 20]);
  });

  it('skips a graph containing a split show', () => {
    const kept = selectPrimableGraphs(graphs, overrides({ splits: [11] }));
    expect(kept.map((g) => g.seriesId)).toEqual([1, 20]);
  });

  it('skips a graph containing a merge source', () => {
    const kept = selectPrimableGraphs(graphs, overrides({ merges: { 20: 999 } }));
    expect(kept.map((g) => g.seriesId)).toEqual([1, 10]);
  });

  it('skips a graph containing a merge target — the merged-in show belongs there now', () => {
    const kept = selectPrimableGraphs(graphs, overrides({ merges: { 500: 10 } }));
    expect(kept.map((g) => g.seriesId)).toEqual([1, 20]);
  });

  it('ignores overrides that touch no bundled graph', () => {
    const kept = selectPrimableGraphs(graphs, overrides({ splits: [777], merges: { 888: 999 } }));
    expect(kept.map((g) => g.seriesId)).toEqual([1, 10, 20]);
  });
});

describe('primeSeriesFromBundle', () => {
  it('stores the graph under every member id — the cache is the reverse map', () => {
    const bundle = { ...bundlePayload(), seriesGraphs: { '1': graph(1, [1, 2, 3]) } } as unknown as SeasonBundle;

    expect(primeSeriesFromBundle(bundle)).toBe(1);
    for (const id of [1, 2, 3]) {
      expect(queryClient.getQueryData(queryKeys.seriesByShow(id))).toEqual(graph(1, [1, 2, 3]));
    }
  });

  it('leaves an overridden franchise to the live resolver', () => {
    useUserData.getState().splitShow(2);
    const bundle = {
      ...bundlePayload(),
      seriesGraphs: { '1': graph(1, [1, 2]), '10': graph(10, [10]) },
    } as unknown as SeasonBundle;

    expect(primeSeriesFromBundle(bundle)).toBe(1);
    expect(queryClient.getQueryData(queryKeys.seriesByShow(1))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.seriesByShow(2))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.seriesByShow(10))).toEqual(graph(10, [10]));
  });
});

describe('loadScheduleFromBundle', () => {
  it('returns the bundle shows and adopts its graphs and summaries', async () => {
    mockSeasonResponse({ status: 'ok', bundle: bundlePayload() });

    const shows = await loadScheduleFromBundle();

    expect(shows?.map((s) => s.id)).toEqual([1, 2]);
    expect(getBundleSummary(1)).toBe('A summary of show one.');
    expect(queryClient.getQueryData(queryKeys.seriesByShow(2))).toEqual(graph(1, [1, 2]));
  });

  it('keeps synopses out of the cached shows but hands them to the detail modal', async () => {
    mockSeasonResponse({
      status: 'ok',
      bundle: bundlePayload({ shows: [show(1, { description: 'A long synopsis.' })] as never }),
    });

    const shows = await loadScheduleFromBundle();

    expect(shows?.[0].description).toBeUndefined();
    expect(getBundleShow(1)?.description).toBe('A long synopsis.');
  });

  it('recomputes timeUntilAiring from airingAt, which a stale countdown would get wrong', async () => {
    const airingAt = Math.floor(NOW / 1000) + 3600;
    mockSeasonResponse({
      status: 'ok',
      bundle: bundlePayload({
        shows: [show(1, { nextAiringEpisode: { airingAt, timeUntilAiring: 99_999, episode: 5 } })] as never,
      }),
    });

    const shows = await loadScheduleFromBundle();

    expect(shows?.[0].nextAiringEpisode).toEqual({ airingAt, timeUntilAiring: 3600, episode: 5 });
  });

  it('falls back when the route reports no bundle configured', async () => {
    mockSeasonResponse({ status: 'unavailable' }, 404);
    expect(await loadScheduleFromBundle()).toBeNull();
  });

  it('falls back when the bundle is older than the freshness gate', async () => {
    mockSeasonResponse({
      status: 'ok',
      bundle: bundlePayload({ generatedAt: new Date(NOW - 25 * 60 * 60 * 1000).toISOString() }),
    });

    expect(await loadScheduleFromBundle()).toBeNull();
    expect(getBundleSummary(1)).toBeUndefined();
  });

  it('falls back on a malformed payload rather than throwing', async () => {
    mockSeasonResponse({ status: 'ok', bundle: { version: 1, generatedAt: 'whenever' } });
    expect(await loadScheduleFromBundle()).toBeNull();
  });

  it('falls back on an empty bundle', async () => {
    mockSeasonResponse({ status: 'ok', bundle: bundlePayload({ shows: [] }) });
    expect(await loadScheduleFromBundle()).toBeNull();
  });

  it('falls back when the request fails outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await loadScheduleFromBundle()).toBeNull();
  });

  it('does not prime an overridden franchise even when the bundle is good', async () => {
    useUserData.getState().mergeShow(2, 1);
    mockSeasonResponse({ status: 'ok', bundle: bundlePayload() });

    await loadScheduleFromBundle();

    expect(queryClient.getQueryData(queryKeys.seriesByShow(1))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.seriesByShow(2))).toBeUndefined();
  });
});
