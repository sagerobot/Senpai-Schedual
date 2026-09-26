import type { AnimeMedia, EpisodeLog, LibraryEntry, LibraryStatus } from '../types';
import { latestAiredEpisode } from './aired';
import { displayTitle } from './displayTitle';
import { DROP_WINDOW_SEC } from './freshness';
import type { VibeEntry, VibeFoundEntry } from './vibesFile';

/**
 * "Also Airing": everything in the drop window that isn't one of your drops.
 *
 * The row under Today's Drops. It is the discovery surface — shows you
 * haven't claimed, a stacking show's reminder that another episode landed, a
 * dropped show that got good after you left — ordered by air time, with the
 * shows still to air today on the far side of a NOW line.
 *
 * Pure and clock-free (callers pass `nowSec`).
 */

export type AlsoAiringKind = 'discover' | 'stacking' | 'dropped';

export type Tone = 'positive' | 'mixed' | 'negative';

export interface AlsoAiringEntry {
  anime: AnimeMedia;
  kind: AlsoAiringKind;
  /** The show's library status; null = not in the library. Never 'watching'. */
  status: LibraryStatus | null;
  /** The episode the card is about — the one that aired, or the one about to. */
  episode: number;
  /** Unix seconds. */
  airingAt: number;
  aired: boolean;
  /** Highest logged episode (0 = none). */
  maxWatched: number;
  /** maxWatched + 1 — what the Watch button plays. */
  firstUnwatched: number;
  /** Aired episodes in the stack, for a stacking card (aired − maxWatched). */
  stackWaiting: number;
  /** The most recent rated log, for the "you rated Ep 1 an 8" chip. */
  lastRating: { episode: number; score: number } | null;
  /** Episode 1 of this entry. */
  premiere: boolean;
}

export interface AlsoAiringRow {
  entries: AlsoAiringEntry[];
  /** Index of the first upcoming entry — where the NOW line sits. entries.length when none. */
  nowIndex: number;
}

export interface PulseBar {
  episode: number;
  /** null = no reading for that episode. */
  tone: Tone | null;
}

export interface Pulse {
  /** Where the card's pulse comes from: r/anime readings, else AniList, else nothing. */
  source: 'reddit' | 'anilist' | 'none';
  /** Oldest first, at most PULSE_MAX_BARS. */
  bars: PulseBar[];
  trend: { direction: 'rising' | 'cooling'; sinceEpisode: number } | null;
  /** Tone of the newest episode that has a reading. */
  latestTone: Tone | null;
  /** From the newest found reading, at most three, in ASPECT_ORDER. */
  aspects: { name: string; tone: Tone }[];
  /** Comment count of the newest found reading. */
  comments: number | null;
  /** AniList averageScore / 10, one decimal. */
  anilistScore: number | null;
}

/** How far ahead the row looks for shows still to air. */
export const UPCOMING_WINDOW_SEC = 24 * 3600;
export const PULSE_MAX_BARS = 8;
export const ASPECT_ORDER = ['story', 'characters', 'animation', 'pacing', 'sound'] as const;

export interface VibeLookup {
  get(showId: number, episode: number): VibeEntry | undefined;
}

/** Library status → card kind. Only stacking and dropped get their own treatment. */
export function alsoAiringKind(status: LibraryStatus | null): AlsoAiringKind {
  if (status === 'stacking') return 'stacking';
  if (status === 'dropped') return 'dropped';
  return 'discover';
}

interface LogSummary {
  maxWatched: number;
  lastRating: { episode: number; score: number } | null;
}

/** One pass over the logs: highest logged episode and newest rated one, per show. */
function summarizeLogs(logs: EpisodeLog[]): Map<number, LogSummary> {
  const out = new Map<number, LogSummary>();
  for (const log of logs) {
    let sum = out.get(log.showId);
    if (!sum) {
      sum = { maxWatched: 0, lastRating: null };
      out.set(log.showId, sum);
    }
    if (log.episodeNumber > sum.maxWatched) sum.maxWatched = log.episodeNumber;
    if (typeof log.score === 'number' && (sum.lastRating === null || log.episodeNumber > sum.lastRating.episode)) {
      sum.lastRating = { episode: log.episodeNumber, score: log.score };
    }
  }
  return out;
}

/**
 * Where this show sits relative to now: about to air (inside the upcoming
 * window) beats just aired (inside the drop window). The aired branch keeps a
 * lower bound because latestAiredEpisode's estimated branch (next − 7 days)
 * can land in the future for a show whose next episode is under a week out.
 */
function placeOnRow(anime: AnimeMedia, nowSec: number): { episode: number; airingAt: number; aired: boolean } | null {
  const next = anime.nextAiringEpisode;
  if (next && next.airingAt > nowSec && next.airingAt <= nowSec + UPCOMING_WINDOW_SEC) {
    return { episode: next.episode, airingAt: next.airingAt, aired: false };
  }
  const latest = latestAiredEpisode(anime, nowSec);
  // An estimated episode 1 is a guess about a premiere — the one airing the
  // guess gets wrong (advance streams, off-by-one schedules). Say nothing.
  if (latest && !(latest.estimated && latest.episode === 1)) {
    const age = nowSec - latest.airedAt;
    if (age >= 0 && age <= DROP_WINDOW_SEC) {
      return { episode: latest.episode, airingAt: latest.airedAt, aired: true };
    }
  }
  return null;
}

export function computeAlsoAiring(
  animeList: AnimeMedia[],
  library: Record<number, LibraryEntry>,
  logs: EpisodeLog[],
  nowSec: number,
  exclude: ReadonlySet<number>,
  /**
   * The Daily Schedule's own filters, so the row never shows a show the week
   * grid below it has filtered out: the Movies toggle, and the streaming-source
   * chips (empty = every source, the same rule the grid uses).
   */
  opts: { includeMovies: boolean; sources?: readonly string[] },
): AlsoAiringRow {
  const logSummary = summarizeLogs(logs);
  const seen = new Set<number>();
  const entries: AlsoAiringEntry[] = [];

  for (const anime of animeList) {
    if (seen.has(anime.id)) continue;
    seen.add(anime.id);
    const status = library[anime.id]?.status ?? null;
    if (status === 'watching') continue;
    if (exclude.has(anime.id)) continue;
    if (anime.format === 'MOVIE' && !opts.includeMovies) continue;
    const sources = opts.sources ?? [];
    if (sources.length > 0 && !anime.externalLinks?.some((link) => sources.includes(link.site))) continue;

    const placed = placeOnRow(anime, nowSec);
    if (!placed) continue;

    const sum = logSummary.get(anime.id);
    const maxWatched = sum?.maxWatched ?? 0;
    const airedCount = placed.aired ? placed.episode : placed.episode - 1;
    entries.push({
      anime,
      kind: alsoAiringKind(status),
      status,
      episode: placed.episode,
      airingAt: placed.airingAt,
      aired: placed.aired,
      maxWatched,
      firstUnwatched: maxWatched + 1,
      stackWaiting: Math.max(0, airedCount - maxWatched),
      lastRating: sum?.lastRating ?? null,
      premiere: placed.episode === 1,
    });
  }

  entries.sort((a, b) => a.airingAt - b.airingAt || displayTitle(a.anime).localeCompare(displayTitle(b.anime)));
  const firstUpcoming = entries.findIndex((e) => !e.aired);
  return { entries, nowIndex: firstUpcoming === -1 ? entries.length : firstUpcoming };
}

/**
 * The final same-direction run among toned bars. Rising = ≥2 positives after
 * something that wasn't; cooling = ≥2 mixed/negative after a positive.
 */
function pulseTrend(bars: PulseBar[]): Pulse['trend'] {
  const toned = bars.filter((b): b is PulseBar & { tone: Tone } => b.tone !== null);
  if (toned.length < 3) return null;
  const lastPositive = toned[toned.length - 1].tone === 'positive';
  let start = toned.length - 1;
  while (start > 0 && (toned[start - 1].tone === 'positive') === lastPositive) start--;
  const runLength = toned.length - start;
  // The run is maximal, so anything before it is necessarily the other direction.
  if (runLength < 2 || start === 0) return null;
  return { direction: lastPositive ? 'rising' : 'cooling', sinceEpisode: toned[start].episode };
}

export function computePulse(anime: AnimeMedia, uptoEpisode: number, vibes: VibeLookup): Pulse {
  const bars: PulseBar[] = [];
  let newestFound: VibeFoundEntry | null = null;
  if (uptoEpisode >= 1) {
    for (let ep = Math.max(1, uptoEpisode - PULSE_MAX_BARS + 1); ep <= uptoEpisode; ep++) {
      const vibe = vibes.get(anime.id, ep);
      if (vibe?.status === 'found') {
        bars.push({ episode: ep, tone: vibe.indicator });
        newestFound = vibe;
      } else {
        bars.push({ episode: ep, tone: null });
      }
    }
  }

  let latestTone: Tone | null = null;
  for (let i = bars.length - 1; i >= 0; i--) {
    const tone = bars[i].tone;
    if (tone !== null) {
      latestTone = tone;
      break;
    }
  }

  const aspects: { name: string; tone: Tone }[] = [];
  const found = newestFound?.aspects;
  if (found) {
    for (const name of ASPECT_ORDER) {
      const tone = found[name];
      if (tone !== undefined) aspects.push({ name, tone });
      if (aspects.length === 3) break;
    }
  }

  const anilistScore = anime.averageScore != null ? Math.round(anime.averageScore) / 10 : null;
  const source: Pulse['source'] = latestTone !== null ? 'reddit' : anilistScore !== null ? 'anilist' : 'none';

  return {
    source,
    bars,
    trend: pulseTrend(bars),
    latestTone,
    aspects,
    comments: newestFound?.comments ?? null,
    anilistScore,
  };
}
