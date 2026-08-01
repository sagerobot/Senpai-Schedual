import { describe, expect, it } from 'vitest';
import { MalResolvedMediaSchema, MediaSchema } from './schemas';

/** A realistically-shaped AniList media object (list query, no description). */
const realShapedMedia = {
  id: 21,
  idMal: 21,
  averageScore: 88,
  title: {
    romaji: 'One Piece',
    english: 'ONE PIECE',
    userPreferred: 'ONE PIECE',
  },
  bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21.jpg',
  trailer: { id: 'abc123', site: 'youtube', thumbnail: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg' },
  studios: { nodes: [{ name: 'Toei Animation' }] },
  coverImage: {
    extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/21.jpg',
    large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/21.jpg',
    color: '#e4a15d',
  },
  startDate: { year: 1999, month: 10, day: 20 },
  nextAiringEpisode: { airingAt: 1767139200, timeUntilAiring: 420000, episode: 1140 },
  status: 'RELEASING',
  format: 'TV',
  episodes: null,
  externalLinks: [
    { url: 'https://www.crunchyroll.com/one-piece', site: 'Crunchyroll', icon: 'https://anilist.co/img/icons/cr.png', color: '#F88B24' },
  ],
  genres: ['Action', 'Adventure', 'Fantasy'],
  trending: 12,
  relations: {
    edges: [
      {
        relationType: 'ADAPTATION',
        node: { id: 30013, type: 'MANGA', averageScore: 92, title: { userPreferred: 'One Piece' } },
      },
    ],
  },
};

describe('MediaSchema', () => {
  it('parses a real-shaped AniList media object', () => {
    const parsed = MediaSchema.parse(realShapedMedia);
    expect(parsed.id).toBe(21);
    expect(parsed.title.english).toBe('ONE PIECE');
    expect(parsed.externalLinks).toHaveLength(1);
    expect(parsed.genres).toEqual(['Action', 'Adventure', 'Fantasy']);
    expect(parsed.relations?.edges[0].node.title.userPreferred).toBe('One Piece');
  });

  it('parses null title.english / episodes / startDate cleanly', () => {
    const parsed = MediaSchema.parse({
      ...realShapedMedia,
      title: { romaji: 'Sousou no Frieren', english: null, userPreferred: 'Sousou no Frieren' },
      episodes: null,
      startDate: null,
      nextAiringEpisode: null,
      bannerImage: null,
      trailer: null,
      coverImage: { extraLarge: null, large: 'https://example.com/cover.jpg', color: null },
      averageScore: null,
      idMal: null,
      status: null,
      format: null,
      trending: null,
    });

    expect(parsed.title.english).toBeNull();
    expect(parsed.episodes).toBeNull();
    expect(parsed.startDate).toBeNull();
    expect(parsed.nextAiringEpisode).toBeNull();
  });

  it('normalizes null externalLinks and genres to empty arrays', () => {
    const parsed = MediaSchema.parse({ ...realShapedMedia, externalLinks: null, genres: null });
    expect(parsed.externalLinks).toEqual([]);
    expect(parsed.genres).toEqual([]);
  });

  it('drops external links whose url is null', () => {
    const parsed = MediaSchema.parse({
      ...realShapedMedia,
      externalLinks: [
        { url: null, site: 'Official Site', icon: null, color: null },
        { url: 'https://example.com', site: 'Netflix', icon: null, color: null },
      ],
    });
    expect(parsed.externalLinks).toEqual([{ url: 'https://example.com', site: 'Netflix', icon: null, color: null }]);
  });

  it('accepts an optional description on the by-id detail shape', () => {
    const parsed = MediaSchema.parse({ ...realShapedMedia, description: 'A pirate story.' });
    expect(parsed.description).toBe('A pirate story.');
    expect(MediaSchema.parse(realShapedMedia).description).toBeUndefined();
  });

  it('ignores unexpected extra fields instead of throwing', () => {
    expect(() => MediaSchema.parse({ ...realShapedMedia, someNewApiField: { nested: true } })).not.toThrow();
  });
});

describe('MalResolvedMediaSchema', () => {
  it('parses the reduced MAL-resolution shape', () => {
    const parsed = MalResolvedMediaSchema.parse({
      id: 101,
      idMal: 202,
      title: { romaji: null, english: null, userPreferred: 'Some Show' },
      format: 'TV',
      episodes: 12,
      startDate: { year: 2020, month: null, day: null },
      relations: { edges: [{ relationType: 'SEQUEL', node: { id: 102, type: 'ANIME' } }] },
    });
    expect(parsed.idMal).toBe(202);
    expect(parsed.relations?.edges[0].node.id).toBe(102);
  });
});
