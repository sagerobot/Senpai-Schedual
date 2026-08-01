/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { anilistRequest } from '../api/anilist/client';
import { queryClient } from '../queries/client';
import { queryKeys } from '../queries/keys';
import { useUserData } from '../stores/userData';
import type { SeriesGraph } from './labeling';
import { seriesResolver } from './resolver';

vi.mock('../api/anilist/client', () => ({ anilistRequest: vi.fn() }));

const mockRequest = anilistRequest as unknown as Mock;

interface Edge {
  relationType: string;
  node: { id: number; type: string | null };
}

interface WorldNode {
  id: number;
  idMal: null;
  title: { english: string; romaji: null; userPreferred: string };
  format: string;
  episodes: number;
  startDate: { year: number; month: number; day: number };
  relations: { edges: Edge[] };
}

/** AniList as the test sees it: id -> record, with SEQUEL/ANIME edges by default. */
function world(links: Record<number, number[]>, extraEdges: Record<number, Edge[]> = {}): Map<number, WorldNode> {
  const map = new Map<number, WorldNode>();
  for (const [rawId, neighbours] of Object.entries(links)) {
    const id = Number(rawId);
    map.set(id, {
      id,
      idMal: null,
      title: { english: `Show ${id}`, romaji: null, userPreferred: `Show ${id}` },
      format: 'TV',
      episodes: 12,
      startDate: { year: 2000 + id, month: 1, day: 1 },
      relations: {
        edges: [
          ...neighbours.map((n) => ({ relationType: 'SEQUEL', node: { id: n, type: 'ANIME' } })),
          ...(extraEdges[id] ?? []),
        ],
      },
    });
  }
  return map;
}

function serve(map: Map<number, WorldNode>): void {
  mockRequest.mockImplementation(async (_query: string, variables: { ids: number[] }) => ({
    Page: { media: variables.ids.flatMap((id) => (map.has(id) ? [map.get(id)!] : [])) },
  }));
}

/** The ids asked for, in request order. */
function requestedIds(): number[][] {
  return mockRequest.mock.calls.map((call) => call[1].ids);
}

function ids(graph: SeriesGraph): number[] {
  return graph.entries.map((e) => e.id);
}

describe('series resolver', () => {
  beforeEach(() => {
    useUserData.setState({ overrides: { merges: {}, splits: [] } });
    queryClient.clear();
    seriesResolver.invalidateAll();
    mockRequest.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('issues one batched request per BFS round and follows only prequel/sequel anime edges', async () => {
    serve(
      world({ 1: [2, 3], 2: [], 3: [], 4: [], 5: [] }, {
        1: [
          { relationType: 'SIDE_STORY', node: { id: 4, type: 'ANIME' } },
          { relationType: 'SEQUEL', node: { id: 5, type: 'MANGA' } },
        ],
      }),
    );

    const graph = await seriesResolver.resolveSeries(1);

    expect(requestedIds()).toEqual([[1], [2, 3]]);
    expect(ids(graph)).toEqual([1, 2, 3]);
  });

  it('walks sequel and prequel edges symmetrically from any member', async () => {
    serve(
      world({ 1: [2], 2: [] }, { 2: [{ relationType: 'PREQUEL', node: { id: 1, type: 'ANIME' } }] }),
    );

    const graph = await seriesResolver.resolveSeries(2);

    expect(ids(graph)).toEqual([1, 2]);
    expect(graph.seriesId).toBe(1);
  });

  it('honours a split from both directions', async () => {
    useUserData.setState({ overrides: { merges: {}, splits: [3] } });
    serve(world({ 1: [2], 2: [3], 3: [4], 4: [] }));

    // Reached from a neighbour: never entered, so nothing past it is either.
    const fromStart = await seriesResolver.resolveSeries(1);
    expect(ids(fromStart)).toEqual([1, 2]);

    // Asked for directly: resolves standalone rather than re-joining the chain.
    const fromSplit = await seriesResolver.resolveSeries(3);
    expect(ids(fromSplit)).toEqual([3]);
    expect(fromSplit.seriesId).toBe(3);
  });

  it('applies a merge override before consulting the cache', async () => {
    // The old resolver read its cache first, so an override changed nothing
    // until the (never-expiring) cache entry happened to go away.
    const stale: SeriesGraph = { seriesId: 5, title: 'Stale standalone', entries: [] };
    queryClient.setQueryData(queryKeys.seriesByShow(5), stale);
    useUserData.setState({ overrides: { merges: { 5: 1 }, splits: [] } });
    serve(world({ 1: [2], 2: [] }));

    const graph = await seriesResolver.resolveSeries(5);

    expect(graph.seriesId).toBe(1);
    expect(ids(graph)).toEqual([1, 2]);
    // The merge source is indexed too, so the next lookup skips the walk.
    expect(queryClient.getQueryData(queryKeys.seriesByShow(5))).toBe(graph);
  });

  it('stops at the round cap and builds from what it fetched', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chain: Record<number, number[]> = {};
    for (let id = 1; id <= 12; id++) chain[id] = [id + 1];
    serve(world(chain));

    const graph = await seriesResolver.resolveSeries(1);

    expect(requestedIds()).toHaveLength(6);
    expect(ids(graph)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('6 BFS rounds'));
  });

  it('stops at the node cap', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const star: Record<number, number[]> = { 1: Array.from({ length: 150 }, (_, i) => i + 2) };
    for (let id = 2; id <= 151; id++) star[id] = [];
    serve(world(star));

    const graph = await seriesResolver.resolveSeries(1);

    // One request for the root, then the 99 queued ids in chunks of 50.
    expect(requestedIds().map((batch) => batch.length)).toEqual([1, 50, 49]);
    expect(graph.entries).toHaveLength(100);
  });

  it('throws on a failed request and caches nothing', async () => {
    mockRequest.mockRejectedValue(new Error('AniList is down'));

    await expect(seriesResolver.resolveSeries(1)).rejects.toThrow('AniList is down');
    expect(queryClient.getQueryData(queryKeys.seriesByShow(1))).toBeUndefined();

    // A truncated graph was never cached, so a later attempt resolves properly.
    serve(world({ 1: [2], 2: [] }));
    const graph = await seriesResolver.resolveSeries(1);
    expect(ids(graph)).toEqual([1, 2]);
  });

  it('throws when AniList knows nothing about the id', async () => {
    serve(world({ 99: [] }));
    await expect(seriesResolver.resolveSeries(1)).rejects.toThrow(/no media/);
  });

  it('resolves two members of one franchise with a single request set', async () => {
    serve(
      world({ 1: [2], 2: [] }, { 2: [{ relationType: 'PREQUEL', node: { id: 1, type: 'ANIME' } }] }),
    );

    const [first, second] = await Promise.all([
      seriesResolver.resolveSeries(1),
      seriesResolver.resolveSeries(2),
    ]);

    expect(requestedIds()).toEqual([[1], [2]]);
    expect(second).toBe(first);
  });

  it('re-resolves against the new overrides after one is written', async () => {
    serve(world({ 1: [2], 2: [] }));
    const before = await seriesResolver.resolveSeries(1);
    expect(ids(before)).toEqual([1, 2]);
    expect(queryClient.getQueryData(queryKeys.seriesByShow(2))).toBe(before);

    // Writing an override invalidates every graph — no reload, no stale cache.
    useUserData.getState().splitShow(2);
    expect(queryClient.getQueryData(queryKeys.seriesByShow(2))).toBeUndefined();

    const after = await seriesResolver.resolveSeries(1);
    expect(ids(after)).toEqual([1]);
    expect(requestedIds()).toEqual([[1], [2], [1]]);
  });
});
