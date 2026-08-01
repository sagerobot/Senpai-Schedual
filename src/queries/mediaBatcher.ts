import { fetchAnimeByIds } from '../api/anilist/queries';
import type { AnimeMedia } from '../api/anilist/schemas';

/**
 * Same-tick coalescer for media-by-id lookups.
 *
 * A library of 200 shows mounts 200 `['media', id]` queries at once. Without
 * this they would be 200 AniList requests spaced 650ms apart by the rate
 * limiter. Everything requested inside one short window is instead folded into
 * a single `id_in` query (chunked at AniList's 50-per-page limit), and each
 * caller is handed its own record back out of the batch result.
 *
 * The important part is the miss path: an id AniList does not return resolves
 * as `null` rather than being dropped. The query layer caches that null, which
 * is what structurally prevents an unresolvable id from being re-requested on
 * every render forever.
 */

const BATCH_WINDOW_MS = 25;
const CHUNK_SIZE = 50;

interface Waiter {
  resolve: (media: AnimeMedia | null) => void;
  reject: (error: unknown) => void;
}

let pending = new Map<number, Waiter[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function fetchMediaBatched(id: number): Promise<AnimeMedia | null> {
  return new Promise<AnimeMedia | null>((resolve, reject) => {
    const waiters = pending.get(id);
    if (waiters) waiters.push({ resolve, reject });
    else pending.set(id, [{ resolve, reject }]);

    if (timer === null) timer = setTimeout(flush, BATCH_WINDOW_MS);
  });
}

function flush(): void {
  timer = null;
  const batch = pending;
  pending = new Map();

  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    void runChunk(ids.slice(i, i + CHUNK_SIZE), batch);
  }
}

async function runChunk(ids: number[], batch: Map<number, Waiter[]>): Promise<void> {
  try {
    const media = await fetchAnimeByIds(ids);
    const byId = new Map(media.map((m) => [m.id, m]));
    for (const id of ids) {
      const resolved = byId.get(id) ?? null;
      for (const waiter of batch.get(id) ?? []) waiter.resolve(resolved);
    }
  } catch (error) {
    // A failed chunk rejects only its own ids; the query layer retries them.
    for (const id of ids) {
      for (const waiter of batch.get(id) ?? []) waiter.reject(error);
    }
  }
}

/** Test hook: forget any batch that has not flushed yet. */
export function resetMediaBatcher(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  pending = new Map();
}
