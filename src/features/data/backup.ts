import { EpisodeLog, LibraryEntry } from '../../types';
import { EpisodeLogSchema, normalizeLibraryEntry } from '../../stores/migrations';

/**
 * The one backup format. Settings is the only place that writes it, and the
 * only place that reads one back in — the two earlier ad-hoc downloads (a bare
 * log array, and Library's `{library, logs}`) are gone.
 *
 * Reads stay generous: anything that ever left this app should import cleanly,
 * so the parser accepts the older shapes as well as version 2.
 */

export const EXPORT_VERSION = 2;

export interface BackupFile {
  version: number;
  timestamp: string;
  library: LibraryEntry[];
  logs: EpisodeLog[];
}

export interface ParsedBackup {
  library: LibraryEntry[];
  logs: EpisodeLog[];
}

export function buildExport(library: LibraryEntry[], logs: EpisodeLog[], now = new Date()): BackupFile {
  return { version: EXPORT_VERSION, timestamp: now.toISOString(), library, logs };
}

export function exportFileName(now = new Date()): string {
  return `senpai-data-${now.toISOString().slice(0, 10)}.json`;
}

function looksLikeLog(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'episodeNumber' in value;
}

/**
 * Turn file contents into the two arrays the store merges. Throws with a
 * user-facing message when there is nothing importable — callers show it.
 */
export function parseBackup(raw: unknown): ParsedBackup {
  if (raw === null || typeof raw !== 'object') {
    throw new Error("That doesn't look like a Senpai backup file.");
  }

  let rawLibrary: unknown[] = [];
  let rawLogs: unknown[] = [];

  if (Array.isArray(raw)) {
    // The retired log-only export was a bare array of episode logs.
    if (raw.length > 0 && !looksLikeLog(raw[0])) {
      throw new Error("That doesn't look like a Senpai backup file.");
    }
    rawLogs = raw;
  } else {
    const data = raw as Record<string, unknown>;
    if (Array.isArray(data.library)) {
      rawLibrary = data.library;
    } else if (Array.isArray(data.favorites)) {
      // Pre-library exports carried a bare id list, all of it "watching".
      rawLibrary = data.favorites.map((id) => ({ showId: id, status: 'watching' }));
    }
    if (Array.isArray(data.logs)) rawLogs = data.logs;
  }

  const library: LibraryEntry[] = [];
  for (const item of rawLibrary) {
    const entry = normalizeLibraryEntry(item);
    if (entry) library.push(entry);
  }

  const logs: EpisodeLog[] = [];
  for (const item of rawLogs) {
    const parsed = EpisodeLogSchema.safeParse(item);
    if (parsed.success) logs.push(parsed.data);
  }

  if (library.length === 0 && logs.length === 0) {
    throw new Error('No shows or episode logs found in that file.');
  }

  return { library, logs };
}
