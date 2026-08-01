/**
 * The pure half of the season-bundle sanity gates.
 *
 * `scripts/check-gates.ts` is the CLI around this — it does the argument
 * parsing and the file IO. Everything that decides *whether a bundle may be
 * committed* lives here so it can be tested without a filesystem, exactly the
 * way `vibeWork.ts` sits under the two vibe CLIs.
 *
 * These gates used to be prose in docs/season-refresh.md, evaluated by the
 * scheduled Claude routine. The refresh now runs in GitHub Actions, which has
 * no judgement, so the same rules had to become arithmetic.
 *
 * No Node imports, no side effects, no clock reads.
 */

/** How far the show count may drift from the previous bundle, either way. */
export const SHOW_COUNT_TOLERANCE = 0.3;

/** Everything a gate is computed from, for one bundle. */
export interface GateFacts {
  /** Every show id in the bundle. */
  showIds: number[];
  /** The show ids that carry a summary. */
  summaryIds: number[];
  /** ISO 8601. */
  generatedAt: string;
}

export interface GateStats {
  shows: number;
  prevShows: number | null;
  /** Signed fraction: -0.4 means the season lost 40% of its shows. */
  showDrift: number | null;
  summaries: number;
  prevSummaries: number | null;
  /** Previous summaries whose show left the season — these may disappear. */
  departed: number | null;
  /** The lowest summary count that is not a regression. */
  summaryFloor: number | null;
}

export interface GateResult {
  ok: boolean;
  /** One line naming the gate that failed and its numbers; null when all held. */
  reason: string | null;
  stats: GateStats;
}

const pct = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`;

/**
 * Decide whether the new bundle may be committed.
 *
 * A bad bundle is worse than no bundle, because the client trusts a bundle that
 * parses:
 *
 * - **Empty** — the season fetch came back with nothing. The build script
 *   refuses to write this, so seeing it here means something downstream of it
 *   went wrong.
 * - **±30% shows** — a half-fetched season: AniList paginating short, or a
 *   mid-run rate limit the client's retries did not absorb.
 * - **`generatedAt` advanced** — committing the same file twice, or
 *   resurrecting an old one over a newer one.
 * - **Summaries not lost** — summaries are paid for, one at a time, by a human-
 *   scheduled routine. A drop means the `--prev` path was wrong, which would
 *   otherwise re-buy every summary in the season on every run, forever.
 *
 * Every comparison gate is skipped when there is no previous bundle: the first
 * run has nothing to regress against.
 */
export function checkSeasonGates(next: GateFacts, prev: GateFacts | null): GateResult {
  const shows = next.showIds.length;
  const summaries = next.summaryIds.length;

  const stats: GateStats = {
    shows,
    prevShows: prev === null ? null : prev.showIds.length,
    showDrift: null,
    summaries,
    prevSummaries: prev === null ? null : prev.summaryIds.length,
    departed: null,
    summaryFloor: null,
  };

  const fail = (reason: string): GateResult => ({ ok: false, reason, stats });

  if (shows === 0) return fail('the new bundle has no shows');
  if (Number.isNaN(Date.parse(next.generatedAt))) {
    return fail(`generatedAt "${next.generatedAt}" is not a parseable date`);
  }

  if (prev === null) return { ok: true, reason: null, stats };

  const prevShows = prev.showIds.length;
  if (prevShows > 0) {
    stats.showDrift = (shows - prevShows) / prevShows;
    if (Math.abs(stats.showDrift) > SHOW_COUNT_TOLERANCE) {
      return fail(
        `show count moved ${pct(stats.showDrift)} (${prevShows} -> ${shows}), past the ±${pct(SHOW_COUNT_TOLERANCE)} gate`,
      );
    }
  }

  // An unparseable previous timestamp is not the new bundle's fault; there is
  // simply nothing to compare against, so the gate has no opinion.
  const prevGenerated = Date.parse(prev.generatedAt);
  if (!Number.isNaN(prevGenerated) && Date.parse(next.generatedAt) <= prevGenerated) {
    return fail(`generatedAt did not advance (${prev.generatedAt} -> ${next.generatedAt})`);
  }

  const showIds = new Set(next.showIds);
  stats.departed = prev.summaryIds.filter((id) => !showIds.has(id)).length;
  stats.summaryFloor = prev.summaryIds.length - stats.departed;
  if (summaries < stats.summaryFloor) {
    return fail(
      `summary count fell to ${summaries}, under the ${stats.summaryFloor} that should have carried forward ` +
        `(${prev.summaryIds.length} before, ${stats.departed} pruned with departing shows)`,
    );
  }

  return { ok: true, reason: null, stats };
}
