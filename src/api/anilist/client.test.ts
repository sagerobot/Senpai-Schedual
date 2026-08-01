import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AniListGraphQLError,
  AniListHttpError,
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
});
