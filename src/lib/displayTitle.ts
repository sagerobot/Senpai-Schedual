/**
 * The one title-fallback chain. AniList titles are honestly nullable now;
 * every render site goes through this instead of ad-hoc `english || ...`
 * chains that crash or render blank when english is null.
 */
export function displayTitle(media: {
  title: { english: string | null; romaji?: string | null; userPreferred: string | null };
}): string {
  return media.title.english ?? media.title.userPreferred ?? media.title.romaji ?? 'Untitled';
}
