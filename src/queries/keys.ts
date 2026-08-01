import type { QueryKey } from '@tanstack/react-query';
import type { SeasonSlug } from '../routes/season';

/**
 * Every query key in the app. Keys are built here and nowhere else so the
 * persistence allowlist below can be exhaustive by construction.
 */
export const queryKeys = {
  /** The current season + everything releasing — the schedule and watching views. */
  schedule: () => ['schedule', 'current'] as const,
  season: (year: number, season: SeasonSlug) => ['season', year, season] as const,
  search: (term: string) => ['search', term] as const,
  /** One AniList media record, resolved through the id_in micro-batcher. */
  media: (id: number) => ['media', id] as const,
  /** Jikan + Kitsu + AI summary + the full by-id record, for the detail modal. */
  showDetails: (id: number) => ['showDetails', id] as const,
};

/**
 * Query families written to localStorage. Search is deliberately absent:
 * results are cheap to re-run, worthless on the next visit, and would other-
 * wise grow the persisted blob by one entry per keystroke-debounced term.
 */
const PERSISTED_ROOTS: ReadonlySet<string> = new Set(['schedule', 'season', 'media', 'showDetails']);

export function isPersistedKey(key: QueryKey): boolean {
  return typeof key[0] === 'string' && PERSISTED_ROOTS.has(key[0]);
}
