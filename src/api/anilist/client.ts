import type { ZodType } from 'zod';

const ANILIST_URL = 'https://graphql.anilist.co';

const MAX_ATTEMPTS = 4;
const DEFAULT_RETRY_AFTER_MS = 2_000;
const MAX_RETRY_AFTER_MS = 60_000;
const MIN_REQUEST_GAP_MS = 650;

/**
 * AniList's limit is per minute — 30 requests while its API sits in its
 * long-running "degraded" state, 90 nominally — counted in a fixed window that
 * opens on the first request and closes sixty seconds later. The budget itself
 * comes back in every response (`X-RateLimit-Limit` / `-Remaining`, both
 * CORS-exposed); the window length does not, so it is assumed here.
 */
const RATE_WINDOW_MS = 60_000;
/**
 * Stop short of the last requests in a window. Another tab on the same IP
 * shares the budget and would otherwise walk straight into the 429.
 */
const RATE_WINDOW_RESERVE = 2;
/** Slack past the estimated window edge, for clock drift between us and AniList. */
const RATE_WINDOW_MARGIN_MS = 1_500;
/**
 * Back-off after a request that failed with no readable status (see
 * `anilistRequest`). Escalating, and summing to one full window: if the failure
 * was a rate limit, the fourth attempt is guaranteed to land in a fresh one.
 */
const OPAQUE_FAILURE_BACKOFF_MS = [5_000, 15_000, 40_000] as const;

export class AniListHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`AniList request failed with HTTP ${status}`);
    this.name = 'AniListHttpError';
    this.status = status;
  }
}

export class AniListGraphQLError extends Error {
  readonly messages: string[];
  constructor(messages: string[]) {
    super(`AniList returned GraphQL errors: ${messages.join('; ')}`);
    this.name = 'AniListGraphQLError';
    this.messages = messages;
  }
}

export class AniListSchemaError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`AniList response failed schema validation: ${issues.join('; ')}`);
    this.name = 'AniListSchemaError';
    this.issues = issues;
  }
}

export class AniListRateLimitError extends Error {
  constructor() {
    super(`AniList rate limit persisted after ${MAX_ATTEMPTS} attempts`);
    this.name = 'AniListRateLimitError';
  }
}

/**
 * The request never produced a response we could read. In a browser this is
 * almost always AniList rate limiting us (its 429s carry no CORS headers, so
 * the status is invisible); the message is worded for the person who sees it.
 */
export class AniListNetworkError extends Error {
  constructor(cause: unknown) {
    super(
      `AniList could not be reached after ${MAX_ATTEMPTS} attempts. It is probably rate limiting this connection; try again in a minute.`,
      { cause },
    );
    this.name = 'AniListNetworkError';
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Global AniList rate limiter: a module-level promise queue shared by every
 * request in the app (list fetchers, search, MAL import, the series resolver,
 * and the season-bundle build script). Concurrency 1, at least
 * MIN_REQUEST_GAP_MS between request starts, plus a global pause whenever the
 * window is known or believed to be spent — a 429's Retry-After, a low
 * `X-RateLimit-Remaining`, or a failure with no readable status. Request storms
 * are structurally impossible.
 *
 * The window edge is estimated, never assumed known: it is the start of our
 * first request after the last pause or idle minute, refined to the exact
 * request whenever a response reports a full budget minus one. The estimate
 * can only err late — the real window cannot have opened *after* our first
 * request in it — so waiting from that request never resumes too early.
 */
class AniListRateLimiter {
  private queue: Promise<void> = Promise.resolve();
  private lastStart = 0;
  private pausedUntil = 0;
  /** When the current window is believed to have opened; null when the next request opens one. */
  private windowOpenedAt: number | null = null;

  schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      for (;;) {
        const now = Date.now();
        const readyAt = Math.max(this.lastStart + MIN_REQUEST_GAP_MS, this.pausedUntil);
        if (now >= readyAt) break;
        await sleep(readyAt - now);
      }
      const now = Date.now();
      this.lastStart = now;
      if (this.windowOpenedAt === null || now - this.windowOpenedAt >= RATE_WINDOW_MS) {
        this.windowOpenedAt = now;
      }
      return task();
    });
    // Keep the chain alive even when a task rejects.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Read AniList's rate-limit headers off the response to the request that is
   * currently running (call it from inside the scheduled task, so `lastStart`
   * is still that request's). When the window is nearly spent, everything
   * queued waits for the next one instead of finding out the hard way.
   */
  observe(headers: Pick<Headers, 'get'>): void {
    // A response without the header has no opinion — `Number(null)` is 0, which
    // would read as "budget spent" and pause the queue for a minute.
    const remainingHeader = headers.get('X-RateLimit-Remaining');
    if (remainingHeader === null) return;
    const remaining = Number(remainingHeader);
    if (!Number.isFinite(remaining)) return;
    const limit = Number(headers.get('X-RateLimit-Limit') ?? NaN);
    // The first request of a window is the one response that pins the edge
    // exactly rather than by estimate.
    if (Number.isFinite(limit) && remaining === limit - 1) this.windowOpenedAt = this.lastStart;
    if (remaining <= RATE_WINDOW_RESERVE) this.pauseUntilWindowResets();
  }

  /** Pause every queued request until `ms` from now (used on 429 Retry-After). */
  pauseFor(ms: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
    this.windowOpenedAt = null;
  }

  /** Pause every queued request until the current window is believed to have closed. */
  pauseUntilWindowResets(): void {
    const opened = this.windowOpenedAt ?? Date.now();
    this.pausedUntil = Math.max(this.pausedUntil, opened + RATE_WINDOW_MS + RATE_WINDOW_MARGIN_MS);
    this.windowOpenedAt = null;
  }

  /** Test hook: forget all timing state. */
  reset(): void {
    this.queue = Promise.resolve();
    this.lastStart = 0;
    this.pausedUntil = 0;
    this.windowOpenedAt = null;
  }
}

export const anilistLimiter = new AniListRateLimiter();

function parseRetryAfterMs(header: string | null): number {
  if (!header) return DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_AFTER_MS;
  return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS);
}

/**
 * `fetch` rejects with a TypeError, and only a TypeError, when the network
 * layer produced nothing it may hand to us — offline, DNS, or a response the
 * browser refused to expose because it lacked CORS headers. Everything else
 * (an AbortError, a bug in our own code) is not a transport failure.
 */
const isOpaqueFailure = (error: unknown): boolean => error instanceof TypeError;

/**
 * Execute a GraphQL request against AniList through the shared rate limiter.
 *
 * - non-2xx (other than 429) → AniListHttpError
 * - GraphQL `errors` array → AniListGraphQLError
 * - zod mismatch on `data` → AniListSchemaError (issue paths logged)
 * - 429 → honors Retry-After (default 2s, capped 60s), pauses the global
 *   limiter, retries up to 4 attempts, then AniListRateLimitError
 * - fetch rejected → treated as a rate limit whose status we cannot see:
 *   escalating global pause, retries up to 4 attempts, then AniListNetworkError.
 *   AniList's 429 responses carry no CORS headers, so in a browser *every* 429
 *   arrives this way, and before this branch existed each one left the queue
 *   running at full speed into the same closed window.
 */
export async function anilistRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  schema: ZodType<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await anilistLimiter.schedule(async () => {
        const res = await fetch(ANILIST_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            // Browsers set their own UA (and may ignore this); Node's fetch
            // sends none at all, and UA-less datacenter traffic is exactly what
            // API firewalls 403 — the scheduled refresh tasks run in Node.
            // Identifying ourselves is also AniList API etiquette.
            ...(typeof window === 'undefined'
              ? { 'User-Agent': 'senpai-schedule/0.1 (+https://github.com/sagerobot/Senpai-Schedual)' }
              : {}),
          },
          body: JSON.stringify({ query, variables }),
        });
        // A 429 is governed by its Retry-After below; the budget headers on
        // every other response are what keep us from ever getting one.
        if (res.status !== 429) anilistLimiter.observe(res.headers);
        return res;
      });
    } catch (error) {
      if (!isOpaqueFailure(error)) throw error;
      if (attempt === MAX_ATTEMPTS) throw new AniListNetworkError(error);
      anilistLimiter.pauseFor(OPAQUE_FAILURE_BACKOFF_MS[attempt - 1]);
      continue;
    }

    if (response.status === 429) {
      const retryMs = parseRetryAfterMs(response.headers.get('Retry-After'));
      anilistLimiter.pauseFor(retryMs);
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(retryMs);
      continue;
    }

    if (!response.ok) {
      throw new AniListHttpError(response.status);
    }

    const payload = (await response.json()) as {
      data?: unknown;
      errors?: { message?: string }[];
    };

    if (payload.errors && payload.errors.length > 0) {
      throw new AniListGraphQLError(payload.errors.map((e) => e?.message ?? 'Unknown GraphQL error'));
    }

    const parsed = schema.safeParse(payload.data);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
      console.error('[anilist] response failed schema validation', issues);
      throw new AniListSchemaError(issues);
    }
    return parsed.data;
  }

  throw new AniListRateLimitError();
}
