import type { ExternalLink } from '../api/anilist/schemas';

/**
 * The streaming services this app knows about, in preference order. Shared by
 * `pickWatchLink` below and by the schedule's platform filter chips, which is
 * why it is exported rather than inlined in either.
 *
 * The user's custom watch source (see src/queries/offsets.ts) is deliberately
 * not in this list — it has whatever name the user gave it, so callers pass it
 * as `customSite` instead.
 */
export const STREAMING_SITES: readonly string[] = [
  'Crunchyroll',
  'Netflix',
  'Hulu',
  'Amazon Prime Video',
  'HIDIVE',
  'Disney Plus',
  'Bilibili TV',
];

function siteList(customSite: string | undefined): readonly string[] {
  const custom = customSite?.trim();
  return custom === undefined || custom === '' ? STREAMING_SITES : [...STREAMING_SITES, custom];
}

function matches(link: ExternalLink, site: string): boolean {
  return link.site.toLowerCase().includes(site.toLowerCase());
}

/**
 * The one watch-link picker. This replaces the divergent inline copies that
 * used to live in every card component — same site list, but matched in
 * preference order (the old `.includes(l.site)` variants took whichever of the
 * sites happened to come first in AniList's array).
 *
 * Matching is substring + case-insensitive so regional variants like
 * "Crunchyroll JP" still count, and any link at all beats no link.
 */
export function pickWatchLinkEntry(
  links: readonly ExternalLink[] | null | undefined,
  customSite?: string,
): ExternalLink | undefined {
  if (!links || links.length === 0) return undefined;
  for (const site of siteList(customSite)) {
    const match = links.find((link) => matches(link, site));
    if (match) return match;
  }
  return links[0];
}

export function pickWatchLink(
  links: readonly ExternalLink[] | null | undefined,
  customSite?: string,
): string | undefined {
  return pickWatchLinkEntry(links, customSite)?.url;
}

/**
 * Every link that is a watch source, in the order AniList supplied them. For
 * components that show several links rather than picking one; no fallback —
 * a show with no watch sources gets an empty array.
 */
export function filterWatchLinks(
  links: readonly ExternalLink[] | null | undefined,
  customSite?: string,
): ExternalLink[] {
  if (!links || links.length === 0) return [];
  const sites = siteList(customSite);
  return links.filter((link) => sites.some((site) => matches(link, site)));
}
