/**
 * The pure half of the vibe refresh: what work is due, and what a merge does.
 *
 * `scripts/prepare-vibes.ts` and `scripts/merge-vibes.ts` are the CLIs around
 * these two functions — they do the argument parsing, the AniList fetch, and
 * the file IO. Everything that decides *behaviour* lives here so it can be
 * tested without a network or a filesystem (`vibeWork.test.ts`).
 *
 * No Node imports, no side effects, no clock reads: `now` is always a parameter.
 */

import {
  isRedditUrl,
  redditSearchUrl,
  vibeEntrySchema,
  vibeKey,
  type VibeEntry,
} from '../src/lib/vibesFile';

const HOUR_MS = 60 * 60 * 1000;

/** Under this age an episode's sentiment is refreshed every run. */
export const UPDATE_WINDOW_MS = 24 * HOUR_MS;
/** Past this age nothing is read again — the settle pass has had its chance. */
export const SETTLE_WINDOW_MS = 48 * HOUR_MS;
/**
 * Don't re-read an entry the previous run just wrote. The routine runs hourly;
 * without this a manual run an hour after the scheduled one repeats all of it.
 */
export const MIN_REFRESH_GAP_MS = 45 * 60 * 1000;
/** Per-run bound on agent work. Unattended and hourly — it must not run long. */
export const WORK_LIMIT = 30;

/** One episode AniList says has aired inside the window. */
export interface AiredEpisode {
  showId: number;
  episode: number;
  /** Unix seconds. */
  airedAt: number;
  title: string;
}

/**
 * - `first`  — aired and never read. Included the moment it airs: partial
 *              release-day sentiment is exactly what a release-day viewer wants.
 * - `update` — under 24h old and not settled. The hourly refresh.
 * - `settle` — 24-48h old. The last read this episode will ever get.
 */
export type WorkKind = 'first' | 'update' | 'settle';

export interface WorkItem {
  key: string;
  showId: number;
  episode: number;
  title: string;
  /** Unix seconds. */
  airedAt: number;
  kind: WorkKind;
}

export interface WorkList {
  items: WorkItem[];
  /** Episodes considered before the cap. */
  eligible: number;
  /** Eligible items the cap dropped; the next run picks them up. */
  dropped: number;
  counts: Record<WorkKind, number>;
}

function kindFor(entry: VibeEntry | undefined, ageMs: number, now: number): WorkKind | null {
  if (ageMs < 0) return null; // not aired yet — AniList schedules run ahead
  if (entry?.settled === true) return null; // frozen forever

  if (ageMs < UPDATE_WINDOW_MS) {
    if (entry === undefined) return 'first';
    const asOf = Date.parse(entry.asOf);
    // An unparseable asOf means we cannot tell how old the reading is; refresh it.
    if (!Number.isNaN(asOf) && now - asOf < MIN_REFRESH_GAP_MS) return null;
    return 'update';
  }

  if (ageMs <= SETTLE_WINDOW_MS) return 'settle';
  return null; // older than the settle window and never settled — let it go
}

/**
 * Derive the work list from the stored file and what AniList says aired.
 *
 * The cap reserves the `settle` items before anything else. They are ordered
 * last by air time — oldest first — so a naive "newest 30" would starve exactly
 * the pass that makes an entry permanent, and after 48h that episode leaves the
 * window for good. Everything else is taken most-recently-aired first, which is
 * also the order the emitted list is in.
 */
export function classifyVibeWork(
  entries: Record<string, VibeEntry>,
  aired: AiredEpisode[],
  now: number,
  limit = WORK_LIMIT,
): WorkList {
  const eligible: WorkItem[] = [];

  for (const episode of aired) {
    const key = vibeKey(episode.showId, episode.episode);
    const kind = kindFor(entries[key], now - episode.airedAt * 1000, now);
    if (kind === null) continue;
    eligible.push({ key, ...episode, kind });
  }

  const byRecency = (a: WorkItem, b: WorkItem) => b.airedAt - a.airedAt;
  eligible.sort(byRecency);

  const settle = eligible.filter((item) => item.kind === 'settle');
  const rest = eligible.filter((item) => item.kind !== 'settle');
  const items = [...settle.slice(0, limit), ...rest.slice(0, Math.max(0, limit - settle.length))].sort(byRecency);

  const counts: Record<WorkKind, number> = { first: 0, update: 0, settle: 0 };
  for (const item of items) counts[item.kind]++;

  return { items, eligible: eligible.length, dropped: eligible.length - items.length, counts };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/** A summary this short is a refusal, an error string, or a stub — never a read. */
export const SUMMARY_MIN_CHARS = 40;

export interface MergeRejection {
  key: string;
  reason: string;
}

export interface MergeResult {
  entries: Record<string, VibeEntry>;
  merged: number;
  /** Incoming entries refused because the stored one is settled. */
  frozen: number;
  rejected: MergeRejection[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isFiniteInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}

/**
 * Fold agent-written entries into the stored map.
 *
 * Three rules, in order of how much they matter:
 *
 * 1. **A settled entry is frozen.** Nothing overwrites it — not a later run, not
 *    a harvested duplicate, not a re-run of the same work item.
 * 2. **Nothing is ever deleted.** The output starts as a copy of the input; a
 *    rejected entry leaves the previous value exactly where it was.
 * 3. `settled` comes from the work item's `kind`, not from the agent. Only the
 *    settle pass freezes, and the classifier is what decides a pass is one.
 *
 * A found entry whose `url` is not on reddit.com is repaired with the r/anime
 * search URL — the same substitution `server/routes/ai.ts` makes on Gemini
 * output — rather than being thrown away, provided the item carries the `title`
 * needed to build one.
 */
export function mergeVibeEntries(
  existing: Record<string, VibeEntry>,
  incoming: unknown[],
  now: number,
): MergeResult {
  const entries: Record<string, VibeEntry> = { ...existing };
  const rejected: MergeRejection[] = [];
  let merged = 0;
  let frozen = 0;

  for (const [index, item] of incoming.entries()) {
    const raw = asRecord(item);
    if (raw === null) {
      rejected.push({ key: `#${index}`, reason: 'not a JSON object' });
      continue;
    }

    const showId = raw.showId;
    const episode = raw.episode;
    if (!isFiniteInt(showId) || !isFiniteInt(episode)) {
      rejected.push({ key: `#${index}`, reason: 'showId and episode must be integers' });
      continue;
    }
    const key = vibeKey(showId, episode);

    if (entries[key]?.settled === true) {
      frozen++;
      continue;
    }

    const kind = typeof raw.kind === 'string' ? raw.kind : undefined;
    // Harvested entries arrive without a work item, so an explicit `settled`
    // still counts — but a work item's kind always wins over it.
    const settled = kind !== undefined ? kind === 'settle' : raw.settled === true;

    const asOfRaw = typeof raw.asOf === 'string' && !Number.isNaN(Date.parse(raw.asOf)) ? raw.asOf : null;
    const asOf = asOfRaw ?? new Date(now).toISOString();
    // An unknown air time is honest as "when we read it": the field is only
    // load-bearing for the classifier, which never revisits a settled entry.
    const airedAt = isFiniteInt(raw.airedAt) && raw.airedAt >= 0 ? raw.airedAt : Math.floor(Date.parse(asOf) / 1000);

    const candidate: Record<string, unknown> = { ...raw, showId, episode, asOf, airedAt, settled };
    delete candidate.kind;
    delete candidate.title;

    if (raw.status === 'found') {
      const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
      if (summary.length < SUMMARY_MIN_CHARS) {
        rejected.push({ key, reason: `summary too short (${summary.length} chars)` });
        continue;
      }
      candidate.summary = summary;

      const url = typeof raw.url === 'string' ? raw.url : '';
      if (!isRedditUrl(url)) {
        const title = typeof raw.title === 'string' ? raw.title.trim() : '';
        if (title === '') {
          rejected.push({ key, reason: 'url is not on reddit.com and no title to build a search URL from' });
          continue;
        }
        candidate.url = redditSearchUrl(title, episode);
      }
    }

    if (raw.status === 'quiet') {
      // "Quiet" asserts a thread EXISTS with too few comments — an unverified
      // URL would make that claim baseless, so unlike `found` there is no
      // search-URL repair. And a full reading is never traded down for a
      // comment count: comments only accumulate, so a quiet arriving over a
      // found entry means the incoming item is stale or wrong.
      if (!isRedditUrl(typeof raw.url === 'string' ? raw.url : '')) {
        rejected.push({ key, reason: 'quiet entry without a verified reddit thread URL' });
        continue;
      }
      if (entries[key]?.status === 'found') {
        rejected.push({ key, reason: 'quiet cannot replace a found reading' });
        continue;
      }
    }

    const parsed = vibeEntrySchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      rejected.push({ key, reason: issue ? `${issue.path.join('.') || 'status'}: ${issue.message}` : 'invalid entry' });
      continue;
    }

    entries[key] = parsed.data;
    merged++;
  }

  return { entries, merged, frozen, rejected };
}
