/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MalEntry } from './malParser';
import { importMalFile, mapMalEntries } from './malImport';
import { fetchAnimeByMalIds } from '../api/anilist/queries';

vi.mock('../api/anilist/queries', () => ({
  fetchAnimeByMalIds: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchAnimeByMalIds);

const malEntry = (overrides: Partial<MalEntry> = {}): MalEntry => ({
  series_animedb_id: 100,
  my_status: 1,
  my_score: 0,
  my_watched_episodes: 0,
  ...overrides,
});

describe('mapMalEntries', () => {
  const NOW = 1_700_000_000_000;

  it('maps every MAL status code to the right LibraryStatus', () => {
    const cases: Array<[number, string]> = [
      [1, 'watching'],
      [2, 'completed'],
      [3, 'on_hold'],
      [4, 'dropped'],
      [6, 'plan_to_watch'],
    ];
    for (const [code, expected] of cases) {
      const { entries } = mapMalEntries(
        [malEntry({ series_animedb_id: 100, my_status: code })],
        { 100: 900 },
        NOW,
      );
      expect(entries).toHaveLength(1);
      expect(entries[0].status).toBe(expected);
    }
  });

  it('defaults unknown status codes to plan_to_watch', () => {
    const { entries } = mapMalEntries([malEntry({ my_status: 5 })], { 100: 900 }, NOW);
    expect(entries[0].status).toBe('plan_to_watch');
  });

  it('maps score 0 to null and keeps positive scores', () => {
    const { entries } = mapMalEntries(
      [
        malEntry({ series_animedb_id: 100, my_score: 0 }),
        malEntry({ series_animedb_id: 101, my_score: 8 }),
      ],
      { 100: 900, 101: 901 },
      NOW,
    );
    expect(entries[0].showScore).toBeNull();
    expect(entries[1].showScore).toBe(8);
  });

  it('synthesizes one unscored log per watched episode', () => {
    const { logs } = mapMalEntries(
      [malEntry({ series_animedb_id: 100, my_watched_episodes: 3 })],
      { 100: 900 },
      NOW,
    );
    expect(logs).toEqual([
      { showId: 900, episodeNumber: 1, watchedAt: NOW, score: null },
      { showId: 900, episodeNumber: 2, watchedAt: NOW, score: null },
      { showId: 900, episodeNumber: 3, watchedAt: NOW, score: null },
    ]);
  });

  it('synthesizes no logs when nothing was watched', () => {
    const { logs } = mapMalEntries([malEntry({ my_watched_episodes: 0 })], { 100: 900 }, NOW);
    expect(logs).toHaveLength(0);
  });

  it('counts unmatched MAL ids as failed and emits nothing for them', () => {
    const { entries, logs, failed } = mapMalEntries(
      [
        malEntry({ series_animedb_id: 100, my_watched_episodes: 2 }),
        malEntry({ series_animedb_id: 555, my_watched_episodes: 4 }),
      ],
      { 100: 900 },
      NOW,
    );
    expect(failed).toBe(1);
    expect(entries).toHaveLength(1);
    expect(entries[0].showId).toBe(900);
    expect(logs.every((l) => l.showId === 900)).toBe(true);
  });

  it('marks imported entries as mal_import with the MAL id kept', () => {
    const { entries } = mapMalEntries([malEntry({ series_animedb_id: 42 })], { 42: 777 }, NOW);
    expect(entries[0]).toMatchObject({ showId: 777, idMal: 42, source: 'mal_import', updatedAt: NOW });
  });
});

describe('importMalFile', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  const XML = `<?xml version="1.0" encoding="UTF-8"?>
    <myanimelist>
      <anime>
        <series_animedb_id>100</series_animedb_id>
        <my_status>2</my_status>
        <my_score>7</my_score>
        <my_watched_episodes>2</my_watched_episodes>
      </anime>
      <anime>
        <series_animedb_id>200</series_animedb_id>
        <my_status>6</my_status>
        <my_score>0</my_score>
        <my_watched_episodes>0</my_watched_episodes>
      </anime>
    </myanimelist>`;

  it('parses a MAL XML file, resolves ids, and maps entries + logs', async () => {
    mockedFetch.mockResolvedValue([
      { id: 900, idMal: 100 },
    ] as Awaited<ReturnType<typeof fetchAnimeByMalIds>>);

    const file = new File([XML], 'animelist.xml', { type: 'text/xml' });
    const onProgress = vi.fn();
    const result = await importMalFile(file, onProgress);

    expect(mockedFetch).toHaveBeenCalledWith([100, 200], onProgress);
    expect(onProgress).toHaveBeenCalledWith(0, 2);

    expect(result.failed).toBe(1); // 200 had no AniList match
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      showId: 900,
      idMal: 100,
      status: 'completed',
      showScore: 7,
      source: 'mal_import',
    });
    expect(result.logs.map((l) => l.episodeNumber)).toEqual([1, 2]);
  });

  it('propagates AniList resolution failures to the caller', async () => {
    mockedFetch.mockRejectedValue(new Error('network down'));
    const file = new File([XML], 'animelist.xml', { type: 'text/xml' });
    await expect(importMalFile(file)).rejects.toThrow('network down');
  });
});
