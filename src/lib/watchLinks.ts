import type { ExternalLink } from '../api/anilist/schemas';

/**
 * The streaming services this app knows about, in preference order. Shared by
 * `pickWatchLink` below and by the schedule's platform filter chips, which is
 * why it is exported rather than inlined in either.
 */
export const STREAMING_SITES: readonly string[] = [
  'Crunchyroll',
  'Netflix',
  'Hulu',
  'Amazon Prime Video',
  'HIDIVE',
  'Disney Plus',
  'Bilibili TV',
  'CustomSource',
];

/**
 * The one watch-link picker. This replaces the divergent inline copies that
 * used to live in every card component — same site list, but matched in
 * preference order (the old `.includes(l.site)` variants took whichever of the
 * eight sites happened to come first in AniList's array).
 *
 * Matching is substring + case-insensitive so regional variants like
 * "Crunchyroll JP" still count, and any link at all beats no link.
 */
export function pickWatchLink(links: readonly ExternalLink[] | null | undefined): string | undefined {
  if (!links || links.length === 0) return undefined;
  for (const site of STREAMING_SITES) {
    const needle = site.toLowerCase();
    const match = links.find((link) => link.site.toLowerCase().includes(needle));
    if (match) return match.url;
  }
  return links[0].url;
}
