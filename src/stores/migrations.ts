import { z } from 'zod';
import { EpisodeLog, LibraryEntry, LibraryStatus } from '../types';
import { readJSON, removeKey, writeJSON } from './storage';
import type { SeriesOverrides, UiPrefs } from './userData';

/**
 * One-shot lossless migration of the scattered legacy localStorage keys into
 * the single persisted zustand blob at `senpai.userdata.v3`.
 *
 * Runs at userData store-module import, BEFORE the store is created, and only
 * when the v3 key is absent. Every legacy key is read through its own guard so
 * one corrupt value cannot sink the rest. Once the v3 blob exists the legacy
 * keys are deleted — including on later boots, for profiles migrated while the
 * keys were still being retained as a rollback hedge.
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
export function normalizeLibraryEntry(raw: unknown): LibraryEntry | null {
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

export const EpisodeLogSchema = z.object({
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

/**
 * Caches the TanStack Query layer replaced. Every one of these is re-fetchable
 * AniList or upstream data holding no user state, so they are dropped
 * unconditionally rather than migrated.
 */
const RETIRED_CACHE_KEYS = [
  'senpai_cached_schedule_v2',
  'senpai_cached_schedule_time_v2',
  'senpai_library_cache',
  'senpai_favorites_cache',
  // The old series reverse map. Franchise graphs now live in the query cache,
  // which knows how to expire them; `senpai_series_<id>` blobs never did.
  'senpai_series_reverse_map',
];
const RETIRED_CACHE_PREFIXES = ['anime_details_', 'senpai_series_'];

/**
 * `senpai_series_overrides` shares the retired `senpai_series_` prefix but is
 * user data, and this cleanup runs *before* the migration that reads it.
 */
const PRESERVED_KEYS: ReadonlySet<string> = new Set(['senpai_series_overrides']);

export function cleanupRetiredCacheKeys(): void {
  for (const key of RETIRED_CACHE_KEYS) removeKey(key);

  let keys: string[];
  try {
    keys = Object.keys(localStorage);
  } catch (err) {
    console.warn('[migrations] Could not enumerate localStorage; skipping prefix cleanup.', err);
    return;
  }
  for (const key of keys) {
    if (PRESERVED_KEYS.has(key)) continue;
    if (RETIRED_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) removeKey(key);
  }
}

/**
 * The pre-v3 user-data keys, now fully represented inside the v3 blob.
 *
 * `senpai_recommendations` is absent on purpose: it is still the live
 * persistence for useRecommendations, not legacy. So are the two current keys,
 * `senpai.userdata.v3` and `senpai.queryCache.v1`.
 */
const LEGACY_USER_DATA_KEYS = [
  'anime_library',
  'anime_favorites',
  'anime_episode_logs',
  'senpai_simulcast_offsets',
  'senpai_series_overrides',
  'schedule_includeMovies',
  // Retired with the Sub/Dub filter it fed, which never actually filtered.
  'schedule_audioType',
  'schedule_selectedSources',
];

/**
 * Delete the migrated-from keys, but only once the v3 blob is actually on
 * disk. Gating on its presence means a migration write that failed (quota,
 * private-browsing) leaves the originals untouched and retries next boot.
 */
export function retireLegacyUserDataKeys(): void {
  if (!hasKey(USER_DATA_KEY)) return;
  for (const key of LEGACY_USER_DATA_KEYS) removeKey(key);
}

export function runMigrations(): void {
  // Runs on every boot: unlike the import below it is not one-shot, because a
  // profile can still be carrying these from before the query layer landed.
  cleanupRetiredCacheKeys();
  migrateLegacyUserData();
  // Must follow the import above — it reads several of the keys this deletes.
  retireLegacyUserDataKeys();
}

function migrateLegacyUserData(): void {
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
