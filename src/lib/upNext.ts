import { AnimeMedia, EpisodeLog, LibraryEntry } from '../types';
import { getAiredEpisodesCount, seasonFullyAired } from './aired';

/**
 * The momentum score behind the Up Next deck: rank "what should I watch right
 * now" from data the store already holds. Pure and clock-free — callers pass
 * `nowSec` — so the whole ranking is unit-testable.
 *
 * Every candidate carries a human-readable reason. That is part of the
 * contract: the deck never shows an unexplained pick.
 */

export type UpNextReasonKind =
  | 'binge-ready'
  | 'urgency'
  | 'momentum'
  | 'finish-line'
  | 'affinity'
  | 'backlog';

export interface UpNextReason {
  kind: UpNextReasonKind;
  text: string;
}

export interface UpNextCandidate {
  anime: AnimeMedia;
  entry: LibraryEntry;
  reason: UpNextReason;
  /** maxWatched + 1, matching the drop cards' catch-up semantics. */
  nextEpisode: number;
  behindCount: number;
  airedCount: number;
  userAvgScore: number | null;
  /** Summed signal points; exported so tests can assert relative order. */
  score: number;
}

export interface UpNextInput {
  animeList: AnimeMedia[];
  library: LibraryEntry[];
  logs: EpisodeLog[];
  nowSec: number;
}

const HOUR = 3600;
const DAY_MS = 24 * 3600 * 1000;
const MOMENTUM_WINDOW_MS = 7 * DAY_MS;
/** A watching show untouched this long falls out of the deck entirely. */
const STALE_MS = 21 * DAY_MS;

interface Signal extends UpNextReason {
  points: number;
}

/**
 * A stacking show is binge-ready when its wake condition has come true.
 * seasonFullyAired (not just FINISHED status) so the graduation lands the
 * moment the finale airs, not on AniList's next status refresh — the same
 * staleness rule the drop cards live by.
 */
export function isBingeReady(entry: LibraryEntry, anime: AnimeMedia, nowSec: number): boolean {
  if (entry.status !== 'stacking') return false;
  if (seasonFullyAired(anime, nowSec)) return true;
  if (entry.stackWakeCount === undefined) return false;
  return getAiredEpisodesCount(anime, nowSec) >= entry.stackWakeCount;
}

export function rankUpNext({ animeList, library, logs, nowSec }: UpNextInput): UpNextCandidate[] {
  const nowMs = nowSec * 1000;
  const byId = new Map<number, AnimeMedia>();
  for (const anime of animeList) byId.set(anime.id, anime);

  const logsByShow = new Map<number, EpisodeLog[]>();
  for (const log of logs) {
    const list = logsByShow.get(log.showId);
    if (list) list.push(log);
    else logsByShow.set(log.showId, [log]);
  }

  const candidates: UpNextCandidate[] = [];

  for (const entry of library) {
    if (entry.status !== 'watching' && entry.status !== 'stacking') continue;
    const anime = byId.get(entry.showId);
    if (!anime) continue;

    const airedCount = getAiredEpisodesCount(anime, nowSec);
    const showLogs = logsByShow.get(entry.showId) ?? [];
    const behindCount = airedCount - showLogs.length;
    if (behindCount <= 0) continue;

    const maxWatched = showLogs.reduce((max, l) => Math.max(max, l.episodeNumber), 0);
    const rated = showLogs.filter((l) => l.score !== null);
    const userAvgScore =
      rated.length > 0 ? rated.reduce((sum, l) => sum + (l.score ?? 0), 0) / rated.length : null;

    const signals: Signal[] = [];

    if (entry.status === 'stacking') {
      if (!isBingeReady(entry, anime, nowSec)) continue;
      // High enough that no sum of watching signals (≤ ~1100) can outrank the
      // graduation moment — a wake condition coming true always tops the deck.
      signals.push({
        kind: 'binge-ready',
        points: 2000 + Math.min(behindCount, 20),
        text:
          seasonFullyAired(anime, nowSec)
            ? `Season complete · ${behindCount} episodes ready`
            : `${behindCount} episodes stacked — ready to binge`,
      });
    } else {
      // Staleness gate: a show the viewer has touched, then left for ~3 weeks,
      // is no longer a deck pick. (It stays in the Catch-up Queue below.)
      const lastWatchedAt = showLogs.reduce((max, l) => Math.max(max, l.watchedAt), 0);
      if (lastWatchedAt > 0 && nowMs - lastWatchedAt > STALE_MS) continue;

      // Urgency reads airingAt, not the cached timeUntilAiring — the latter is
      // computed at fetch time and goes stale in the query cache.
      const airingAt = anime.nextAiringEpisode?.airingAt;
      const hoursUntil = airingAt !== undefined ? Math.ceil((airingAt - nowSec) / HOUR) : null;
      if (hoursUntil !== null && hoursUntil > 0 && hoursUntil <= 48 && behindCount <= 2) {
        signals.push({
          kind: 'urgency',
          points: 400 + (48 - hoursUntil),
          text:
            hoursUntil <= 24
              ? `Airs in ${hoursUntil}h · ${behindCount} behind — clear it tonight`
              : `Airs tomorrow · ${behindCount} behind — clear it tonight`,
        });
      }

      const recentCount = showLogs.filter((l) => nowMs - l.watchedAt <= MOMENTUM_WINDOW_MS).length;
      if (recentCount >= 3) {
        signals.push({
          kind: 'momentum',
          points: 300 + recentCount * 20,
          text: `${recentCount} episodes this week — you're on a run`,
        });
      }

      if (anime.status === 'FINISHED' && behindCount <= 3) {
        signals.push({
          kind: 'finish-line',
          points: 250 + (3 - behindCount) * 30,
          text:
            behindCount === 1
              ? 'Season finished · just the finale left'
              : `Season finished · ${behindCount} episodes to go`,
        });
      }

      if (userAvgScore !== null && rated.length >= 3 && userAvgScore >= 8.5) {
        signals.push({
          kind: 'affinity',
          points: 100 + userAvgScore * 10,
          text: `Your ${userAvgScore.toFixed(1)} average · ${behindCount} waiting`,
        });
      }

      signals.push({
        kind: 'backlog',
        points: Math.min(behindCount, 10),
        text: `${behindCount} episode${behindCount === 1 ? '' : 's'} waiting`,
      });
    }

    const top = signals.reduce((best, s) => (s.points > best.points ? s : best));
    candidates.push({
      anime,
      entry,
      reason: { kind: top.kind, text: top.text },
      nextEpisode: maxWatched + 1,
      behindCount,
      airedCount,
      userAvgScore,
      score: signals.reduce((sum, s) => sum + s.points, 0),
    });
  }

  candidates.sort(
    (a, b) => b.score - a.score || b.behindCount - a.behindCount || a.anime.id - b.anime.id,
  );
  return candidates;
}
