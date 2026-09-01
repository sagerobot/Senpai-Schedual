import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { EpisodeLog, LibraryEntry } from '../types';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

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

function quotaError(): Error {
  const err = new Error('storage full');
  err.name = 'QuotaExceededError';
  return err;
}

type UserDataModule = typeof import('./userData');
type ToastMock = Mock & { error: Mock };

let storage: MemoryStorage;
let mod: UserDataModule;
let toastMock: ToastMock;

beforeEach(async () => {
  storage = createMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.resetModules();
  const sonner = await import('sonner');
  toastMock = sonner.toast as unknown as ToastMock;
  toastMock.mockClear();
  toastMock.error.mockClear();
  mod = await import('./userData');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const state = () => mod.useUserData.getState();

describe('library actions', () => {
  it('round-trips remove/restore including the show logs', () => {
    state().addToLibrary(1);
    state().logEpisode(1, 1);
    state().logEpisode(1, 2, 8);
    state().logEpisode(99, 1); // unrelated show survives

    const snapshot = state().removeFromLibrary(1);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.entry.showId).toBe(1);
    expect(snapshot!.entry.status).toBe('watching');
    expect(snapshot!.logs.map((l) => l.episodeNumber).sort()).toEqual([1, 2]);
    expect(state().library[1]).toBeUndefined();
    expect(Object.keys(state().logs)).toEqual(['99:1']);

    state().restoreSnapshot(snapshot!);

    expect(state().library[1]).toEqual(snapshot!.entry);
    expect(state().logs['1:2'].score).toBe(8);
    expect(state().logs['99:1']).toBeDefined();
  });

  it('removeFromLibrary returns null for an absent show and changes nothing', () => {
    state().logEpisode(5, 1);
    expect(state().removeFromLibrary(42)).toBeNull();
    expect(Object.keys(state().logs)).toEqual(['5:1']);
  });

  it('preserves a showScore of 0 through create and update paths', () => {
    state().upsertEntry(7, { showScore: 0 }); // create path
    expect(state().library[7].showScore).toBe(0);

    state().setShowScore(7, 0);
    expect(state().library[7].showScore).toBe(0);

    state().setShowScore(7, null);
    expect(state().library[7].showScore).toBeNull();

    state().setLibraryBulk([
      { showId: 8, idMal: 0, status: 'completed', showScore: 0, source: 'mal_import' },
    ]);
    expect(state().library[8].showScore).toBe(0);
    expect(state().library[8].idMal).toBe(0);
  });

  it('setLibraryBulk merges over existing entries by showId', () => {
    state().upsertEntry(1, { status: 'watching', showScore: 6 });
    state().setLibraryBulk([
      { showId: 1, idMal: 111, status: 'completed', showScore: 9, source: 'mal_import' },
      { showId: 2, idMal: null, status: 'plan_to_watch', showScore: null, source: 'manual' },
    ]);
    expect(state().library[1].status).toBe('completed');
    expect(state().library[1].showScore).toBe(9);
    expect(state().library[2].status).toBe('plan_to_watch');
  });
});

describe('log actions', () => {
  it('setLogsBulk upserts by key so re-imports repair scores', () => {
    state().logEpisode(1, 1, null);
    const repaired: EpisodeLog[] = [
      { showId: 1, episodeNumber: 1, watchedAt: 123, score: 9 },
      { showId: 2, episodeNumber: 5, watchedAt: 456, score: null },
    ];

    state().setLogsBulk(repaired);

    expect(state().logs['1:1']).toEqual({ showId: 1, episodeNumber: 1, watchedAt: 123, score: 9 });
    expect(state().logs['2:5']).toEqual({ showId: 2, episodeNumber: 5, watchedAt: 456, score: null });
    expect(Object.keys(state().logs)).toHaveLength(2);
  });

  it('logEpisodesThrough bulk-logs 1..n but skips existing logs', () => {
    state().logEpisode(3, 2, 7);
    const existing = state().logs['3:2'];

    state().logEpisodesThrough(3, 4);

    expect(Object.keys(state().logs).sort()).toEqual(['3:1', '3:2', '3:3', '3:4']);
    expect(state().logs['3:2']).toBe(existing); // untouched, score kept
    expect(state().logs['3:1'].score).toBeNull();
  });

  it('unlogEpisode removes exactly one log', () => {
    state().logEpisode(4, 1);
    state().logEpisode(4, 2);
    state().unlogEpisode(4, 1);
    expect(Object.keys(state().logs)).toEqual(['4:2']);
  });
});

describe('offsets, overrides, uiPrefs', () => {
  it('setOffset stores minutes and clears on 0/undefined', () => {
    state().setOffset(11, 90);
    expect(state().offsets[11]).toBe(90);

    state().setOffset(11, 0);
    expect(state().offsets[11]).toBeUndefined();

    // The store is now the only home for offsets — the transform in
    // src/queries/offsets.ts reads this slice, so nothing mirrors to the
    // retired `senpai_simulcast_offsets` key any more.
    expect(storage.getItem('senpai_simulcast_offsets')).toBeNull();

    state().setOffset(12, 30);
    state().setOffset(12, undefined);
    expect(state().offsets[12]).toBeUndefined();
  });

  it('splitShow and mergeShow update overrides without duplicates', () => {
    state().splitShow(5);
    state().splitShow(5);
    state().mergeShow(6, 60);
    expect(state().overrides).toEqual({ merges: { 6: 60 }, splits: [5] });
  });

  it('setUiPrefs merges partial updates', () => {
    state().setUiPrefs({ includeMovies: true });
    state().setUiPrefs({ selectedSources: ['Netflix'] });
    expect(state().uiPrefs).toEqual({ includeMovies: true, selectedSources: ['Netflix'] });
  });

  it('skipDrop keeps one skip per show and unskipDrop clears it', () => {
    state().skipDrop(9, 5);
    expect(state().dropSkips[9].episode).toBe(5);
    expect(state().dropSkips[9].skippedAt).toBeTypeOf('number');

    state().skipDrop(9, 6); // next week's skip supersedes
    state().skipDrop(10, 3);
    expect(state().dropSkips[9].episode).toBe(6);

    state().unskipDrop(9);
    expect(state().dropSkips[9]).toBeUndefined();
    expect(state().dropSkips[10].episode).toBe(3);
  });
});

describe('persistence', () => {
  it('persists under senpai.userdata.v3 and clearAll wipes state and the key', () => {
    state().addToLibrary(1);

    const raw = storage.getItem('senpai.userdata.v3');
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw!);
    expect(persisted.version).toBe(3);
    expect(persisted.state.library['1'].status).toBe('watching');

    state().clearAll();

    expect(state().library).toEqual({});
    expect(state().logs).toEqual({});
    expect(storage.getItem('senpai.userdata.v3')).toBeNull();
  });

  it('hydrates existing v3 state at import time', async () => {
    const entry: LibraryEntry = {
      showId: 1,
      idMal: 10,
      status: 'completed',
      showScore: 0,
      source: 'mal_import',
    };
    storage.clear();
    storage.setItem(
      'senpai.userdata.v3',
      JSON.stringify({
        state: {
          library: { '1': entry },
          logs: { '1:1': { showId: 1, episodeNumber: 1, watchedAt: 5, score: null } },
          offsets: {},
          overrides: { merges: {}, splits: [] },
          uiPrefs: { includeMovies: true, selectedSources: ['Netflix'] },
        },
        version: 3,
      }),
    );
    vi.resetModules();

    const fresh = await import('./userData');

    expect(fresh.useUserData.getState().library[1]).toEqual(entry);
    expect(fresh.useUserData.getState().logs['1:1'].watchedAt).toBe(5);
    expect(fresh.useUserData.getState().uiPrefs).toEqual({ includeMovies: true, selectedSources: ['Netflix'] });
    // A pre-dropSkips blob hydrates to the empty default, not undefined.
    expect(fresh.useUserData.getState().dropSkips).toEqual({});
  });

  it('round-trips dropSkips through the persisted blob', async () => {
    state().skipDrop(9, 5);

    const raw = storage.getItem('senpai.userdata.v3');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).state.dropSkips['9'].episode).toBe(5);

    // The whole reason skips live in the store: they must outlive the session.
    vi.resetModules();
    const fresh = await import('./userData');
    expect(fresh.useUserData.getState().dropSkips[9].episode).toBe(5);
  });

  it('surfaces a quota failure via a single toast until a write succeeds again', () => {
    storage.setItem.mockImplementation(() => {
      throw quotaError();
    });

    state().addToLibrary(1);
    state().addToLibrary(2);

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(toastMock.error).toHaveBeenCalledWith(
      'Storage full — change not saved. Export your data from Data & Settings.',
    );
  });
});

describe('selectors', () => {
  it('selectLibraryArray and selectLogsArray are stable for unchanged records', () => {
    state().addToLibrary(1);
    state().logEpisode(1, 1);

    const libA = mod.selectLibraryArray(state());
    const libB = mod.selectLibraryArray(state());
    const logsA = mod.selectLogsArray(state());
    const logsB = mod.selectLogsArray(state());

    expect(libA).toBe(libB);
    expect(logsA).toBe(logsB);

    state().addToLibrary(2);
    expect(mod.selectLibraryArray(state())).not.toBe(libA);
    expect(mod.selectLogsArray(state())).toBe(logsA); // logs record untouched
  });
});
