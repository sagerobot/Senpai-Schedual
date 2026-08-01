import { describe, expect, it } from 'vitest';
import {
  BUNDLE_MAX_AGE_MS,
  isBundleFresh,
  parseSeasonBundle,
  seasonBundleEnvelopeSchema,
  SEASON_BUNDLE_VERSION,
} from './seasonBundle';

const NOW = Date.parse('2026-07-31T12:00:00.000Z');

function media(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    idMal: null,
    averageScore: 80,
    title: { romaji: `Show ${id}`, english: null, userPreferred: `Show ${id}` },
    bannerImage: null,
    coverImage: { large: 'https://example.test/cover.jpg', color: null },
    startDate: { year: 2026, month: 7, day: 1 },
    nextAiringEpisode: null,
    status: 'RELEASING',
    format: 'TV',
    episodes: 12,
    externalLinks: [],
    genres: ['Action'],
    ...overrides,
  };
}

function bundle(overrides: Record<string, unknown> = {}) {
  return {
    version: SEASON_BUNDLE_VERSION,
    generatedAt: '2026-07-31T06:00:00.000Z',
    shows: [media(1), media(2)],
    seriesGraphs: {
      '1': {
        seriesId: 1,
        title: 'Show 1',
        entries: [
          {
            id: 1,
            format: 'TV',
            startDate: { year: 2026, month: 7, day: 1 },
            seasonLabel: 'Season 1',
            title: 'Show 1',
            isAttachment: false,
            episodes: 12,
          },
        ],
      },
    },
    memberIndex: { '1': 1 },
    summaries: { '1': 'A quiet show about nothing in particular.' },
    ...overrides,
  };
}

describe('isBundleFresh', () => {
  it('accepts a bundle built minutes ago', () => {
    expect(isBundleFresh('2026-07-31T11:30:00.000Z', NOW)).toBe(true);
  });

  it('accepts a bundle just inside 24 hours', () => {
    expect(isBundleFresh(new Date(NOW - BUNDLE_MAX_AGE_MS + 1000).toISOString(), NOW)).toBe(true);
  });

  it('rejects a bundle just past 24 hours', () => {
    expect(isBundleFresh(new Date(NOW - BUNDLE_MAX_AGE_MS - 1000).toISOString(), NOW)).toBe(false);
  });

  it('rejects an unparseable timestamp', () => {
    expect(isBundleFresh('last tuesday', NOW)).toBe(false);
    expect(isBundleFresh('', NOW)).toBe(false);
  });

  it('treats a future timestamp as fresh — that is clock skew, not staleness', () => {
    expect(isBundleFresh(new Date(NOW + 60 * 60 * 1000).toISOString(), NOW)).toBe(true);
  });

  it('honours a caller-supplied max age', () => {
    const oneHourAgo = new Date(NOW - 60 * 60 * 1000).toISOString();
    expect(isBundleFresh(oneHourAgo, NOW, 30 * 60 * 1000)).toBe(false);
    expect(isBundleFresh(oneHourAgo, NOW, 2 * 60 * 60 * 1000)).toBe(true);
  });
});

describe('seasonBundleSchema', () => {
  it('parses a well-formed bundle', () => {
    const parsed = parseSeasonBundle(bundle());
    expect(parsed).not.toBeNull();
    expect(parsed!.shows.map((s) => s.id)).toEqual([1, 2]);
    expect(parsed!.seriesGraphs['1'].entries[0].seasonLabel).toBe('Season 1');
    expect(parsed!.memberIndex['1']).toBe(1);
    expect(parsed!.summaries['1']).toContain('quiet show');
  });

  it('drops a malformed show instead of rejecting the whole bundle', () => {
    const parsed = parseSeasonBundle(bundle({ shows: [media(1), { id: 'not-a-number' }, media(3)] }));
    expect(parsed!.shows.map((s) => s.id)).toEqual([1, 3]);
  });

  it('defaults the optional maps when a bundle omits them', () => {
    const parsed = parseSeasonBundle({
      version: 1,
      generatedAt: '2026-07-31T06:00:00.000Z',
      shows: [],
    });
    expect(parsed).toEqual({
      version: 1,
      generatedAt: '2026-07-31T06:00:00.000Z',
      shows: [],
      seriesGraphs: {},
      memberIndex: {},
      summaries: {},
    });
  });

  it('rejects a payload that is not a bundle at all', () => {
    expect(parseSeasonBundle(null)).toBeNull();
    expect(parseSeasonBundle('<html>404</html>')).toBeNull();
    expect(parseSeasonBundle({ version: 1, generatedAt: 'never', shows: [] })).toBeNull();
    expect(parseSeasonBundle({ version: 1, generatedAt: '2026-07-31T06:00:00.000Z' })).toBeNull();
  });
});

describe('seasonBundleEnvelopeSchema', () => {
  it('accepts a bundle without inspecting the shows', () => {
    const result = seasonBundleEnvelopeSchema.safeParse({
      version: 1,
      generatedAt: '2026-07-31T06:00:00.000Z',
      shows: [{ nonsense: true }, 42],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing or unparseable generatedAt', () => {
    expect(seasonBundleEnvelopeSchema.safeParse({ version: 1, shows: [] }).success).toBe(false);
    expect(
      seasonBundleEnvelopeSchema.safeParse({ version: 1, generatedAt: 'soon', shows: [] }).success,
    ).toBe(false);
  });

  it('rejects a body whose shows are not an array — an error page, say', () => {
    expect(
      seasonBundleEnvelopeSchema.safeParse({ version: 1, generatedAt: '2026-07-31T06:00:00.000Z', shows: null })
        .success,
    ).toBe(false);
    expect(seasonBundleEnvelopeSchema.safeParse('404: Not Found').success).toBe(false);
  });
});
