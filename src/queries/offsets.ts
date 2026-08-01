import { useMemo } from 'react';
import type { AnimeMedia, ExternalLink } from '../api/anilist/schemas';
import { useUserData, type CustomWatchSource } from '../stores/userData';

/**
 * The read-time media transform.
 *
 * AniList responses are cached raw. Everything user-specific — the simulcast
 * offset and the user's custom watch-source link — is applied on the way *out*
 * of the cache through each query hook's `select`. Changing either therefore
 * re-renders every affected card from the existing cache: no refetch, no
 * invalidation, no "please refresh the page".
 */

export type { CustomWatchSource };

/** Every `{title}` in the template, replaced with the show's title, encoded. */
export function customSourceUrl(media: AnimeMedia, urlTemplate: string): string {
  const title = firstNonEmpty(media.title.romaji, media.title.english, media.title.userPreferred);
  return urlTemplate.split('{title}').join(encodeURIComponent(title));
}

function firstNonEmpty(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    if (value !== null && value !== undefined && value.trim() !== '') return value;
  }
  return '';
}

/**
 * May this template be injected at all? Absolute http(s) only, so a malformed
 * or hostile template renders as nothing rather than as a broken or
 * `javascript:` link. Shared with the Data & Settings form's validation.
 */
export function isInjectableTemplate(urlTemplate: string): boolean {
  return /^https?:\/\//i.test(urlTemplate.trim());
}

/** Returns the original array when there is nothing to add, so identity survives. */
function withCustomLink(media: AnimeMedia, source: CustomWatchSource | undefined): ExternalLink[] {
  if (source === undefined) return media.externalLinks;
  const site = source.name.trim();
  if (site === '' || !isInjectableTemplate(source.urlTemplate)) return media.externalLinks;
  if (media.externalLinks.some((link) => link.site === site)) return media.externalLinks;
  return [
    ...media.externalLinks,
    { site, url: customSourceUrl(media, source.urlTemplate), icon: null, color: '#e85d04' },
  ];
}

/** Apply the user's offset and custom watch-source link to one media record. */
export function transformMedia(
  media: AnimeMedia,
  offsets: Record<number, number>,
  customSource?: CustomWatchSource,
): AnimeMedia {
  const externalLinks = withCustomLink(media, customSource);
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

export function transformMediaList(
  list: AnimeMedia[],
  offsets: Record<number, number>,
  customSource?: CustomWatchSource,
): AnimeMedia[] {
  return list.map((media) => transformMedia(media, offsets, customSource));
}

export interface MediaTransform {
  transformOne: (media: AnimeMedia) => AnimeMedia;
  transformMaybe: (media: AnimeMedia | null) => AnimeMedia | null;
  transformList: (list: AnimeMedia[]) => AnimeMedia[];
}

/**
 * Subscribes to the offsets slice and the custom source, and returns
 * transforms whose identity only changes when those do. Query hooks pass these
 * straight to `select`, which is what makes an edit repaint instantly.
 */
export function useMediaTransform(): MediaTransform {
  const offsets = useUserData((state) => state.offsets);
  const customSource = useUserData((state) => state.uiPrefs.customSource);

  return useMemo(
    () => ({
      transformOne: (media: AnimeMedia) => transformMedia(media, offsets, customSource),
      transformMaybe: (media: AnimeMedia | null) =>
        media === null ? null : transformMedia(media, offsets, customSource),
      transformList: (list: AnimeMedia[]) => transformMediaList(list, offsets, customSource),
    }),
    [offsets, customSource],
  );
}
