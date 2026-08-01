import { describe, expect, it } from 'vitest';
import type { AnimeMedia, ExternalLink } from '../api/anilist/schemas';
import { INJECT_CUSTOM_LINK, customSourceUrl, transformMedia, transformMediaList } from './offsets';

function media(overrides: Partial<AnimeMedia> = {}): AnimeMedia {
  return {
    id: 21,
    idMal: 21,
    averageScore: 88,
    title: { romaji: 'One Piece', english: 'One Piece', userPreferred: 'One Piece' },
    bannerImage: null,
    coverImage: { large: 'https://example.test/cover.jpg', color: null },
    startDate: { year: 1999, month: 10, day: 20 },
    nextAiringEpisode: { airingAt: 1_700_000_000, timeUntilAiring: 3_600, episode: 1100 },
    status: 'RELEASING',
    format: 'TV',
    episodes: null,
    externalLinks: [],
    genres: ['Action'],
    ...overrides,
  } as AnimeMedia;
}

const customLinks = (links: ExternalLink[]) => links.filter((l) => l.site === 'CustomSource');

describe('simulcast offset transform', () => {
  it('shifts airingAt and timeUntilAiring by minutes * 60', () => {
    const result = transformMedia(media(), { 21: 30 });

    expect(result.nextAiringEpisode?.airingAt).toBe(1_700_000_000 + 1_800);
    expect(result.nextAiringEpisode?.timeUntilAiring).toBe(3_600 + 1_800);
    // The episode number is not a time and must survive untouched.
    expect(result.nextAiringEpisode?.episode).toBe(1100);
  });

  it('accepts a negative offset for a simulcast that lands early', () => {
    const result = transformMedia(media(), { 21: -15 });
    expect(result.nextAiringEpisode?.airingAt).toBe(1_700_000_000 - 900);
  });

  it('leaves shows without an offset, and shows without an airing episode, alone', () => {
    expect(transformMedia(media(), {}).nextAiringEpisode?.airingAt).toBe(1_700_000_000);
    expect(transformMedia(media(), { 99: 30 }).nextAiringEpisode?.airingAt).toBe(1_700_000_000);
    expect(transformMedia(media({ nextAiringEpisode: null }), { 21: 30 }).nextAiringEpisode).toBeNull();
  });

  it('does not mutate the cached record', () => {
    const original = media();
    transformMedia(original, { 21: 30 });
    expect(original.nextAiringEpisode?.airingAt).toBe(1_700_000_000);
    expect(original.externalLinks).toEqual([]);
  });

  it('applies per show across a list', () => {
    const list = [media({ id: 21 }), media({ id: 22 })];
    const [first, second] = transformMediaList(list, { 22: 60 });

    expect(first.nextAiringEpisode?.airingAt).toBe(1_700_000_000);
    expect(second.nextAiringEpisode?.airingAt).toBe(1_700_000_000 + 3_600);
  });
});

describe('CustomSource link injection', () => {
  it('adds exactly one link, and does not add a second on a re-transform', () => {
    const once = transformMedia(media(), {});
    expect(customLinks(once.externalLinks)).toHaveLength(1);

    const twice = transformMedia(once, { 21: 30 });
    expect(customLinks(twice.externalLinks)).toHaveLength(1);
  });

  it('keeps the links AniList supplied', () => {
    const withCrunchyroll = media({
      externalLinks: [{ url: 'https://crunchyroll.test/one-piece', site: 'Crunchyroll', icon: null, color: null }],
    });
    const result = transformMedia(withCrunchyroll, {});

    expect(result.externalLinks).toHaveLength(2);
    expect(result.externalLinks[0].site).toBe('Crunchyroll');
  });

  it('searches by romaji, falling through to english then userPreferred', () => {
    expect(customSourceUrl(media())).toBe('https://example.invalid/browse?keyword=One%20Piece');
    expect(
      customSourceUrl(media({ title: { romaji: null, english: 'Attack on Titan', userPreferred: 'Shingeki' } })),
    ).toBe('https://example.invalid/browse?keyword=Attack%20on%20Titan');
    expect(customSourceUrl(media({ title: { romaji: null, english: null, userPreferred: 'Bleach' } }))).toBe(
      'https://example.invalid/browse?keyword=Bleach',
    );
  });

  it('is gated behind the injection flag', () => {
    // The flag is a build-time constant; this asserts the wiring rather than
    // toggling it, so flipping it to false localises the change to one line.
    const links = transformMedia(media(), {}).externalLinks;
    expect(customLinks(links)).toHaveLength(INJECT_CUSTOM_LINK ? 1 : 0);
  });
});
