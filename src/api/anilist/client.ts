import type { ZodType } from 'zod';

const ANILIST_URL = 'https://graphql.anilist.co';

const MAX_ATTEMPTS = 4;
const DEFAULT_RETRY_AFTER_MS = 2_000;
const MAX_RETRY_AFTER_MS = 60_000;
const MIN_REQUEST_GAP_MS = 650;

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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Global AniList rate limiter: a module-level promise queue shared by every
 * request in the app (list fetchers, search, MAL import, and — later — the
 * series resolver). Concurrency 1, at least MIN_REQUEST_GAP_MS between
 * request starts, plus a global pause while any 429 Retry-After is
 * outstanding. Request storms are structurally impossible.
 */
class AniListRateLimiter {
  private queue: Promise<void> = Promise.resolve();
  private lastStart = 0;
  private pausedUntil = 0;

  schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      for (;;) {
        const now = Date.now();
        const readyAt = Math.max(this.lastStart + MIN_REQUEST_GAP_MS, this.pausedUntil);
        if (now >= readyAt) break;
        await sleep(readyAt - now);
      }
      this.lastStart = Date.now();
      return task();
    });
    // Keep the chain alive even when a task rejects.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Pause every queued request until `ms` from now (used on 429). */
  pauseFor(ms: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
  }

  /** Test hook: forget all timing state. */
  reset(): void {
    this.queue = Promise.resolve();
    this.lastStart = 0;
    this.pausedUntil = 0;
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
 * Execute a GraphQL request against AniList through the shared rate limiter.
 *
 * - non-2xx (other than 429) → AniListHttpError
 * - GraphQL `errors` array → AniListGraphQLError
 * - zod mismatch on `data` → AniListSchemaError (issue paths logged)
 * - 429 → honors Retry-After (default 2s, capped 60s), pauses the global
 *   limiter, retries up to 4 attempts, then AniListRateLimitError
 */
export async function anilistRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  schema: ZodType<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await anilistLimiter.schedule(() =>
      fetch(ANILIST_URL, {
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
      }),
    );

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
