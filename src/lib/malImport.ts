import { EpisodeLog, LibraryEntry, LibraryStatus } from '../types';
import { fetchAnimeByMalIds } from '../api/anilist/queries';
import { MalEntry, parseMalXml } from './malParser';

export interface MalImportResult {
  entries: LibraryEntry[];
  logs: EpisodeLog[];
  /** MAL entries that could not be matched to an AniList id. */
  failed: number;
}

/** MAL numeric status codes → LibraryStatus. Unknown codes fall back to plan_to_watch. */
const MAL_STATUS_MAP: Record<number, LibraryStatus> = {
  1: 'watching',
  2: 'completed',
  3: 'on_hold',
  4: 'dropped',
  6: 'plan_to_watch',
};

/**
 * Pure mapping from parsed MAL entries to library entries + synthesized episode
 * logs (one log per watched episode, so imported history participates in
 * catch-up and recap). Exported separately so it is testable without the
 * network half.
 */
export function mapMalEntries(
  malEntries: MalEntry[],
  malToAnilist: Record<number, number>,
  now: number = Date.now(),
): MalImportResult {
  const entries: LibraryEntry[] = [];
  const logs: EpisodeLog[] = [];
  let failed = 0;

  for (const entry of malEntries) {
    const showId = malToAnilist[entry.series_animedb_id];
    if (showId === undefined) {
      failed++;
      continue;
    }

    entries.push({
      showId,
      idMal: entry.series_animedb_id,
      status: MAL_STATUS_MAP[entry.my_status] ?? 'plan_to_watch',
      showScore: entry.my_score > 0 ? entry.my_score : null,
      source: 'mal_import',
      updatedAt: now,
    });

    for (let episodeNumber = 1; episodeNumber <= entry.my_watched_episodes; episodeNumber++) {
      logs.push({ showId, episodeNumber, watchedAt: now, score: null });
    }
  }

  return { entries, logs, failed };
}

async function readFileText(file: File): Promise<string> {
  if (file.name.endsWith('.gz')) {
    const ds = new DecompressionStream('gzip');
    const decompressed = file.stream().pipeThrough(ds);
    return await new Response(decompressed).text();
  }
  return await file.text();
}

/**
 * Parse a MAL XML export (transparently gunzipping `.gz`), batch-resolve MAL
 * ids to AniList ids, and map the result to library entries + logs. Throws if
 * the file cannot be read/parsed or the AniList resolution fails — the caller
 * owns the error UI.
 */
export async function importMalFile(
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<MalImportResult> {
  const text = await readFileText(file);
  const malEntries = parseMalXml(text);
  onProgress?.(0, malEntries.length);

  const matched = await fetchAnimeByMalIds(
    malEntries.map((e) => e.series_animedb_id),
    onProgress,
  );

  const malToAnilist: Record<number, number> = {};
  for (const media of matched) {
    if (media.idMal != null) malToAnilist[media.idMal] = media.id;
  }

  return mapMalEntries(malEntries, malToAnilist);
}
