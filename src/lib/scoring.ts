import type { EpisodeLog, LibraryEntry } from '../types';

/**
 * The one place "how much did this user like this show" is computed.
 *
 * An explicit show score always wins — including 0, which is a legal rating
 * and must not fall through to the average (`??` semantics, never `||`).
 * Without one, the average of the show's scored episode logs stands in, so
 * people who only rate episodes still unlock For You.
 */
export function getEffectiveScore(
  entry: LibraryEntry | undefined,
  logs: EpisodeLog[],
): number | null {
  if (entry === undefined) return null;
  if (entry.showScore !== null && entry.showScore !== undefined) return entry.showScore;

  let sum = 0;
  let count = 0;
  for (const log of logs) {
    if (log.showId !== entry.showId || log.score === null) continue;
    sum += log.score;
    count++;
  }
  if (count === 0) return null;

  return Math.round((sum / count) * 10) / 10;
}
