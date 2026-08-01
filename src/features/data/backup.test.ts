import { describe, expect, it } from 'vitest';
import { EXPORT_VERSION, buildExport, exportFileName, parseBackup } from './backup';

const ENTRY = {
  showId: 21,
  idMal: 21,
  status: 'watching' as const,
  showScore: 8,
  source: 'manual' as const,
};
const LOG = { showId: 21, episodeNumber: 3, watchedAt: 1700000000000, score: 9 };

describe('buildExport', () => {
  it('stamps the current version and an ISO timestamp', () => {
    const now = new Date('2026-07-31T12:00:00.000Z');
    expect(buildExport([ENTRY], [LOG], now)).toEqual({
      version: EXPORT_VERSION,
      timestamp: '2026-07-31T12:00:00.000Z',
      library: [ENTRY],
      logs: [LOG],
    });
    expect(exportFileName(now)).toBe('senpai-data-2026-07-31.json');
  });
});

describe('parseBackup', () => {
  it('round-trips what buildExport writes', () => {
    const parsed = parseBackup(JSON.parse(JSON.stringify(buildExport([ENTRY], [LOG]))));
    expect(parsed).toEqual({ library: [ENTRY], logs: [LOG] });
  });

  it('accepts the version 1 shape', () => {
    const parsed = parseBackup({ version: 1, timestamp: 'x', library: [ENTRY], logs: [LOG] });
    expect(parsed.library).toHaveLength(1);
    expect(parsed.logs).toHaveLength(1);
  });

  it('accepts a bare id list under `favorites`', () => {
    const parsed = parseBackup({ favorites: [21, 22] });
    expect(parsed.library.map((e) => e.showId)).toEqual([21, 22]);
    expect(parsed.library[0].status).toBe('watching');
  });

  it('accepts the retired log-only export (a bare array)', () => {
    expect(parseBackup([LOG])).toEqual({ library: [], logs: [LOG] });
  });

  it('drops junk rows instead of failing the whole file', () => {
    const parsed = parseBackup({
      library: [ENTRY, { nope: true }, null],
      logs: [LOG, { showId: 'x' }],
    });
    expect(parsed.library).toHaveLength(1);
    expect(parsed.logs).toHaveLength(1);
  });

  it('rejects files with nothing importable', () => {
    expect(() => parseBackup({ library: [], logs: [] })).toThrow(/No shows or episode logs/);
    expect(() => parseBackup('nope')).toThrow(/Senpai backup file/);
    expect(() => parseBackup([{ title: 'not a log' }])).toThrow(/Senpai backup file/);
  });
});
