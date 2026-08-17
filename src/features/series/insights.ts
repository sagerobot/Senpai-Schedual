import type { EpisodeLog } from '../../types';
import type { VibeAspects, VibeEntry } from '../../lib/vibesFile';

/**
 * The Run's computation layer: pure functions over the vibes index and the
 * user's logs. Everything here is client-computable from data already in the
 * session — no requests, no store access, no Date.now() (callers pass `now`).
 *
 * Sparse data degrades to `null`, never to a confident wrong answer: every
 * function carries a minimum-data guard, because for the pre-2013 catalogue
 * "no thread" is permanently true and a chart must collapse rather than lie.
 */

export type Tone = 'positive' | 'mixed' | 'negative';

/**
 * Has this entry's premiere date passed? Missing month/day default generously
 * toward "not started" (December 28th), so a season announced for "2026" never
 * counts as aired in March 2026. The one shared answer for the rail's future
 * diamonds, the radar, and the aired-count fallback.
 */
export function hasStarted(
  startDate: { year: number | null; month?: number | null; day?: number | null } | null | undefined,
  now: Date,
): boolean {
  if (!startDate?.year) return false;
  return new Date(startDate.year, (startDate.month ?? 12) - 1, startDate.day ?? 28).getTime() <= now.getTime();
}

/** Per-episode community reading for one member, 1-indexed by episode. */
export interface MemberSignal {
  /** tones[ep-1]: the found indicator, or null (quiet / not_found / never read). */
  tones: (Tone | null)[];
  /** comments[ep-1]: thread comment count where a thread exists, else null. */
  comments: (number | null)[];
}

/** Project the vibes index onto one member's episode range. */
export function memberSignal(
  get: (showId: number, episode: number) => VibeEntry | undefined,
  showId: number,
  episodeCount: number,
): MemberSignal {
  const tones: (Tone | null)[] = [];
  const comments: (number | null)[] = [];
  for (let ep = 1; ep <= episodeCount; ep++) {
    const entry = get(showId, ep);
    tones.push(entry?.status === 'found' ? entry.indicator : null);
    comments.push(entry?.status === 'found' || entry?.status === 'quiet' ? entry.comments : null);
  }
  return { tones, comments };
}

/**
 * The Worth-It Horizon: the episode where the community's complaints stop and
 * stay stopped — "consensus settles at E7". Null when the data can't say, when
 * there was never a rough patch, or when the "turn" lands too late to be an
 * on-ramp promise rather than a recap of the whole season.
 */
export function worthItHorizon(tones: (Tone | null)[]): number | null {
  const found = tones.filter((t) => t !== null).length;
  if (found < 6) return null;
  let lastRough = -1;
  tones.forEach((t, i) => {
    if (t === 'mixed' || t === 'negative') lastRough = i;
  });
  if (lastRough === -1) return null; // never rough — nothing to promise past
  const turn = lastRough + 2; // 1-based episode after the last complaint
  if (turn > Math.ceil(tones.length * 0.6)) return null;
  const positivesAfter = tones.slice(turn - 1).filter((t) => t === 'positive').length;
  return positivesAfter >= 2 ? turn : null;
}

export type EndingVerdict = 'sticks' | 'divisive' | 'fades';

export const ENDING_VERDICT_LABELS: Record<EndingVerdict, string> = {
  sticks: 'Sticks the landing',
  divisive: 'Divisive ending',
  fades: 'Fades out',
};

/**
 * Does the season stick the landing? Read from the final three episodes'
 * found indicators — spoiler-safe by design: a shape, never an event.
 */
export function endingVerdict(tones: (Tone | null)[]): EndingVerdict | null {
  const window = tones.slice(-3).filter((t): t is Tone => t !== null);
  if (window.length < 2) return null;
  if (window.includes('negative')) return 'divisive';
  if (window.every((t) => t === 'positive')) return 'sticks';
  return 'fades';
}

/**
 * Landmark episodes: engagement so far above the season's baseline that the
 * night is part of the show's story (the S1E19 phenomenon). Z-score over the
 * member's own thread comment counts; at most three, strongest first.
 */
export function landmarks(comments: (number | null)[]): number[] {
  const known = comments.filter((c): c is number => c !== null);
  if (known.length < 8) return [];
  const mean = known.reduce((a, b) => a + b, 0) / known.length;
  const sd = Math.sqrt(known.reduce((a, b) => a + (b - mean) ** 2, 0) / known.length);
  if (sd === 0) return [];
  return comments
    .map((c, i) => ({ episode: i + 1, z: c === null ? 0 : (c - mean) / sd }))
    .filter((x) => x.z > 2.5)
    .sort((a, b) => b.z - a.z)
    .slice(0, 3)
    .map((x) => x.episode);
}

/** The numeric stand-in for a community indicator, for divergence math only. */
export function toneProxy(tone: Tone): number {
  return tone === 'positive' ? 8.5 : tone === 'mixed' ? 6.5 : 4.5;
}

export interface Alignment {
  /** 0–100, share of comparable episodes where you and the crowd agree. */
  pct: number;
  comparable: number;
}

/** You vs. the crowd, across every episode with both a score and a reading. */
export function alignment(scores: (number | null)[], tones: (Tone | null)[]): Alignment | null {
  let comparable = 0;
  let aligned = 0;
  scores.forEach((score, i) => {
    const tone = tones[i];
    if (score === null || score === undefined || tone === null || tone === undefined) return;
    comparable++;
    if (Math.abs(score - toneProxy(tone)) <= 1.5) aligned++;
  });
  if (comparable < 5) return null;
  return { pct: Math.round((aligned / comparable) * 100), comparable };
}

export interface Heresy {
  episode: number;
  score: number;
  tone: Tone;
  gap: number;
}

/** Your loudest disagreements with the crowd — the chart's ringed dots. */
export function heresies(scores: (number | null)[], tones: (Tone | null)[]): Heresy[] {
  const out: Heresy[] = [];
  scores.forEach((score, i) => {
    const tone = tones[i];
    if (score === null || score === undefined || tone === null || tone === undefined) return;
    const gap = score - toneProxy(tone);
    if (Math.abs(gap) >= 3) out.push({ episode: i + 1, score, tone, gap });
  });
  return out.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 3);
}

export type AspectKey = keyof VibeAspects;

export const ASPECT_ORDER: readonly AspectKey[] = ['animation', 'story', 'pacing', 'characters', 'sound'];

export const ASPECT_LABELS: Record<AspectKey, string> = {
  animation: 'Animation',
  story: 'Story',
  pacing: 'Pacing',
  characters: 'Characters',
  sound: 'Sound',
};

/**
 * A season's per-aspect consensus: majority tone across the episodes whose
 * threads actually discussed that aspect. Fewer than two mentions is silence,
 * not neutrality; a tie reads as mixed.
 */
export function aspectRollup(entries: (VibeEntry | undefined)[]): Partial<Record<AspectKey, Tone>> {
  const votes: Record<AspectKey, Record<Tone, number>> = {
    animation: { positive: 0, mixed: 0, negative: 0 },
    story: { positive: 0, mixed: 0, negative: 0 },
    pacing: { positive: 0, mixed: 0, negative: 0 },
    characters: { positive: 0, mixed: 0, negative: 0 },
    sound: { positive: 0, mixed: 0, negative: 0 },
  };
  for (const entry of entries) {
    if (entry?.status !== 'found' || entry.aspects === undefined) continue;
    for (const key of ASPECT_ORDER) {
      const tone = entry.aspects[key];
      if (tone !== undefined) votes[key][tone]++;
    }
  }
  const out: Partial<Record<AspectKey, Tone>> = {};
  for (const key of ASPECT_ORDER) {
    const v = votes[key];
    const total = v.positive + v.mixed + v.negative;
    if (total < 2) continue;
    const top = Math.max(v.positive, v.mixed, v.negative);
    const winners = (['positive', 'mixed', 'negative'] as const).filter((t) => v[t] === top);
    out[key] = winners.length === 1 ? winners[0] : 'mixed';
  }
  return out;
}

export interface GapReading {
  /** showScore − episode average, one decimal. */
  gap: number;
  label: string;
}

/** The dual-rating principle made visible: name the gap, never merge it. */
export function gapReading(showScore: number | null, avgEpisodeScore: number | null): GapReading | null {
  if (showScore === null || avgEpisodeScore === null) return null;
  const gap = Math.round((showScore - avgEpisodeScore) * 10) / 10;
  if (Math.abs(gap) < 0.3) return { gap, label: 'exactly its parts' };
  return { gap, label: gap > 0 ? 'greater than its parts' : 'less than its parts' };
}

export interface MemberProgress {
  /** Episodes logged, as a set of episode numbers. */
  watched: Set<number>;
  /** Highest logged episode number, 0 when none. */
  maxWatched: number;
}

/** Per-member watch progress, one pass over the logs array. */
export function progressByMember(logs: readonly EpisodeLog[], memberIds: readonly number[]): Map<number, MemberProgress> {
  const wanted = new Set(memberIds);
  const map = new Map<number, MemberProgress>();
  for (const id of memberIds) map.set(id, { watched: new Set(), maxWatched: 0 });
  for (const log of logs) {
    if (!wanted.has(log.showId)) continue;
    const p = map.get(log.showId)!;
    p.watched.add(log.episodeNumber);
    if (log.episodeNumber > p.maxWatched) p.maxWatched = log.episodeNumber;
  }
  return map;
}

export interface ContinueTarget {
  memberId: number;
  episode: number;
}

/**
 * "Continue {label} — Ep {n}": the next unwatched episode of the furthest
 * chronological member you have started; when that member is fully watched,
 * the first episode of the next member with anything aired. Zero logs across
 * the franchise → the first member's first episode (the "Start here" state).
 *
 * `airedByMember` bounds the ask to what exists; a member with nothing aired
 * is skipped and the walk proceeds — a data-degradation zero must not falsely
 * declare the franchise caught-up while later aired content exists.
 */
export function continueTarget(
  orderedMemberIds: readonly number[],
  progress: Map<number, MemberProgress>,
  airedByMember: Map<number, number>,
): ContinueTarget | null {
  let lastStarted = -1;
  orderedMemberIds.forEach((id, i) => {
    if ((progress.get(id)?.watched.size ?? 0) > 0) lastStarted = i;
  });
  const startIndex = lastStarted === -1 ? 0 : lastStarted;
  for (let i = startIndex; i < orderedMemberIds.length; i++) {
    const id = orderedMemberIds[i];
    const aired = airedByMember.get(id) ?? 0;
    if (aired === 0) continue;
    const watched = progress.get(id)?.watched ?? new Set<number>();
    for (let ep = 1; ep <= aired; ep++) {
      if (!watched.has(ep)) return { memberId: id, episode: ep };
    }
  }
  return null;
}

/** Aired-but-unwatched episodes from the continue point onward — the badge count. */
export function behindFrom(
  target: ContinueTarget | null,
  orderedMemberIds: readonly number[],
  progress: Map<number, MemberProgress>,
  airedByMember: Map<number, number>,
): number {
  if (target === null) return 0;
  const from = orderedMemberIds.indexOf(target.memberId);
  if (from === -1) return 0;
  let behind = 0;
  for (let i = from; i < orderedMemberIds.length; i++) {
    const id = orderedMemberIds[i];
    const aired = airedByMember.get(id) ?? 0;
    const watched = progress.get(id)?.watched ?? new Set<number>();
    for (let ep = 1; ep <= aired; ep++) if (!watched.has(ep)) behind++;
  }
  return behind;
}
