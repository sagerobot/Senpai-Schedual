import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";
import type { VibeData } from "./schemas";

/**
 * In-memory LRU cache for AI output. No disk persistence — the deploy target
 * filesystem (Cloud Run) is ephemeral anyway, and the daily budgets bound the
 * worst-case rebuild cost after a restart.
 *
 * Keys are namespaced through typed helpers only, so namespaces cannot collide
 * (a client-supplied showId can no longer address another namespace: showId is
 * validated as a positive int before it ever reaches this module).
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const TTL = {
  summary: 30 * DAY,
  vibe: 7 * DAY,
  recReason: 14 * DAY,
  fallback: 1 * HOUR, // negative/fallback entries — retry-able soon, never hammered
} as const;

const cache = new LRUCache<string, string | VibeData>({ max: 5000 });

/** Short stable hash of the joined basedOn titles. */
function basedOnHash(basedOn: string[]): string {
  return createHash("sha1").update(basedOn.join("|")).digest("hex").slice(0, 10);
}

// --- summaries -------------------------------------------------------------

export function getSummary(showId: number): string | undefined {
  return cache.get(`summary:${showId}`) as string | undefined;
}

export function setSummary(showId: number, summary: string): void {
  cache.set(`summary:${showId}`, summary, { ttl: TTL.summary });
}

// --- community vibes -------------------------------------------------------

export function getVibe(showId: number, episodeNumber: number): VibeData | undefined {
  return cache.get(`vibe:${showId}:${episodeNumber}`) as VibeData | undefined;
}

export function setVibe(
  showId: number,
  episodeNumber: number,
  data: VibeData,
  options?: { fallback?: boolean },
): void {
  cache.set(`vibe:${showId}:${episodeNumber}`, data, {
    ttl: options?.fallback ? TTL.fallback : TTL.vibe,
  });
}

// --- recommendation reasons ------------------------------------------------

export function getRecReason(showId: number, basedOn: string[]): string | undefined {
  return cache.get(`rec:${showId}:${basedOnHash(basedOn)}`) as string | undefined;
}

export function setRecReason(showId: number, basedOn: string[], reason: string): void {
  cache.set(`rec:${showId}:${basedOnHash(basedOn)}`, reason, { ttl: TTL.recReason });
}

/** Fallback reasons (Gemini failed or budget exhausted) — cached briefly so
 * failures don't re-hit Gemini on every request, but recover within an hour. */
export function getRecReasonFallback(showId: number, basedOn: string[]): string | undefined {
  return cache.get(`fallback:rec:${showId}:${basedOnHash(basedOn)}`) as string | undefined;
}

export function setRecReasonFallback(showId: number, basedOn: string[], reason: string): void {
  cache.set(`fallback:rec:${showId}:${basedOnHash(basedOn)}`, reason, { ttl: TTL.fallback });
}
