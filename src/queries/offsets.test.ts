import { describe, expect, it } from 'vitest';
import type { AnimeMedia } from '../api/anilist/schemas';
import { customSourceUrl, isInjectableTemplate, transformMedia, transformMediaList } from './offsets';
import type { CustomWatchSource } from './offsets';

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

const source: CustomWatchSource = { name: 'My Server', urlTemplate: 'https://example.test/search?q={title}' };

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
    transformMedia(original, { 21: 30 }, source);
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

describe('custom watch-source injection', () => {
  it('is absent by default: no source means the cached object comes back as-is', () => {
    const original = media();
    expect(transformMedia(original, {})).toBe(original);
  });

  it('adds exactly one link, and does not add a second on a re-transform', () => {
    const once = transformMedia(media(), {}, source);
    expect(once.externalLinks.filter((l) => l.site === 'My Server')).toHaveLength(1);

    const twice = transformMedia(once, { 21: 30 }, source);
    expect(twice.externalLinks.filter((l) => l.site === 'My Server')).toHaveLength(1);
  });

  it('keeps the links AniList supplied, appending after them', () => {
    const withCrunchyroll = media({
      externalLinks: [{ url: 'https://crunchyroll.test/one-piece', site: 'Crunchyroll', icon: null, color: null }],
    });
    const result = transformMedia(withCrunchyroll, {}, source);

    expect(result.externalLinks).toHaveLength(2);
    expect(result.externalLinks[0].site).toBe('Crunchyroll');
    expect(result.externalLinks[1].url).toBe('https://example.test/search?q=One%20Piece');
  });

  it('substitutes every {title} occurrence, encoded, preferring romaji then english then userPreferred', () => {
    expect(customSourceUrl(media(), 'https://x.test/{title}?q={title}')).toBe(
      'https://x.test/One%20Piece?q=One%20Piece',
    );
    expect(
      customSourceUrl(
        media({ title: { romaji: null, english: 'Attack on Titan', userPreferred: 'Shingeki' } }),
        'https://x.test/?q={title}',
      ),
    ).toBe('https://x.test/?q=Attack%20on%20Titan');
    expect(
      customSourceUrl(media({ title: { romaji: null, english: null, userPreferred: 'Bleach' } }), 'https://x.test/?q={title}'),
    ).toBe('https://x.test/?q=Bleach');
  });

  it('refuses templates that are not absolute http(s) URLs, and blank names', () => {
    expect(isInjectableTemplate('https://example.test/{title}')).toBe(true);
    expect(isInjectableTemplate('HTTP://example.test/{title}')).toBe(true);
    expect(isInjectableTemplate('javascript:alert(1)')).toBe(false);
    expect(isInjectableTemplate('example.test/{title}')).toBe(false);
    expect(isInjectableTemplate('')).toBe(false);

    const original = media();
    expect(transformMedia(original, {}, { name: 'X', urlTemplate: 'javascript:alert(1)' })).toBe(original);
    expect(transformMedia(original, {}, { name: '   ', urlTemplate: 'https://example.test/' })).toBe(original);
  });
});
