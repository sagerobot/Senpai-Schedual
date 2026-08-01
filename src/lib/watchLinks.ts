import type { ExternalLink } from '../api/anilist/schemas';

/**
 * The one watch-link picker. This replaces the divergent inline copies that
 * used to live in every card component — same site list, but matched in
 * preference order (the old `.includes(l.site)` variants took whichever of the
 * eight sites happened to come first in AniList's array).
 *
 * Matching is substring + case-insensitive so regional variants like
 * "Crunchyroll JP" still count, and any link at all beats no link.
 */
const PREFERRED_SITES = [
  'Crunchyroll',
  'Netflix',
  'Hulu',
  'Amazon Prime Video',
  'HIDIVE',
  'Disney Plus',
  'Bilibili TV',
  'CustomSource',
] as const;

export function pickWatchLink(links: readonly ExternalLink[] | null | undefined): string | undefined {
  if (!links || links.length === 0) return undefined;
  for (const site of PREFERRED_SITES) {
    const needle = site.toLowerCase();
    const match = links.find((link) => link.site.toLowerCase().includes(needle));
    if (match) return match.url;
  }
  return links[0].url;
}
