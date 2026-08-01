import { z } from 'zod';
import { EpisodeLog, LibraryEntry, LibraryStatus } from '../types';
import { readJSON, writeJSON } from './storage';
import type { SeriesOverrides, UiPrefs } from './userData';

/**
 * One-shot lossless migration of the scattered legacy localStorage keys into
 * the single persisted zustand blob at `senpai.userdata.v3`.
 *
 * Runs at userData store-module import, BEFORE the store is created, and only
 * when the v3 key is absent. Every legacy key is read through its own guard so
 * one corrupt value cannot sink the rest. Legacy keys are deliberately left in
 * place as a rollback hedge; a later wave removes them.
 */

export const USER_DATA_KEY = 'senpai.userdata.v3';

const VALID_STATUSES: readonly LibraryStatus[] = [
  'watching',
  'completed',
  'on_hold',
  'dropped',
  'plan_to_watch',
];

function hasKey(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

/** Normalize one legacy library entry; entries without a numeric showId are dropped. */
function normalizeLibraryEntry(raw: unknown): LibraryEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.showId !== 'number') return null;

  const entry: LibraryEntry = {
    showId: e.showId,
    idMal: typeof e.idMal === 'number' ? e.idMal : null,
    status: (VALID_STATUSES as readonly unknown[]).includes(e.status)
      ? (e.status as LibraryStatus)
      : 'plan_to_watch',
    showScore: typeof e.showScore === 'number' ? e.showScore : null,
    source: e.source === 'mal_import' ? 'mal_import' : 'manual',
  };
  if (typeof e.updatedAt === 'number') entry.updatedAt = e.updatedAt;
  if (typeof e.simulcastOffset === 'number') entry.simulcastOffset = e.simulcastOffset;
  return entry;
}

const EpisodeLogSchema = z.object({
  showId: z.number(),
  episodeNumber: z.number(),
  watchedAt: z.number().catch(0),
  score: z.number().nullable().catch(null),
});

const OverridesSchema = z
  .object({
    merges: z.record(z.string(), z.number()).catch({}),
    splits: z.array(z.number()).catch([]),
  })
  .catch({ merges: {}, splits: [] });

/** JSON object keys are strings; re-key onto the numeric records the store uses. */
function toNumberKeys(record: Record<string, number>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [key, value] of Object.entries(record)) {
    const id = Number(key);
    if (Number.isFinite(id)) out[id] = value;
  }
  return out;
}

export function runMigrations(): void {
  if (hasKey(USER_DATA_KEY)) return;

  // Library. Legacy `anime_favorites` (a bare id list) only counts when
  // `anime_library` never existed, matching the old useLibrary migration.
  const library: Record<number, LibraryEntry> = {};
  if (hasKey('anime_library')) {
    const rawLibrary = readJSON('anime_library', z.array(z.unknown()), []);
    for (const item of rawLibrary) {
      const entry = normalizeLibraryEntry(item);
      if (entry) library[entry.showId] = entry;
    }
  } else {
    const favorites = readJSON('anime_favorites', z.array(z.number()), []);
    for (const id of favorites) {
      library[id] = { showId: id, idMal: null, status: 'watching', showScore: null, source: 'manual' };
    }
  }

  const logs: Record<string, EpisodeLog> = {};
  const rawLogs = readJSON('anime_episode_logs', z.array(z.unknown()), []);
  for (const item of rawLogs) {
    const parsed = EpisodeLogSchema.safeParse(item);
    if (parsed.success) {
      logs[`${parsed.data.showId}:${parsed.data.episodeNumber}`] = parsed.data;
    }
  }

  const offsets = toNumberKeys(readJSON('senpai_simulcast_offsets', z.record(z.string(), z.number()), {}));

  const rawOverrides = readJSON('senpai_series_overrides', OverridesSchema, { merges: {}, splits: [] });
  const overrides: SeriesOverrides = {
    merges: toNumberKeys(rawOverrides.merges),
    splits: rawOverrides.splits,
  };

  const uiPrefs: UiPrefs = {
    includeMovies: readJSON('schedule_includeMovies', z.boolean(), false),
    selectedSources: readJSON('schedule_selectedSources', z.array(z.string()), []),
  };

  // Exactly the shape zustand's persist middleware reads back.
  writeJSON(USER_DATA_KEY, {
    state: { library, logs, offsets, overrides, uiPrefs },
    version: 3,
  });
}
