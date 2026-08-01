import { Router } from "express";
import { parseVibesFile, vibeKey, type VibeEntry } from "../../src/lib/vibesFile";

/**
 * GET /api/vibes — every remembered r/anime episode sentiment.
 *
 * The file is written by the hourly scheduled routine (docs/vibes-refresh.md),
 * committed to the repo's `data` branch, and relayed from there by this route —
 * the same arrangement as `/api/season`, with two differences that follow from
 * what the file is:
 *
 * - **A 10-minute memory TTL**, not 30. Entries for episodes that aired in the
 *   last day are rewritten hourly, and a release-day viewer asking "how was it"
 *   is the whole point; holding a half-hour-old copy would routinely answer with
 *   a reading we have already replaced.
 * - **The parsed index is kept alongside the raw file**, because
 *   `/api/community-vibe` consults it before spending a grounded Gemini call.
 *   That short circuit is where the money is saved; the route below is just how
 *   the client paints chips without asking per episode.
 *
 * Two states, both normal: `200 { status: "ok", vibes }`, or
 * `404 { status: "unavailable" }` when VIBES_BUNDLE_URL is unset or nothing has
 * ever loaded. Unavailable is not an error — the client simply offers the
 * click-to-load vibe check it always did.
 */

export const vibesRouter = Router();

const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
/** One attempt a minute while upstream is down — see the same note in season.ts. */
const FAILURE_BACKOFF_MS = 60_000;

interface CachedVibes {
  /** The raw parsed JSON, relayed as-is: a field a newer script adds must survive. */
  raw: unknown;
  /** Key -> entry, for the /api/community-vibe short circuit. */
  index: Map<string, VibeEntry>;
  fetchedAt: number;
}

let cached: CachedVibes | null = null;
/** Deduplicates a burst of cold requests into one upstream fetch. */
let inFlight: Promise<CachedVibes | null> | null = null;
let retryAt = 0;
let failureLogged = false;

function vibesUrl(): string | undefined {
  const url = process.env.VIBES_BUNDLE_URL?.trim();
  return url === "" ? undefined : url;
}

async function fetchVibes(url: string): Promise<CachedVibes> {
  const headers: Record<string, string> = { Accept: "application/json" };
  // Shared with the season bundle: both files live on the same private branch.
  const token = process.env.SEASON_BUNDLE_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`vibes host responded ${response.status}`);

  const raw: unknown = await response.json();
  const parsed = parseVibesFile(raw);
  if (parsed === null) throw new Error("vibes file failed validation");

  return { raw, index: new Map(Object.entries(parsed.entries)), fetchedAt: Date.now() };
}

async function loadVibes(): Promise<CachedVibes | null> {
  const url = vibesUrl();
  if (url === undefined) return null;
  if (cached !== null && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;
  // Inside a failure backoff, answer from memory at once rather than making this
  // request wait on an upstream that just failed.
  if (Date.now() < retryAt) return cached;
  if (inFlight !== null) return inFlight;

  inFlight = (async () => {
    try {
      const fresh = await fetchVibes(url);
      cached = fresh;
      retryAt = 0;
      failureLogged = false;
      console.log(`[vibes] file loaded: ${fresh.index.size} entries`);
      return fresh;
    } catch (err) {
      retryAt = Date.now() + FAILURE_BACKOFF_MS;
      if (!failureLogged) {
        failureLogged = true;
        const reason = err instanceof Error ? err.message : String(err);
        // Stale-on-error: remembered sentiment does not rot, so an old copy is
        // worth far more than dropping every visitor back onto paid searches.
        console.warn(
          cached !== null
            ? `[vibes] refresh failed (${reason}); still serving the ${cached.index.size} entries in memory`
            : `[vibes] file unavailable (${reason}); vibe checks will run live`,
        );
      }
      return cached;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * The remembered reading for one episode, or `undefined`.
 *
 * `/api/community-vibe` awaits this before anything else it does. When
 * VIBES_BUNDLE_URL is unset it returns immediately, so a deployment without a
 * vibes file pays nothing for the lookup.
 */
export async function getStoredVibe(showId: number, episode: number): Promise<VibeEntry | undefined> {
  const entry = await loadVibes();
  return entry?.index.get(vibeKey(showId, episode));
}

vibesRouter.get("/vibes", async (_req, res) => {
  const entry = await loadVibes();
  if (entry === null) {
    res.status(404).json({ status: "unavailable" });
    return;
  }
  // Matches the memory TTL: the hot entries in here change hourly at most.
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ status: "ok", vibes: entry.raw });
});
