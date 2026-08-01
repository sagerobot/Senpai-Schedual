/**
 * The one canonical AniList media field selection (replaces the six divergent
 * inline copies the old client carried).
 *
 * `description` is deliberately absent from MEDIA_FIELDS: synopses were the
 * bulk of the localStorage quota problem and only ShowDetailModal consumes
 * them — it fetches the full record by id (MEDIA_FIELDS_FULL) on open.
 */
export const MEDIA_FIELDS = `
  id
  idMal
  averageScore
  title { romaji english userPreferred }
  bannerImage
  trailer { id site thumbnail }
  studios(isMain: true) { nodes { name } }
  coverImage { extraLarge large color }
  startDate { year month day }
  nextAiringEpisode { airingAt timeUntilAiring episode }
  status
  format
  episodes
  externalLinks { url site icon color }
  genres
  trending
  relations {
    edges {
      relationType
      node {
        id
        type
        averageScore
        title { userPreferred }
      }
    }
  }
`;

/** MEDIA_FIELDS plus the synopsis — used only by the by-id detail fetch. */
export const MEDIA_FIELDS_FULL = `${MEDIA_FIELDS}
  description(asHtml: false)
`;

/** Reduced selection for MAL-id resolution (and future series resolution). */
export const MEDIA_CORE = `
  id
  idMal
  title { english romaji userPreferred }
  format
  episodes
  startDate { year month day }
  relations {
    edges {
      relationType
      node {
        id
        type
      }
    }
  }
`;
