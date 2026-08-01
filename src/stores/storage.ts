import type { ZodType } from 'zod';

/**
 * The single localStorage touchpoint.
 *
 * All new code reads/writes localStorage through this module. Reads are
 * guarded (bad JSON or schema mismatches fall back instead of throwing) and
 * writes implement the quota policy: on QuotaExceededError the re-fetchable
 * query cache is evicted and the write retried once before reporting failure.
 */

/** The TanStack Query persister blob — pure re-fetchable cache, evicted first on quota pressure. */
export const QUERY_CACHE_KEY = 'senpai.queryCache.v1';

export type WriteResult = { ok: true } | { ok: false; reason: 'quota' | 'error' };

function isQuotaExceeded(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return err.name === 'QuotaExceededError' || err.code === 22;
  }
  return err instanceof Error && err.name === 'QuotaExceededError';
}

/**
 * Read and validate a JSON value from localStorage.
 * Missing, corrupt, or schema-mismatched values return `fallback` (with one
 * console.warn for the corrupt/mismatched cases). Never throws.
 */
export function readJSON<T>(key: string, schema: ZodType<T>, fallback: T): T {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch (err) {
    console.warn(`[storage] Failed to read "${key}"; using fallback.`, err);
    return fallback;
  }
  if (raw === null) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[storage] Corrupt JSON at "${key}"; using fallback.`, err);
    return fallback;
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    console.warn(`[storage] Value at "${key}" failed validation; using fallback.`, result.error.issues);
    return fallback;
  }
  return result.data;
}

/**
 * Serialize and write a value. On QuotaExceededError, evicts the query cache
 * and retries once; reports `{ ok: false, reason: 'quota' }` if that also
 * fails. Never throws.
 */
export function writeJSON(key: string, value: unknown): WriteResult {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch (err) {
    console.warn(`[storage] Could not serialize value for "${key}".`, err);
    return { ok: false, reason: 'error' };
  }

  try {
    localStorage.setItem(key, serialized);
    return { ok: true };
  } catch (err) {
    if (!isQuotaExceeded(err)) {
      console.warn(`[storage] Failed to write "${key}".`, err);
      return { ok: false, reason: 'error' };
    }
  }

  // Quota pressure: evict the re-fetchable query cache and retry once.
  try {
    localStorage.removeItem(QUERY_CACHE_KEY);
  } catch {
    // ignore — the retry below will report the outcome
  }
  try {
    localStorage.setItem(key, serialized);
    return { ok: true };
  } catch (err) {
    console.warn(`[storage] Write of "${key}" still failing after cache eviction.`, err);
    return { ok: false, reason: isQuotaExceeded(err) ? 'quota' : 'error' };
  }
}

/** Remove a key. Never throws. */
export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[storage] Failed to remove "${key}".`, err);
  }
}
