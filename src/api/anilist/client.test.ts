import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AniListGraphQLError,
  AniListHttpError,
  AniListNetworkError,
  AniListRateLimitError,
  AniListSchemaError,
  anilistLimiter,
  anilistRequest,
} from './client';

function makeResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => body,
  } as unknown as Response;
}

const okBody = (data: unknown) => ({ data });
const AnySchema = z.record(z.string(), z.unknown());

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  anilistLimiter.reset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('anilistRequest', () => {
  it('throws a typed error on HTTP 500 instead of returning an empty result', async () => {
    fetchMock.mockResolvedValue(makeResponse(500, 'Internal Server Error'));

    const err = await anilistRequest('query', {}, AnySchema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AniListHttpError);
    expect((err as AniListHttpError).status).toBe(500);
  });

  it('throws when the response carries a GraphQL errors array', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, { data: null, errors: [{ message: 'boom' }] }));

    const err = await anilistRequest('query', {}, AnySchema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AniListGraphQLError);
    expect((err as AniListGraphQLError).messages).toEqual(['boom']);
  });

  it('surfaces AniListSchemaError when the data violates the schema', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, okBody({ Page: { media: 'not-an-array' } })));

    const schema = z.object({ Page: z.object({ media: z.array(z.unknown()) }) });
    await expect(anilistRequest('query', {}, schema)).rejects.toBeInstanceOf(AniListSchemaError);
  });

  it('retries a 429 after the Retry-After delay', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(429, null, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(makeResponse(200, okBody({ value: 1 })));

    const promise = anilistRequest('query', {}, AnySchema);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Just shy of the Retry-After window: still only one attempt.
    await vi.advanceTimersByTimeAsync(1_900);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(promise).resolves.toEqual({ value: 1 });
  });

  it('gives up after 4 attempts of sustained 429s', async () => {
    fetchMock.mockResolvedValue(makeResponse(429, null, { 'Retry-After': '2' }));

    const promise = anilistRequest('query', {}, AnySchema);
    const assertion = expect(promise).rejects.toBeInstanceOf(AniListRateLimitError);

    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  /**
   * In a browser, AniList's 429 carries no CORS headers, so fetch rejects with a
   * TypeError and the status is never seen. These cover that shape.
   */
  describe('a fetch that rejects with no readable status', () => {
    const opaque = () => new TypeError('NetworkError when attempting to fetch resource.');

    it('backs off and retries, holding every queued request meanwhile', async () => {
      const starts: number[] = [];
      fetchMock.mockImplementation(async () => {
        starts.push(Date.now());
        if (starts.length === 1) throw opaque();
        return makeResponse(200, okBody({ value: 1 }));
      });

      const first = anilistRequest('query one', {}, AnySchema);
      const second = anilistRequest('query two', {}, AnySchema);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Inside the 5s back-off nothing goes out — not the retry, and not the
      // second request queued behind it. This is the storm the old code ran.
      await vi.advanceTimersByTimeAsync(4_900);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(10_000);
      await expect(first).resolves.toEqual({ value: 1 });
      await expect(second).resolves.toEqual({ value: 1 });
      expect(starts).toHaveLength(3);
      expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(5_000);
    });

    it('gives up with AniListNetworkError after four attempts spanning a full window', async () => {
      fetchMock.mockImplementation(async () => {
        throw opaque();
      });

      const promise = anilistRequest('query', {}, AnySchema);
      const assertion = expect(promise).rejects.toBeInstanceOf(AniListNetworkError);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 5s + 15s + 40s: the fourth attempt lands 60s after the first failure.
      await vi.advanceTimersByTimeAsync(59_000);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(2_000);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('does not retry a rejection that is not a transport failure', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));

      await expect(anilistRequest('query', {}, AnySchema)).rejects.toThrow('aborted');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe('anilistLimiter', () => {
  it('spaces two concurrent requests at least 650ms apart', async () => {
    const starts: number[] = [];
    fetchMock.mockImplementation(async () => {
      starts.push(Date.now());
      return makeResponse(200, okBody({ value: 1 }));
    });

    const p1 = anilistRequest('query one', {}, AnySchema);
    const p2 = anilistRequest('query two', {}, AnySchema);

    await vi.advanceTimersByTimeAsync(2_000);
    await Promise.all([p1, p2]);

    expect(starts).toHaveLength(2);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(650);
  });

  it('pauses queued requests globally while a 429 Retry-After is outstanding', async () => {
    const starts: number[] = [];
    fetchMock.mockImplementation(async () => {
      starts.push(Date.now());
      if (starts.length === 1) {
        return makeResponse(429, null, { 'Retry-After': '10' });
      }
      return makeResponse(200, okBody({ value: 1 }));
    });

    const began = Date.now();
    const first = anilistRequest('query one', {}, AnySchema);
    const second = anilistRequest('query two', {}, AnySchema);

    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.all([first, second]);

    // The second request must not start before the 10s Retry-After expires.
    expect(starts[1] - began).toBeGreaterThanOrEqual(10_000);
  });

  const budget = (remaining: string) => ({ 'X-RateLimit-Limit': '30', 'X-RateLimit-Remaining': remaining });

  it('keeps the 650ms pace while the window has budget', async () => {
    fetchMock.mockImplementation(async () => makeResponse(200, okBody({ value: 1 }), budget('20')));

    const p1 = anilistRequest('query one', {}, AnySchema);
    const p2 = anilistRequest('query two', {}, AnySchema);
    await vi.advanceTimersByTimeAsync(700);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await Promise.all([p1, p2]);
  });

  it('pauses for the rest of the window when X-RateLimit-Remaining runs low', async () => {
    const starts: number[] = [];
    fetchMock.mockImplementation(async () => {
      starts.push(Date.now());
      return makeResponse(200, okBody({ value: 1 }), budget(starts.length === 1 ? '2' : '28'));
    });

    const began = Date.now();
    const first = anilistRequest('query one', {}, AnySchema);
    const second = anilistRequest('query two', {}, AnySchema);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The window opened with the first request, so it closes 60s (+ margin)
    // after it — the second request waits that out rather than eating a 429.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.all([first, second]);
    expect(starts[1] - began).toBeGreaterThanOrEqual(61_500);
  });

  it('pins the window edge to the request that opened it', async () => {
    // Joined mid-window at t=0 (remaining 10); a fresh window opens with the
    // request at t=30s (remaining = limit - 1); the budget runs out at t=31s.
    // The pause must run to the new window's edge — 30s + 60s + margin — not
    // to the estimate made at t=0.
    const starts: number[] = [];
    const remainingByCall = ['10', '29', '1'];
    fetchMock.mockImplementation(async () => {
      starts.push(Date.now());
      return makeResponse(200, okBody({ value: 1 }), budget(remainingByCall[starts.length - 1] ?? '28'));
    });

    const began = Date.now();
    await anilistRequest('query one', {}, AnySchema);
    await vi.advanceTimersByTimeAsync(30_000);
    await anilistRequest('query two', {}, AnySchema);
    await vi.advanceTimersByTimeAsync(1_000);
    await anilistRequest('query three', {}, AnySchema);

    const fourth = anilistRequest('query four', {}, AnySchema);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(3_000);
    await fourth;
    expect(starts[3] - began).toBeGreaterThanOrEqual(91_500);
  });
});
