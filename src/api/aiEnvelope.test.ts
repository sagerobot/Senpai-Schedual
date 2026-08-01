import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { parseEnvelope, postEnvelope } from './aiEnvelope';

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function makeNonJsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON');
    },
  } as unknown as Response;
}

const PayloadSchema = z.object({ summary: z.string() });

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseEnvelope', () => {
  it('parses a 200 ok envelope and validates the payload', async () => {
    const res = makeResponse(200, { status: 'ok', cached: true, data: { summary: 'A quiet adventure.' } });

    const result = await parseEnvelope(res, PayloadSchema);
    expect(result).toEqual({ kind: 'ok', cached: true, data: { summary: 'A quiet adventure.' } });
  });

  it('turns an ok envelope with a payload that fails the schema into an error', async () => {
    const res = makeResponse(200, { status: 'ok', cached: false, data: { summary: 42 } });

    const result = await parseEnvelope(res, PayloadSchema);
    expect(result).toEqual({ kind: 'error', message: 'AI response payload failed validation' });
  });

  it('maps a 503 no_key envelope to kind no_key', async () => {
    const res = makeResponse(503, { status: 'no_key' });

    await expect(parseEnvelope(res, PayloadSchema)).resolves.toEqual({ kind: 'no_key' });
  });

  it('maps a 503 resting envelope to kind resting with retryAfterSeconds', async () => {
    const res = makeResponse(503, { status: 'resting', retryAfterSeconds: 3600 });

    await expect(parseEnvelope(res, PayloadSchema)).resolves.toEqual({
      kind: 'resting',
      retryAfterSeconds: 3600,
    });
  });

  it('maps 400/429/502 error envelopes to kind error with the server message', async () => {
    for (const status of [400, 429, 502]) {
      const res = makeResponse(status, { status: 'error', message: 'showId: expected number' });
      await expect(parseEnvelope(res, PayloadSchema)).resolves.toEqual({
        kind: 'error',
        message: 'showId: expected number',
      });
    }
  });

  it('turns a non-JSON body into kind error carrying the HTTP status', async () => {
    const result = await parseEnvelope(makeNonJsonResponse(500), PayloadSchema);
    expect(result).toEqual({ kind: 'error', message: 'AI request failed (HTTP 500)' });
  });

  it('turns a JSON body that is not an envelope into kind error', async () => {
    const result = await parseEnvelope(makeResponse(200, { summary: 'bare legacy payload' }), PayloadSchema);
    expect(result.kind).toBe('error');
  });
});

describe('postEnvelope', () => {
  it('POSTs a JSON body and parses the envelope from the response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(200, { status: 'ok', cached: false, data: { summary: 'Fresh.' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await postEnvelope('/api/generate-summary', { showId: 1 }, PayloadSchema);

    expect(result).toEqual({ kind: 'ok', cached: false, data: { summary: 'Fresh.' } });
    expect(fetchMock).toHaveBeenCalledWith('/api/generate-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showId: 1 }),
    });
  });

  it('turns a network failure into kind error instead of rejecting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(postEnvelope('/api/generate-summary', {}, PayloadSchema)).resolves.toEqual({
      kind: 'error',
      message: 'Could not reach the server',
    });
  });
});
