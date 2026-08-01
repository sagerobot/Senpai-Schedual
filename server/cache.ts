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
 *
 * Every value is stored with the moment it was written and whether it is a
 * negative/fallback result, because `GET /api/cache-export` hands the harvestable
 * ones to the scheduled routine that folds them into the `data` branch — see
 * `exportableEntries` below for what qualifies and why.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const TTL = {
  summary: 30 * DAY,
  vibe: 7 * DAY,
  recReason: 14 * DAY,
  fallback: 1 * HOUR, // negative/fallback entries — retry-able soon, never hammered
} as const;

interface Entry {
  value: string | VibeData;
  /** Epoch ms. */
  storedAt: number;
  /** A negative result or a degraded stand-in, not a real reading. */
  fallback: boolean;
}

const cache = new LRUCache<string, Entry>({ max: 5000 });

function read(key: string): string | VibeData | undefined {
  return cache.get(key)?.value;
}

function write(key: string, value: string | VibeData, ttl: number, fallback = false): void {
  cache.set(key, { value, storedAt: Date.now(), fallback }, { ttl });
}

/** Short stable hash of the joined basedOn titles. */
function basedOnHash(basedOn: string[]): string {
  return createHash("sha1").update(basedOn.join("|")).digest("hex").slice(0, 10);
}

// --- summaries -------------------------------------------------------------

export function getSummary(showId: number): string | undefined {
  return read(`summary:${showId}`) as string | undefined;
}

export function setSummary(showId: number, summary: string): void {
  write(`summary:${showId}`, summary, TTL.summary);
}

// --- community vibes -------------------------------------------------------

export function getVibe(showId: number, episodeNumber: number): VibeData | undefined {
  return read(`vibe:${showId}:${episodeNumber}`) as VibeData | undefined;
}

export function setVibe(
  showId: number,
  episodeNumber: number,
  data: VibeData,
  options?: { fallback?: boolean },
): void {
  const fallback = options?.fallback === true;
  write(`vibe:${showId}:${episodeNumber}`, data, fallback ? TTL.fallback : TTL.vibe, fallback);
}

// --- recommendation reasons ------------------------------------------------

export function getRecReason(showId: number, basedOn: string[]): string | undefined {
  return read(`rec:${showId}:${basedOnHash(basedOn)}`) as string | undefined;
}

export function setRecReason(showId: number, basedOn: string[], reason: string): void {
  write(`rec:${showId}:${basedOnHash(basedOn)}`, reason, TTL.recReason);
}

/** Fallback reasons (Gemini failed or budget exhausted) — cached briefly so
 * failures don't re-hit Gemini on every request, but recover within an hour. */
export function getRecReasonFallback(showId: number, basedOn: string[]): string | undefined {
  return read(`fallback:rec:${showId}:${basedOnHash(basedOn)}`) as string | undefined;
}

export function setRecReasonFallback(showId: number, basedOn: string[], reason: string): void {
  write(`fallback:rec:${showId}:${basedOnHash(basedOn)}`, reason, TTL.fallback);
}

// --- harvest ---------------------------------------------------------------

export interface ExportedEntry {
  key: string;
  value: string | VibeData;
  /** ISO 8601. */
  storedAt: string;
}

/** Namespaces worth persisting to the `data` branch. */
const EXPORTABLE_PREFIXES = ["summary:", "vibe:"] as const;

/**
 * Everything a visitor's live request paid for that is worth keeping forever.
 *
 * Two exclusions, both deliberate:
 *
 * - **Recommendation reasons are skipped.** They are keyed by a hash of one
 *   user's top-rated titles, so they are neither shared nor reusable, and they
 *   are the one namespace shaped by private data.
 * - **Fallback entries are skipped**, which for vibes means "no discussion
 *   thread found". The routine folds harvested vibes in as *settled*, and a
 *   just-aired episode whose thread does not exist yet would then be frozen as
 *   permanently thread-less. Not-found is only ever established by the hourly
 *   routine, which knows when the episode aired.
 */
export function exportableEntries(): ExportedEntry[] {
  const out: ExportedEntry[] = [];
  for (const [key, entry] of cache.entries()) {
    if (entry.fallback) continue;
    if (!EXPORTABLE_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    out.push({ key, value: entry.value, storedAt: new Date(entry.storedAt).toISOString() });
  }
  return out;
}
