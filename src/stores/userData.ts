import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import { toast } from 'sonner';
import type { CustomTheme, ThemeName } from '../lib/theme';
import { DropSkip, EpisodeLog, LibraryEntry, LibraryStatus } from '../types';
import { removeKey, writeJSON, WriteResult } from './storage';
import { runMigrations, USER_DATA_KEY } from './migrations';

/**
 * The single zustand store for all user data, persisted under
 * `senpai.userdata.v3`. Legacy per-feature localStorage keys are migrated in
 * by runMigrations() (see ./migrations.ts) before the store is created.
 *
 * Components consume it through the unchanged facade hooks (useLibrary,
 * useEpisodeLog, useSimulcastOffsets) and series/overrides.
 */

export { USER_DATA_KEY };

export interface SeriesOverrides {
  merges: Record<number, number>; // showId -> targetSeriesId
  splits: number[]; // showIds that should be standalone
}

/**
 * A watch source the user added themselves — a media server, a regional
 * service, anything we don't list. Lives only in this browser; the app ships
 * no presets. `{title}` in the template is replaced with the show's title at
 * read time (src/queries/offsets.ts).
 */
export interface CustomWatchSource {
  name: string;
  urlTemplate: string;
}

export interface UiPrefs {
  includeMovies: boolean;
  selectedSources: string[];
  /**
   * Schedule's Mine / Everything segment. Absent = Everything, so the tab
   * opens as a season browser; the first flip to Mine persists forever.
   * "Mine" is watching + stacking — both are shows the user has claimed.
   */
  mineOnly?: boolean;
  /** First-run hero on the schedule, closed by hand. Absent = never dismissed. */
  welcomeDismissed?: boolean;
  /** Absent = the user never added one. */
  customSource?: CustomWatchSource;
  /** Absent = Midnight. Stamped pre-paint by index.html, kept by lib/theme.ts. */
  theme?: ThemeName;
  /** Only meaningful while theme === 'custom'; kept across theme moves. */
  customTheme?: CustomTheme;
}

/** Everything removeFromLibrary takes away, so Undo can put it back. */
export interface Snapshot {
  entry: LibraryEntry;
  logs: EpisodeLog[];
}

export const logKey = (showId: number, episodeNumber: number) => `${showId}:${episodeNumber}`;

export interface UserDataState {
  library: Record<number, LibraryEntry>;
  logs: Record<string, EpisodeLog>; // keyed logKey(showId, episodeNumber)
  offsets: Record<number, number>;
  overrides: SeriesOverrides;
  uiPrefs: UiPrefs;
  /**
   * "Skip this week" on Today's Drops, keyed by showId. Persisted — unlike the
   * deck's session-scoped "Not tonight" — because the skipped drop card would
   * otherwise sit pinned on the schedule until next week's episode airs.
   * Entries go inert on their own (logging the episode or a newer airing
   * supersedes them), so nothing prunes them. Deliberately excluded from the
   * Settings backup: week-scoped ephemera, same scope rule as offsets and
   * overrides.
   */
  dropSkips: Record<number, DropSkip>;

  upsertEntry: (showId: number, update: Partial<LibraryEntry>) => void;
  setStatus: (showId: number, status: LibraryStatus) => void;
  setShowScore: (showId: number, score: number | null) => void;
  addToLibrary: (showId: number, status?: LibraryStatus) => void;
  removeFromLibrary: (showId: number) => Snapshot | null;
  restoreSnapshot: (snapshot: Snapshot) => void;
  logEpisode: (showId: number, episodeNumber: number, score?: number | null) => void;
  unlogEpisode: (showId: number, episodeNumber: number) => void;
  logEpisodesThrough: (showId: number, n: number) => void;
  setLogsBulk: (logs: EpisodeLog[]) => void;
  setLibraryBulk: (entries: LibraryEntry[]) => void;
  setOffset: (showId: number, offsetMinutes?: number) => void;
  skipDrop: (showId: number, episodeNumber: number) => void;
  unskipDrop: (showId: number) => void;
  setOverrides: (overrides: SeriesOverrides) => void;
  splitShow: (showId: number) => void;
  mergeShow: (showId: number, targetSeriesId: number) => void;
  setUiPrefs: (partial: Partial<UiPrefs>) => void;
  clearAll: () => void;
}

type PersistedUserData = Pick<
  UserDataState,
  'library' | 'logs' | 'offsets' | 'overrides' | 'uiPrefs' | 'dropSkips'
>;

const emptyData = (): PersistedUserData => ({
  library: {},
  logs: {},
  offsets: {},
  overrides: { merges: {}, splits: [] },
  uiPrefs: { includeMovies: false, selectedSources: [] },
  dropSkips: {},
});

/** One toast per quota streak; re-arms after the next successful write. */
let quotaToastShown = false;
function reportWrite(result: WriteResult): void {
  if (result.ok) {
    quotaToastShown = false;
    return;
  }
  if (result.reason === 'quota' && !quotaToastShown) {
    quotaToastShown = true;
    toast.error('Storage full — change not saved. Export your data from Data & Settings.');
  }
}

const guardedStorage: StateStorage = {
  getItem: (name) => {
    let raw: string | null;
    try {
      raw = localStorage.getItem(name);
    } catch (err) {
      console.warn(`[userData] Failed to read "${name}"; starting empty.`, err);
      return null;
    }
    if (raw === null) return null;
    try {
      JSON.parse(raw); // pre-validate so persist's own parse can never throw
    } catch (err) {
      console.warn(`[userData] Corrupt persisted state at "${name}"; starting empty.`, err);
      return null;
    }
    return raw;
  },
  // createJSONStorage hands us the already-serialized state; re-parse so the
  // write routes through writeJSON's quota policy without double-encoding.
  setItem: (name, value) => {
    reportWrite(writeJSON(name, JSON.parse(value)));
  },
  removeItem: (name) => removeKey(name),
};

runMigrations();

export const useUserData = create<UserDataState>()(
  persist(
    (set, get) => ({
      ...emptyData(),

      upsertEntry: (showId, update) => {
        const { library } = get();
        const existing = library[showId];
        const entry: LibraryEntry = existing
          ? { ...existing, ...update, showId, updatedAt: Date.now() }
          : {
              showId,
              idMal: update.idMal ?? null,
              status: update.status ?? 'watching',
              showScore: update.showScore ?? null,
              source: update.source ?? 'manual',
              updatedAt: Date.now(),
            };
        set({ library: { ...library, [showId]: entry } });
      },

      setStatus: (showId, status) => {
        get().upsertEntry(showId, { status });
      },

      setShowScore: (showId, score) => {
        get().upsertEntry(showId, { showScore: score });
      },

      addToLibrary: (showId, status = 'watching') => {
        get().upsertEntry(showId, { status });
      },

      removeFromLibrary: (showId) => {
        const { library, logs } = get();
        const entry = library[showId];
        if (entry === undefined) return null;

        const removedLogs: EpisodeLog[] = [];
        const nextLogs: Record<string, EpisodeLog> = {};
        for (const [key, log] of Object.entries(logs)) {
          if (log.showId === showId) {
            removedLogs.push(log);
          } else {
            nextLogs[key] = log;
          }
        }
        const nextLibrary = { ...library };
        delete nextLibrary[showId];
        set({ library: nextLibrary, logs: nextLogs });
        return { entry, logs: removedLogs };
      },

      restoreSnapshot: (snapshot) => {
        const { library, logs } = get();
        const nextLogs = { ...logs };
        for (const log of snapshot.logs) {
          nextLogs[logKey(log.showId, log.episodeNumber)] = log;
        }
        set({
          library: { ...library, [snapshot.entry.showId]: snapshot.entry },
          logs: nextLogs,
        });
      },

      logEpisode: (showId, episodeNumber, score = null) => {
        set({
          logs: {
            ...get().logs,
            [logKey(showId, episodeNumber)]: { showId, episodeNumber, watchedAt: Date.now(), score },
          },
        });
      },

      unlogEpisode: (showId, episodeNumber) => {
        const nextLogs = { ...get().logs };
        delete nextLogs[logKey(showId, episodeNumber)];
        set({ logs: nextLogs });
      },

      logEpisodesThrough: (showId, n) => {
        const nextLogs = { ...get().logs };
        for (let episodeNumber = 1; episodeNumber <= n; episodeNumber++) {
          const key = logKey(showId, episodeNumber);
          if (nextLogs[key] === undefined) {
            nextLogs[key] = { showId, episodeNumber, watchedAt: Date.now(), score: null };
          }
        }
        set({ logs: nextLogs });
      },

      setLogsBulk: (logs) => {
        // Upsert by key so re-imports repair existing rows instead of skipping them.
        const nextLogs = { ...get().logs };
        for (const log of logs) {
          nextLogs[logKey(log.showId, log.episodeNumber)] = log;
        }
        set({ logs: nextLogs });
      },

      setLibraryBulk: (entries) => {
        const nextLibrary = { ...get().library };
        for (const entry of entries) {
          const existing = nextLibrary[entry.showId];
          nextLibrary[entry.showId] = existing ? { ...existing, ...entry } : entry;
        }
        set({ library: nextLibrary });
      },

      setOffset: (showId, offsetMinutes) => {
        const nextOffsets = { ...get().offsets };
        if (offsetMinutes === undefined || offsetMinutes === 0 || Number.isNaN(offsetMinutes)) {
          delete nextOffsets[showId];
        } else {
          nextOffsets[showId] = offsetMinutes;
        }
        // The read-time transform (src/queries/offsets.ts) subscribes to this
        // slice, so a change repaints countdowns without a refetch.
        set({ offsets: nextOffsets });
      },

      skipDrop: (showId, episodeNumber) => {
        set({
          dropSkips: {
            ...get().dropSkips,
            [showId]: { episode: episodeNumber, skippedAt: Date.now() },
          },
        });
      },

      unskipDrop: (showId) => {
        const nextSkips = { ...get().dropSkips };
        delete nextSkips[showId];
        set({ dropSkips: nextSkips });
      },

      setOverrides: (overrides) => {
        set({ overrides });
      },

      splitShow: (showId) => {
        const { overrides } = get();
        if (overrides.splits.includes(showId)) return;
        set({ overrides: { ...overrides, splits: [...overrides.splits, showId] } });
      },

      mergeShow: (showId, targetSeriesId) => {
        const { overrides } = get();
        set({ overrides: { ...overrides, merges: { ...overrides.merges, [showId]: targetSeriesId } } });
      },

      setUiPrefs: (partial) => {
        set({ uiPrefs: { ...get().uiPrefs, ...partial } });
      },

      clearAll: () => {
        set(emptyData());
        useUserData.persist.clearStorage();
      },
    }),
    {
      name: USER_DATA_KEY,
      version: 3,
      storage: createJSONStorage(() => guardedStorage),
      partialize: (state): PersistedUserData => ({
        library: state.library,
        logs: state.logs,
        offsets: state.offsets,
        overrides: state.overrides,
        uiPrefs: state.uiPrefs,
        dropSkips: state.dropSkips,
      }),
    },
  ),
);

// Components expect arrays; memoize per record identity so selector results
// are referentially stable between renders.
const libraryArrayCache = new WeakMap<Record<number, LibraryEntry>, LibraryEntry[]>();
export function selectLibraryArray(state: Pick<UserDataState, 'library'>): LibraryEntry[] {
  let arr = libraryArrayCache.get(state.library);
  if (arr === undefined) {
    arr = Object.values(state.library);
    libraryArrayCache.set(state.library, arr);
  }
  return arr;
}

const logsArrayCache = new WeakMap<Record<string, EpisodeLog>, EpisodeLog[]>();
export function selectLogsArray(state: Pick<UserDataState, 'logs'>): EpisodeLog[] {
  let arr = logsArrayCache.get(state.logs);
  if (arr === undefined) {
    arr = Object.values(state.logs);
    logsArrayCache.set(state.logs, arr);
  }
  return arr;
}
