import { z } from 'zod';
import { anilistRequest } from './client';
import { MEDIA_CORE, MEDIA_FIELDS, MEDIA_FIELDS_FULL } from './fragments';
import { MalResolvedMediaSchema, MediaSchema } from './schemas';
import type { AnimeMedia, MalResolvedMedia } from './schemas';

/**
 * Fetchers return AniList's data as-is. The simulcast offset and the injected
 * CustomSource link are applied at read time by src/queries/offsets.ts, so what the
 * cache holds stays user-independent.
 */

/** Hard cap for paginated walks (~600 shows) so no query can spiral. */
const MAX_PAGES = 12;
const ID_BATCH_SIZE = 50;

const MediaPageSchema = z.object({
  Page: z.object({
    pageInfo: z.object({ hasNextPage: z.boolean() }).nullish(),
    media: z
      .array(MediaSchema)
      .nullable()
      .transform((v) => v ?? []),
  }),
});

const MalPageSchema = z.object({
  Page: z.object({
    media: z
      .array(MalResolvedMediaSchema)
      .nullable()
      .transform((v) => v ?? []),
  }),
});

async function fetchPaginatedMedia(
  query: string,
  variables: Record<string, unknown>,
  onPage?: (pageMedia: AnimeMedia[]) => void,
): Promise<AnimeMedia[]> {
  const results: AnimeMedia[] = [];
  let page = 1;
  for (;;) {
    const data = await anilistRequest(query, { ...variables, page }, MediaPageSchema);
    results.push(...data.Page.media);
    onPage?.(data.Page.media);
    if (!data.Page.pageInfo?.hasNextPage) break;
    if (page >= MAX_PAGES) {
      console.warn(`[anilist] pagination capped at ${MAX_PAGES} pages; results truncated.`);
      break;
    }
    page++;
  }
  return results;
}

export async function fetchAnimeByIds(ids: number[]): Promise<AnimeMedia[]> {
  const query = `
    query ($ids: [Int]) {
      Page(page: 1, perPage: 50) {
        media(id_in: $ids, type: ANIME) { ${MEDIA_FIELDS} }
      }
    }
  `;

  const results: AnimeMedia[] = [];
  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    const batch = ids.slice(i, i + ID_BATCH_SIZE);
    const data = await anilistRequest(query, { ids: batch }, MediaPageSchema);
    results.push(...data.Page.media);
  }
  return results;
}

/** Single Media by id, including `description` — used by the detail modal. */
export async function fetchMediaById(id: number): Promise<AnimeMedia> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) { ${MEDIA_FIELDS_FULL} }
    }
  `;
  const data = await anilistRequest(query, { id }, z.object({ Media: MediaSchema }));
  return data.Media;
}

/**
 * Resolve MAL ids to reduced AniList records. Returns MalResolvedMedia — not
 * AnimeMedia — so it is deliberately outside the read-time media transform.
 */
export async function fetchAnimeByMalIds(
  malIds: number[],
  onProgress?: (current: number, total: number) => void,
): Promise<MalResolvedMedia[]> {
  const query = `
    query ($idMal_in: [Int]) {
      Page(page: 1, perPage: 50) {
        media(idMal_in: $idMal_in, type: ANIME) { ${MEDIA_CORE} }
      }
    }
  `;

  const results: MalResolvedMedia[] = [];
  for (let i = 0; i < malIds.length; i += ID_BATCH_SIZE) {
    const batch = malIds.slice(i, i + ID_BATCH_SIZE);
    const data = await anilistRequest(query, { idMal_in: batch }, MalPageSchema);
    results.push(...data.Page.media);
    onProgress?.(Math.min(i + ID_BATCH_SIZE, malIds.length), malIds.length);
  }
  return results;
}

/**
 * The whole current-season + releasing walk (up to ~2 x MAX_PAGES requests).
 *
 * `onPage` fires after every page with the cumulative, deduplicated list so
 * far — the first call lands after a single round-trip, which is what lets the
 * schedule paint before the remaining pages stream in. The returned promise
 * still resolves with the complete list; only that goes into the query cache.
 */
export async function fetchCurrentSeasonAnime(onPage?: (partial: AnimeMedia[]) => void): Promise<AnimeMedia[]> {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth();

  let season = 'WINTER';
  if (month >= 3 && month <= 5) season = 'SPRING';
  else if (month >= 6 && month <= 8) season = 'SUMMER';
  else if (month >= 9 && month <= 11) season = 'FALL';

  const querySeason = `
    query ($season: MediaSeason, $seasonYear: Int, $page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo { hasNextPage }
        media(season: $season, seasonYear: $seasonYear, type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }
  `;

  const queryReleasing = `
    query ($page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo { hasNextPage }
        media(status: RELEASING, type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }
  `;

  const allMediaMap = new Map<number, AnimeMedia>();
  const absorb = (pageMedia: AnimeMedia[]) => {
    for (const anime of pageMedia) allMediaMap.set(anime.id, anime);
    onPage?.(Array.from(allMediaMap.values()));
  };

  await fetchPaginatedMedia(querySeason, { season, seasonYear: year }, absorb);
  await fetchPaginatedMedia(queryReleasing, {}, absorb);

  return Array.from(allMediaMap.values());
}

export async function searchAnime(search: string): Promise<AnimeMedia[]> {
  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 50) {
        media(search: $search, type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }
  `;
  const data = await anilistRequest(query, { search }, MediaPageSchema);
  return data.Page.media;
}

export async function fetchAnimeBySeason(season: string, seasonYear: number): Promise<AnimeMedia[]> {
  const query = `
    query ($season: MediaSeason, $seasonYear: Int, $page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo { hasNextPage }
        media(season: $season, seasonYear: $seasonYear, type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }
  `;
  return fetchPaginatedMedia(query, { season, seasonYear });
}
