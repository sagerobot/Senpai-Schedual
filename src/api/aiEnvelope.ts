import { z } from 'zod';
import type { ZodType } from 'zod';

/**
 * Client half of the AI response envelope (see server/types.ts). Every /api AI
 * route answers with one of:
 *
 * - HTTP 200 `{ status: "ok", cached, data }`
 * - HTTP 503 `{ status: "no_key" }` — GEMINI_API_KEY absent
 * - HTTP 503 `{ status: "resting", retryAfterSeconds }` — daily budget spent
 * - HTTP 400/429/502 `{ status: "error", message }`
 *
 * `parseEnvelope` turns any of those (plus non-JSON bodies) into a discriminated
 * result; `postEnvelope` additionally absorbs network failures. Neither throws.
 */

/** The four availability states every AI-driven UI surface renders from. */
export type AiAvailability = 'ok' | 'no_key' | 'resting' | 'error';

export type EnvelopeResult<T> =
  | { kind: 'ok'; data: T; cached: boolean }
  | { kind: 'no_key' }
  | { kind: 'resting'; retryAfterSeconds: number }
  | { kind: 'error'; message: string };

const EnvelopeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), cached: z.boolean().catch(false), data: z.unknown() }),
  z.object({ status: z.literal('no_key') }),
  z.object({ status: z.literal('resting'), retryAfterSeconds: z.number().int().nonnegative().catch(0) }),
  z.object({ status: z.literal('error'), message: z.string().catch('AI request failed') }),
]);

/**
 * Parse an AI route response into an EnvelopeResult. The body's `status`
 * discriminator is authoritative; unrecognized shapes and non-JSON bodies
 * collapse to `kind: "error"` with the HTTP status for context.
 */
export async function parseEnvelope<T>(res: Response, dataSchema: ZodType<T>): Promise<EnvelopeResult<T>> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { kind: 'error', message: `AI request failed (HTTP ${res.status})` };
  }

  const envelope = EnvelopeSchema.safeParse(body);
  if (!envelope.success) {
    return { kind: 'error', message: `AI request returned an unrecognized response (HTTP ${res.status})` };
  }

  const env = envelope.data;
  if (env.status === 'ok') {
    const data = dataSchema.safeParse(env.data);
    if (!data.success) {
      console.warn('[aiEnvelope] ok payload failed validation', data.error.issues);
      return { kind: 'error', message: 'AI response payload failed validation' };
    }
    return { kind: 'ok', data: data.data, cached: env.cached };
  }
  if (env.status === 'no_key') return { kind: 'no_key' };
  if (env.status === 'resting') return { kind: 'resting', retryAfterSeconds: env.retryAfterSeconds };
  return { kind: 'error', message: env.message };
}

/**
 * POST a JSON body to an AI route and parse the envelope. Network failures
 * (server down, offline) become `kind: "error"` instead of a rejection.
 */
export async function postEnvelope<T>(
  url: string,
  body: unknown,
  dataSchema: ZodType<T>,
): Promise<EnvelopeResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: 'error', message: 'Could not reach the server' };
  }
  return parseEnvelope(res, dataSchema);
}
