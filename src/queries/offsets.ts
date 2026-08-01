import { useMemo } from 'react';
import type { AnimeMedia, ExternalLink } from '../api/anilist/schemas';
import { useUserData } from '../stores/userData';

/**
 * The read-time media transform.
 *
 * AniList responses are cached raw. Everything user-specific — the simulcast
 * offset and the injected CustomSource link — is applied on the way *out* of the
 * cache through each query hook's `select`. Changing an offset therefore
 * re-renders every affected countdown from the existing cache: no refetch, no
 * invalidation, no "please refresh the page".
 */

/** Single switch for the CustomSource link injection (owner wants it kept). */
export const INJECT_CUSTOM_LINK = true;

const CUSTOM_SITE = 'CustomSource';

/**
 * CustomSource's own detail pages are `/anime/info/<opaque id>` (e.g.
 * `/anime/info/2ApkGpUofb`) — a site-internal token with no relationship to
 * the AniList id, the MAL id, or the title, so a direct link cannot be built
 * from what we hold. The keyword browse URL is the deepest link available;
 * `/search` 404s, `keyword` is the parameter the site itself canonicalizes to.
 */
export function customSourceUrl(media: AnimeMedia): string {
  const title = firstNonEmpty(media.title.romaji, media.title.english, media.title.userPreferred);
  return `https://example.invalid/browse?keyword=${encodeURIComponent(title)}`;
}

function firstNonEmpty(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    if (value !== null && value !== undefined && value.trim() !== '') return value;
  }
  return '';
}

/** Returns the original array when there is nothing to add, so identity survives. */
function withCustomLink(media: AnimeMedia): ExternalLink[] {
  if (!INJECT_CUSTOM_LINK) return media.externalLinks;
  if (media.externalLinks.some((link) => link.site === CUSTOM_SITE)) return media.externalLinks;
  return [
    ...media.externalLinks,
    { site: CUSTOM_SITE, url: customSourceUrl(media), icon: null, color: '#e85d04' },
  ];
}

/** Apply the user's offset and the CustomSource link to one media record. */
export function transformMedia(media: AnimeMedia, offsets: Record<number, number>): AnimeMedia {
  const externalLinks = withCustomLink(media);
  const offsetMinutes = offsets[media.id];
  const next = media.nextAiringEpisode;

  if (next && offsetMinutes) {
    const offsetSeconds = offsetMinutes * 60;
    return {
      ...media,
      externalLinks,
      nextAiringEpisode: {
        ...next,
        airingAt: next.airingAt + offsetSeconds,
        timeUntilAiring: next.timeUntilAiring + offsetSeconds,
      },
    };
  }

  // Nothing to change — hand back the cached object itself.
  return externalLinks === media.externalLinks ? media : { ...media, externalLinks };
}

export function transformMediaList(list: AnimeMedia[], offsets: Record<number, number>): AnimeMedia[] {
  return list.map((media) => transformMedia(media, offsets));
}

export interface MediaTransform {
  transformOne: (media: AnimeMedia) => AnimeMedia;
  transformMaybe: (media: AnimeMedia | null) => AnimeMedia | null;
  transformList: (list: AnimeMedia[]) => AnimeMedia[];
}

/**
 * Subscribes to the offsets slice and returns transforms whose identity only
 * changes when the offsets do. Query hooks pass these straight to `select`,
 * which is what makes an offset edit repaint instantly.
 */
export function useMediaTransform(): MediaTransform {
  const offsets = useUserData((state) => state.offsets);

  return useMemo(
    () => ({
      transformOne: (media: AnimeMedia) => transformMedia(media, offsets),
      transformMaybe: (media: AnimeMedia | null) => (media === null ? null : transformMedia(media, offsets)),
      transformList: (list: AnimeMedia[]) => transformMediaList(list, offsets),
    }),
    [offsets],
  );
}
