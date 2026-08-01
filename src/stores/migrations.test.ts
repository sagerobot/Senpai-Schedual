import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { runMigrations, USER_DATA_KEY } from './migrations';

interface MemoryStorage {
  getItem: Mock<(key: string) => string | null>;
  setItem: Mock<(key: string, value: string) => void>;
  removeItem: Mock<(key: string) => void>;
  clear: () => void;
}

function createMemoryStorage(): MemoryStorage {
  const map = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => (map.has(key) ? map.get(key)! : null)),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, String(value));
    }),
    removeItem: vi.fn((key: string) => {
      map.delete(key);
    }),
    clear: () => map.clear(),
  };
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = createMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const persisted = () => JSON.parse(storage.getItem(USER_DATA_KEY)!);

describe('runMigrations', () => {
  it('is a no-op when senpai.userdata.v3 already exists', () => {
    const existing = JSON.stringify({ state: { library: {} }, version: 3 });
    storage.setItem(USER_DATA_KEY, existing);
    storage.setItem('anime_library', JSON.stringify([{ showId: 1, status: 'watching' }]));

    runMigrations();

    expect(storage.getItem(USER_DATA_KEY)).toBe(existing);
  });

  it('writes an empty v3 state for a fresh user', () => {
    runMigrations();

    expect(persisted()).toEqual({
      state: {
        library: {},
        logs: {},
        offsets: {},
        overrides: { merges: {}, splits: [] },
        uiPrefs: { includeMovies: false, selectedSources: [] },
      },
      version: 3,
    });
  });

  it('migrates a legacy anime_favorites-only user to watching entries', () => {
    storage.setItem('anime_favorites', JSON.stringify([101, 202]));

    runMigrations();

    expect(persisted()).toEqual({
      state: {
        library: {
          '101': { showId: 101, idMal: null, status: 'watching', showScore: null, source: 'manual' },
          '202': { showId: 202, idMal: null, status: 'watching', showScore: null, source: 'manual' },
        },
        logs: {},
        offsets: {},
        overrides: { merges: {}, splits: [] },
        uiPrefs: { includeMovies: false, selectedSources: [] },
      },
      version: 3,
    });
    expect(storage.getItem('anime_favorites')).toBe(JSON.stringify([101, 202]));
  });

  it('migrates a MAL-imported user losslessly, normalizing malformed entries', () => {
    const library = [
      // fully-formed entry; showScore 0 must survive
      { showId: 1, idMal: 100, status: 'completed', showScore: 0, source: 'mal_import', updatedAt: 1700000000000 },
      // malformed: missing idMal/showScore/source, unknown status, junk field
      { showId: 2, status: 'currently_viewing', junk: true },
      // optional simulcastOffset preserved
      { showId: 3, idMal: null, status: 'watching', showScore: 8.5, source: 'manual', simulcastOffset: 60 },
      // no numeric showId: dropped
      { notAShow: true },
    ];
    const logs: Array<Record<string, unknown>> = [];
    for (let ep = 1; ep <= 1200; ep++) {
      logs.push({ showId: 1, episodeNumber: ep, watchedAt: 1690000000000 + ep, score: ep % 10 === 0 ? 9 : null });
    }
    logs.push({ showId: 3, episodeNumber: 1, watchedAt: 1699999999999 }); // missing score

    storage.setItem('anime_library', JSON.stringify(library));
    storage.setItem('anime_favorites', JSON.stringify([999])); // ignored: anime_library present
    storage.setItem('anime_episode_logs', JSON.stringify(logs));
    storage.setItem('senpai_simulcast_offsets', JSON.stringify({ '1': 30, '3': -15 }));
    storage.setItem('senpai_series_overrides', JSON.stringify({ merges: { '55': 44 }, splits: [77] }));
    storage.setItem('schedule_includeMovies', 'true');
    storage.setItem('schedule_selectedSources', JSON.stringify(['Crunchyroll', 'HIDIVE']));

    runMigrations();

    const v3 = persisted();
    expect(v3.version).toBe(3);
    expect(v3.state.library).toEqual({
      '1': { showId: 1, idMal: 100, status: 'completed', showScore: 0, source: 'mal_import', updatedAt: 1700000000000 },
      '2': { showId: 2, idMal: null, status: 'plan_to_watch', showScore: null, source: 'manual' },
      '3': { showId: 3, idMal: null, status: 'watching', showScore: 8.5, source: 'manual', simulcastOffset: 60 },
    });
    expect(Object.keys(v3.state.logs)).toHaveLength(1201);
    expect(v3.state.logs['1:1']).toEqual({ showId: 1, episodeNumber: 1, watchedAt: 1690000000001, score: null });
    expect(v3.state.logs['1:1200']).toEqual({ showId: 1, episodeNumber: 1200, watchedAt: 1690000001200, score: 9 });
    expect(v3.state.logs['3:1']).toEqual({ showId: 3, episodeNumber: 1, watchedAt: 1699999999999, score: null });
    expect(v3.state.offsets).toEqual({ '1': 30, '3': -15 });
    expect(v3.state.overrides).toEqual({ merges: { '55': 44 }, splits: [77] });
    expect(v3.state.uiPrefs).toEqual({ includeMovies: true, selectedSources: ['Crunchyroll', 'HIDIVE'] });

    // Every legacy key is left in place as a rollback hedge.
    for (const key of [
      'anime_library',
      'anime_favorites',
      'anime_episode_logs',
      'senpai_simulcast_offsets',
      'senpai_series_overrides',
      'schedule_includeMovies',
      'schedule_selectedSources',
    ]) {
      expect(storage.getItem(key)).not.toBeNull();
    }
  });

  it('keeps the library when anime_episode_logs is corrupt JSON', () => {
    storage.setItem(
      'anime_library',
      JSON.stringify([{ showId: 5, idMal: 50, status: 'watching', showScore: null, source: 'manual' }]),
    );
    storage.setItem('anime_episode_logs', '{definitely not json');

    runMigrations();

    const v3 = persisted();
    expect(v3.state.library).toEqual({
      '5': { showId: 5, idMal: 50, status: 'watching', showScore: null, source: 'manual' },
    });
    expect(v3.state.logs).toEqual({});
    expect(storage.getItem('anime_episode_logs')).toBe('{definitely not json');
  });
});
