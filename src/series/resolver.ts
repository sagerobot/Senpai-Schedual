import { z } from 'zod';
import { anilistRequest } from '../api/anilist/client';
import { MEDIA_CORE } from '../api/anilist/fragments';
import { MalResolvedMediaSchema, type MalResolvedMedia } from '../api/anilist/schemas';
import { queryClient } from '../queries/client';
import { queryKeys } from '../queries/keys';
import { useUserData, type SeriesOverrides } from '../stores/userData';
import { buildSeriesGraph, type SeriesGraph } from './labeling';

/**
 * The franchise resolver: one module-level singleton that turns a show id into
 * the graph of every season/movie AniList links to it.
 *
 * Invariants, each of which fixes a way this can go wrong:
 *
 * - **Overrides are applied before any cache lookup.** Read the cache first and
 *   a merge or split silently does nothing until the cache expires.
 * - **BFS is batched.** Each round issues one `id_in` request for the whole
 *   frontier instead of one per node — 2-3 requests per franchise rather than
 *   one per season.
 * - **Splits are symmetric.** A split id is never entered from a neighbour and,
 *   when it is the id being resolved, its own edges are not followed either.
 * - **A failed request throws.** Swallowing the error would cache a truncated
 *   graph, and a graph missing seasons looks exactly like a correct one.
 * - **The query cache is the reverse map.** Every member id is primed with the
 *   same graph object, so the other N-1 cards of a franchise resolve for free
 *   and the mapping expires on the same TTL as the data.
 */

const IDS_PER_REQUEST = 50;
/** Expansion caps. A pathological relation web stops here and builds from what it has. */
const MAX_ROUNDS = 6;
const MAX_NODES = 100;
const MAX_REQUESTS = 10;

export class SeriesResolutionError extends Error {
  constructor(showId: number) {
    super(`AniList returned no media for series start id ${showId}`);
    this.name = 'SeriesResolutionError';
  }
}

/** MEDIA_CORE is the selection the MAL resolver already validates; same shape here. */
type SeriesNode = MalResolvedMedia;

const SeriesPageSchema = z.object({
  Page: z.object({
    media: z
      .array(MalResolvedMediaSchema)
      .nullable()
      .transform((v) => v ?? []),
  }),
});

const SERIES_PAGE_QUERY = `
  query ($ids: [Int]) {
    Page(page: 1, perPage: ${IDS_PER_REQUEST}) {
      media(id_in: $ids, type: ANIME) { ${MEDIA_CORE} }
    }
  }
`;

async function fetchSeriesNodes(ids: number[]): Promise<SeriesNode[]> {
  const data = await anilistRequest(SERIES_PAGE_QUERY, { ids }, SeriesPageSchema);
  return data.Page.media;
}

function readOverrides(): SeriesOverrides {
  return useUserData.getState().overrides;
}

/**
 * Breadth-first walk of PREQUEL/SEQUEL edges, one request per frontier round.
 * Throws if a request fails or if AniList knows nothing about `startId` — the
 * caller must never persist a graph built from a partial walk.
 */
async function resolveFranchise(startId: number, overrides: SeriesOverrides): Promise<SeriesGraph> {
  const splits = new Set(overrides.splits);
  const fetched = new Map<number, SeriesNode>();
  const visited = new Set<number>([startId]);

  let frontier: number[] = [startId];
  let rounds = 0;
  let requests = 0;
  let stop: string | null = null;

  while (frontier.length > 0 && stop === null) {
    if (rounds >= MAX_ROUNDS) {
      stop = `${MAX_ROUNDS} BFS rounds`;
      break;
    }
    rounds++;

    const batch = frontier;
    frontier = [];
    for (let i = 0; i < batch.length; i += IDS_PER_REQUEST) {
      if (requests >= MAX_REQUESTS) {
        stop = `${MAX_REQUESTS} requests`;
        break;
      }
      requests++;
      for (const node of await fetchSeriesNodes(batch.slice(i, i + IDS_PER_REQUEST))) {
        fetched.set(node.id, node);
      }
    }
    // The node cap is reached during expansion, one round before this: the
    // frontier it left behind is fetched above, then expansion stops here.
    if (stop === null && visited.size >= MAX_NODES) stop = `${MAX_NODES} nodes`;
    if (stop !== null) break;

    for (const id of batch) {
      const node = fetched.get(id);
      if (node === undefined) continue;
      // Symmetric split: a split show resolves standalone, so its own edges are
      // not followed. Only ever true for startId — every other split id is
      // refused at enqueue time below.
      if (splits.has(id)) continue;

      for (const edge of node.relations?.edges ?? []) {
        if (edge.node.type !== 'ANIME') continue;
        if (edge.relationType !== 'PREQUEL' && edge.relationType !== 'SEQUEL') continue;

        const nextId = edge.node.id;
        if (visited.has(nextId) || splits.has(nextId)) continue;
        visited.add(nextId);
        frontier.push(nextId);
        if (visited.size >= MAX_NODES) break;
      }
      if (visited.size >= MAX_NODES) break;
    }
  }

  if (stop !== null) {
    console.warn(`[series] Resolution of ${startId} stopped at ${stop}; graph may be incomplete.`);
  }

  const members = [...fetched.values()];
  if (members.length === 0) throw new SeriesResolutionError(startId);
  return buildSeriesGraph(members);
}

class SeriesResolver {
  /** member id -> graph. A lazily-rebuilt mirror of what the query cache holds. */
  private index = new Map<number, SeriesGraph>();
  private inFlight = new Map<number, Promise<SeriesGraph>>();
  /**
   * Resolutions run one at a time. AniList requests are serialized by the
   * shared rate limiter anyway, so this costs no wall time — and it lets each
   * resolution re-check the cache when its turn comes, which is how N cards of
   * one franchise collapse into a single walk even when their ids differ.
   */
  private chain: Promise<unknown> = Promise.resolve();
  private generation = 0;

  resolveSeries(showId: number): Promise<SeriesGraph> {
    // Overrides first, before any cache is consulted.
    const startId = readOverrides().merges[showId] ?? showId;

    const cached = this.lookup(startId);
    if (cached !== undefined) return Promise.resolve(cached);

    const pending = this.inFlight.get(startId);
    if (pending !== undefined) return pending;

    const promise = this.run(startId, showId);
    this.inFlight.set(startId, promise);
    const settle = () => {
      if (this.inFlight.get(startId) === promise) this.inFlight.delete(startId);
    };
    promise.then(settle, settle);
    return promise;
  }

  /** Drop every graph. Called whenever the user's overrides change. */
  invalidateAll(): void {
    this.generation++;
    this.index.clear();
    this.inFlight.clear();
    queryClient.removeQueries({ queryKey: queryKeys.series() });
  }

  private run(startId: number, requestedId: number): Promise<SeriesGraph> {
    const task = this.chain.then(async () => {
      // A franchise sibling may have resolved while this call waited its turn.
      const ready = this.lookup(startId);
      if (ready !== undefined) return ready;

      const generation = this.generation;
      const graph = await resolveFranchise(startId, readOverrides());
      // Overrides changed mid-walk: the result is already stale, so hand it to
      // this caller but do not publish it.
      if (generation === this.generation) this.prime(graph, [startId, requestedId]);
      return graph;
    });
    this.chain = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private lookup(showId: number): SeriesGraph | undefined {
    const inMemory = this.index.get(showId);
    if (inMemory !== undefined) return inMemory;

    const cached = queryClient.getQueryData<SeriesGraph>(queryKeys.seriesByShow(showId));
    if (cached !== undefined) {
      this.indexGraph(cached, [showId]);
      return cached;
    }
    return undefined;
  }

  private prime(graph: SeriesGraph, extraIds: number[]): void {
    for (const id of this.indexGraph(graph, extraIds)) {
      queryClient.setQueryData(queryKeys.seriesByShow(id), graph);
    }
  }

  /** `extraIds` carries merge sources, which are not members of the graph they redirect to. */
  private indexGraph(graph: SeriesGraph, extraIds: number[]): number[] {
    const ids = [...new Set([...graph.entries.map((e) => e.id), ...extraIds])];
    for (const id of ids) this.index.set(id, graph);
    return ids;
  }
}

export const seriesResolver = new SeriesResolver();

function overridesEqual(a: SeriesOverrides, b: SeriesOverrides): boolean {
  if (a === b) return true;
  if (a.splits.length !== b.splits.length) return false;
  if (a.splits.some((id, i) => id !== b.splits[i])) return false;
  const aKeys = Object.keys(a.merges);
  if (aKeys.length !== Object.keys(b.merges).length) return false;
  return aKeys.every((key) => a.merges[Number(key)] === b.merges[Number(key)]);
}

/**
 * Invalidation, wired the only way that has no import cycle: the resolver
 * watches the store, rather than the store calling the resolver. This covers
 * every write path — the overrides facade, a direct store action, clearAll —
 * without any of them having to remember to invalidate.
 *
 * The content comparison matters: persist rehydration replaces the overrides
 * object with an equal one on boot, and that must not wipe the graphs the
 * query persister just restored.
 */
let lastOverrides = useUserData.getState().overrides;
useUserData.subscribe((state) => {
  if (overridesEqual(state.overrides, lastOverrides)) return;
  lastOverrides = state.overrides;
  seriesResolver.invalidateAll();
});
