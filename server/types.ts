/**
 * Shared AI response envelope returned by every /api AI route.
 * Mirrored by the client's zod schemas.
 */
export type AiEnvelope<T> =
  | { status: "ok"; cached: boolean; data: T } // HTTP 200
  | { status: "no_key" } // HTTP 503 — GEMINI_API_KEY absent
  | { status: "resting"; retryAfterSeconds: number } // HTTP 503 + Retry-After — daily budget spent
  | { status: "error"; message: string }; // HTTP 502 upstream failure; 400 validation; 429 rate limit
