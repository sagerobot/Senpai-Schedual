/** Season slug helpers shared by the router, the loader, and SeasonView. */

export const SEASON_SLUGS = ['winter', 'spring', 'summer', 'fall'] as const;
export type SeasonSlug = (typeof SEASON_SLUGS)[number];

/** AniList's `MediaSeason` enum values, in calendar order. */
export const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;

/** Earliest year the archive pager will accept. AniList has nothing usable before this. */
const MIN_SEASON_YEAR = 1940;

/**
 * Latest year the archive will page to. Announcements rarely reach further
 * than a year out, so anything beyond this is guaranteed-empty pages.
 */
export function maxSeasonYear(date = new Date()): number {
  return date.getFullYear() + 1;
}

export function currentSeason(date = new Date()): { year: number; season: SeasonSlug } {
  const month = date.getMonth();
  const season: SeasonSlug =
    month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'fall' : 'winter';
  return { year: date.getFullYear(), season };
}

export function seasonPath(year: number, season: string): string {
  return `/season/${year}/${season.toLowerCase()}`;
}

export function currentSeasonPath(date = new Date()): string {
  const { year, season } = currentSeason(date);
  return seasonPath(year, season);
}

export function isSeasonSlug(value: string): value is SeasonSlug {
  return (SEASON_SLUGS as readonly string[]).includes(value);
}

/** `null` when the pair is not a season this app will render. */
export function parseSeasonParams(
  yearParam: string | undefined,
  seasonParam: string | undefined,
  date = new Date(),
): { year: number; season: SeasonSlug } | null {
  const year = Number(yearParam);
  const slug = (seasonParam ?? '').toLowerCase();
  if (!Number.isInteger(year) || year < MIN_SEASON_YEAR || year > maxSeasonYear(date)) return null;
  if (!isSeasonSlug(slug)) return null;
  return { year, season: slug };
}
