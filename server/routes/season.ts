import { Router } from "express";
import { seasonBundleEnvelopeSchema } from "../../src/lib/seasonBundle";

/**
 * GET /api/season — the precomputed season bundle.
 *
 * The bundle is built by `npm run data:build`, committed to the repo's `data`
 * branch by a scheduled task (docs/season-refresh.md), and fetched from there by
 * this route. The server holds it in memory for 30 minutes so a busy instance
 * hits GitHub roughly twice an hour, never once per visitor.
 *
 * Two states, both normal:
 *
 * - `200 { status: "ok", bundle }` — a bundle is configured and loaded.
 * - `404 { status: "unavailable" }` — no SEASON_BUNDLE_URL, or none has ever
 *   loaded. This is **not** an error: the client falls back to fetching AniList
 *   live, which is exactly what it did before this route existed. Nothing about
 *   a missing bundle should read as a failure in logs or in the UI.
 *
 * Stale-on-error is deliberate. A bundle that is a few hours past its refresh is
 * worth far more than nothing, and the client applies its own 24-hour freshness
 * gate anyway — so a refresh failure keeps serving the copy in memory rather
 * than dropping every visitor onto the slow path at once.
 */

export const seasonRouter = Router();

const CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
/**
 * How long a failure suppresses further attempts. Without this, a misconfigured
 * URL or a GitHub outage costs *every* visitor a fetch — up to a full timeout
 * each — which is precisely the "worse than no bundle at all" outcome this
 * feature must never produce. One attempt a minute is enough to notice recovery.
 */
const FAILURE_BACKOFF_MS = 60_000;

interface CachedBundle {
  /** The raw parsed JSON, relayed as-is: the server validates shape, not content. */
  bundle: unknown;
  fetchedAt: number;
  generatedAt: string;
  showCount: number;
}

let cached: CachedBundle | null = null;
/** Deduplicates a burst of cold requests into one upstream fetch. */
let inFlight: Promise<CachedBundle | null> | null = null;
/** No upstream attempt before this timestamp — see FAILURE_BACKOFF_MS. */
let retryAt = 0;
/** One log line per failure streak, re-armed by the next success. */
let failureLogged = false;

function bundleUrl(): string | undefined {
  const url = process.env.SEASON_BUNDLE_URL?.trim();
  return url === "" ? undefined : url;
}

async function fetchBundle(url: string): Promise<CachedBundle> {
  const headers: Record<string, string> = { Accept: "application/json" };
  // Needed while the repo is private: raw.githubusercontent.com refuses
  // anonymous reads there. A fine-grained read-only PAT is enough.
  const token = process.env.SEASON_BUNDLE_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`bundle host responded ${response.status}`);

  const raw: unknown = await response.json();
  const parsed = seasonBundleEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`bundle failed validation: ${parsed.error.issues[0]?.message ?? "unknown shape"}`);
  }

  return {
    // The original object, not the parse result: a field a newer build script
    // adds must survive an older server.
    bundle: raw,
    fetchedAt: Date.now(),
    generatedAt: parsed.data.generatedAt,
    showCount: parsed.data.shows.length,
  };
}

async function loadBundle(): Promise<CachedBundle | null> {
  const url = bundleUrl();
  if (url === undefined) return null;
  if (cached !== null && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;
  // Inside a failure backoff, answer from memory (or say unavailable) at once
  // rather than making this request wait on an upstream that just failed.
  if (Date.now() < retryAt) return cached;
  if (inFlight !== null) return inFlight;

  inFlight = (async () => {
    try {
      const fresh = await fetchBundle(url);
      cached = fresh;
      retryAt = 0;
      failureLogged = false;
      console.log(`[season] bundle loaded: ${fresh.showCount} shows, generated ${fresh.generatedAt}`);
      return fresh;
    } catch (err) {
      retryAt = Date.now() + FAILURE_BACKOFF_MS;
      if (!failureLogged) {
        failureLogged = true;
        const reason = err instanceof Error ? err.message : String(err);
        // Stale-on-error: a bundle a few hours past its refresh is worth far
        // more than dropping every visitor onto the slow path at once.
        console.warn(
          cached !== null
            ? `[season] refresh failed (${reason}); still serving the copy generated ${cached.generatedAt}`
            : `[season] bundle unavailable (${reason}); clients will use the live path`,
        );
      }
      return cached;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

seasonRouter.get("/season", async (_req, res) => {
  const entry = await loadBundle();
  if (entry === null) {
    res.status(404).json({ status: "unavailable" });
    return;
  }
  // The upstream file changes every few hours; a short browser cache absorbs
  // reload storms without ever holding a bundle long enough to matter.
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ status: "ok", bundle: entry.bundle });
});
