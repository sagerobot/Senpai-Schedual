import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { AnimeMedia } from '../api/anilist/schemas';
import { fetchAnimeByIds } from '../api/anilist/queries';
import { fetchMediaBatched, resetMediaBatcher } from './mediaBatcher';

vi.mock('../api/anilist/queries', () => ({
  fetchAnimeByIds: vi.fn(),
}));

const mockFetch = fetchAnimeByIds as Mock<(ids: number[]) => Promise<AnimeMedia[]>>;

/** Only the fields the batcher touches; the rest never leaves the mock. */
function media(id: number): AnimeMedia {
  return { id } as AnimeMedia;
}

/** Resolve everything the batch window and its request chain have queued. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await vi.advanceTimersByTimeAsync(30);
  }
}

describe('media micro-batcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetMediaBatcher();
    mockFetch.mockReset();
  });

  afterEach(() => {
    resetMediaBatcher();
    vi.useRealTimers();
  });

  it('folds ids requested in the same tick into one request', async () => {
    mockFetch.mockImplementation(async (ids) => ids.map(media));

    const results = Promise.all([fetchMediaBatched(1), fetchMediaBatched(2), fetchMediaBatched(3)]);
    await settle();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toEqual([1, 2, 3]);
    expect((await results).map((m) => m?.id)).toEqual([1, 2, 3]);
  });

  it('serves a repeated id from the same batch entry', async () => {
    mockFetch.mockImplementation(async (ids) => ids.map(media));

    const results = Promise.all([fetchMediaBatched(7), fetchMediaBatched(7), fetchMediaBatched(8)]);
    await settle();

    expect(mockFetch.mock.calls[0][0]).toEqual([7, 8]);
    expect((await results).map((m) => m?.id)).toEqual([7, 7, 8]);
  });

  it('resolves an id AniList does not return as null rather than leaving it pending', async () => {
    // 404 is the loop-inducing case: the old effects treated a missing id as
    // "still not loaded" and asked again forever.
    mockFetch.mockImplementation(async (ids) => ids.filter((id) => id !== 999).map(media));

    const results = Promise.all([fetchMediaBatched(1), fetchMediaBatched(999)]);
    await settle();

    expect(await results).toEqual([media(1), null]);
  });

  it('splits more than 50 ids into chunked requests', async () => {
    mockFetch.mockImplementation(async (ids) => ids.map(media));

    const ids = Array.from({ length: 120 }, (_, i) => i + 1);
    const results = Promise.all(ids.map(fetchMediaBatched));
    await settle();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls.map((call) => call[0].length)).toEqual([50, 50, 20]);
    expect((await results).map((m) => m?.id)).toEqual(ids);
  });

  it('rejects only the ids in a chunk that failed', async () => {
    mockFetch.mockImplementation(async (ids) => {
      if (ids.includes(1)) throw new Error('AniList is down');
      return ids.map(media);
    });

    const ids = Array.from({ length: 60 }, (_, i) => i + 1);
    const settled = Promise.allSettled(ids.map(fetchMediaBatched));
    await settle();

    const outcomes = await settled;
    expect(outcomes.slice(0, 50).every((r) => r.status === 'rejected')).toBe(true);
    expect(outcomes.slice(50).every((r) => r.status === 'fulfilled')).toBe(true);
  });
});
