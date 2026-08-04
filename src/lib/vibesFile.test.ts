import { describe, expect, it } from 'vitest';
import {
  emptyVibesFile,
  isJustAired,
  isRedditUrl,
  isVibeServable,
  parseVibesFile,
  redditSearchUrl,
  vibeEntrySchema,
  vibeKey,
  vibePayload,
  vibesFileSchema,
  type VibeFoundEntry,
} from './vibesFile';

const NOW = Date.parse('2026-07-31T12:00:00.000Z');

function found(overrides: Record<string, unknown> = {}) {
  return {
    showId: 101,
    episode: 5,
    airedAt: Math.floor((NOW - 3 * 60 * 60 * 1000) / 1000),
    asOf: new Date(NOW).toISOString(),
    settled: false,
    status: 'found',
    summary: 'Viewers found the episode a strong return to form, with praise for the fight choreography.',
    goods: ['Fight choreography', 'Voice acting'],
    bads: ['Pacing in the middle act'],
    indicator: 'positive',
    upvotes: 4200,
    comments: 1800,
    url: 'https://www.reddit.com/r/anime/comments/abc123/episode_5_discussion/',
    ...overrides,
  };
}

function notFound(overrides: Record<string, unknown> = {}) {
  return {
    showId: 202,
    episode: 3,
    airedAt: Math.floor((NOW - 30 * 60 * 60 * 1000) / 1000),
    asOf: new Date(NOW).toISOString(),
    settled: true,
    status: 'not_found',
    ...overrides,
  };
}

describe('vibeKey', () => {
  it('builds the one key shape every lookup goes through', () => {
    expect(vibeKey(101, 5)).toBe('101:5');
  });
});

describe('isRedditUrl', () => {
  it.each([
    ['https://www.reddit.com/r/anime/comments/abc/x/', true],
    ['https://reddit.com/r/anime/search?q=x', true],
    ['https://old.reddit.com/r/anime/comments/abc/x/', false],
    ['https://reddit.com.evil.test/r/anime', false],
    ['https://example.test/reddit.com', false],
    ['not a url at all', false],
    ['', false],
  ])('%s -> %s', (url, expected) => {
    expect(isRedditUrl(url)).toBe(expected);
  });

  it('accepts the search URL it builds itself', () => {
    expect(isRedditUrl(redditSearchUrl('Frieren: Beyond Journey\'s End', 12))).toBe(true);
  });
});

describe('vibeEntrySchema', () => {
  it('round-trips a found entry unchanged', () => {
    const parsed = vibeEntrySchema.parse(found());
    expect(parsed).toEqual(found());
  });

  it('round-trips a not-found entry, which carries no sentiment fields', () => {
    const parsed = vibeEntrySchema.parse(notFound());
    expect(parsed).toEqual(notFound());
    expect(parsed).not.toHaveProperty('summary');
  });

  it('clamps the summary to 600 characters', () => {
    const parsed = vibeEntrySchema.parse(found({ summary: 'x'.repeat(900) }));
    expect(parsed.status === 'found' && parsed.summary.length).toBe(600);
  });

  it('keeps at most 5 bullets, each at most 120 characters', () => {
    const parsed = vibeEntrySchema.parse(
      found({ goods: Array.from({ length: 8 }, () => 'g'.repeat(200)), bads: [] }),
    );
    expect(parsed.status === 'found' && parsed.goods).toHaveLength(5);
    expect(parsed.status === 'found' && parsed.goods[0].length).toBe(120);
  });

  it('keeps per-dimension aspects, and treats their absence as "the comments did not say"', () => {
    const withAspects = vibeEntrySchema.parse(found({ aspects: { animation: 'positive', pacing: 'mixed' } }));
    expect(withAspects.status === 'found' && withAspects.aspects).toEqual({ animation: 'positive', pacing: 'mixed' });

    const without = vibeEntrySchema.parse(found());
    expect(without.status === 'found' && without.aspects).toBeUndefined();
  });

  it('drops malformed aspects rather than costing the entry', () => {
    const junk = vibeEntrySchema.parse(found({ aspects: { animation: 'AMAZING', pacing: 42 } }));
    expect(junk.status === 'found' && junk.aspects).toBeUndefined();
  });

  it('falls back to mixed for an unknown indicator, and to 0 for junk counts', () => {
    const parsed = vibeEntrySchema.parse(found({ indicator: 'ecstatic', upvotes: -12, comments: 'lots' }));
    expect(parsed.status === 'found' && parsed.indicator).toBe('mixed');
    expect(parsed.status === 'found' && parsed.upvotes).toBe(0);
    expect(parsed.status === 'found' && parsed.comments).toBe(0);
  });

  it('coerces a numeric string count', () => {
    const parsed = vibeEntrySchema.parse(found({ comments: '742' }));
    expect(parsed.status === 'found' && parsed.comments).toBe(742);
  });

  it('rejects a url that is not on reddit.com', () => {
    expect(vibeEntrySchema.safeParse(found({ url: 'https://example.test/thread' })).success).toBe(false);
  });

  it('rejects an unparseable asOf', () => {
    expect(vibeEntrySchema.safeParse(found({ asOf: 'yesterday' })).success).toBe(false);
  });
});

describe('vibesFileSchema', () => {
  it('parses a file and keys it by showId:episode', () => {
    const file = vibesFileSchema.parse({
      version: 1,
      entries: { '101:5': found(), '202:3': notFound() },
    });
    expect(Object.keys(file.entries).sort()).toEqual(['101:5', '202:3']);
  });

  it('drops one malformed entry rather than failing the whole file', () => {
    const file = vibesFileSchema.parse({
      version: 1,
      entries: { '101:5': found(), '999:1': { status: 'found', showId: 999 } },
    });
    expect(Object.keys(file.entries)).toEqual(['101:5']);
  });

  it('drops an entry whose key disagrees with its own showId:episode', () => {
    const file = vibesFileSchema.parse({ version: 1, entries: { '7:7': found() } });
    expect(file.entries).toEqual({});
  });

  it('treats a missing entries map as empty', () => {
    expect(vibesFileSchema.parse({ version: 1 }).entries).toEqual({});
  });

  it('parseVibesFile returns null for something that is not a vibes file', () => {
    expect(parseVibesFile({ nope: true })).toBeNull();
    expect(parseVibesFile(emptyVibesFile())).toEqual({ version: 1, entries: {} });
  });
});

describe('isVibeServable', () => {
  it('always serves a settled entry — it is final', () => {
    expect(isVibeServable(vibeEntrySchema.parse(found({ settled: true })), NOW + 30 * 24 * 3600_000)).toBe(true);
  });

  it('serves an unsettled entry inside the refresh window', () => {
    expect(isVibeServable(vibeEntrySchema.parse(found()), NOW + 60 * 60 * 1000)).toBe(true);
  });

  it('refuses an unsettled entry the hourly routine should have replaced', () => {
    expect(isVibeServable(vibeEntrySchema.parse(found()), NOW + 3 * 60 * 60 * 1000)).toBe(false);
  });
});

describe('vibePayload', () => {
  it('carries the seven response fields and no bookkeeping', () => {
    const entry = vibeEntrySchema.parse(found()) as VibeFoundEntry;
    expect(Object.keys(vibePayload(entry)).sort()).toEqual([
      'bads',
      'comments',
      'goods',
      'indicator',
      'summary',
      'upvotes',
      'url',
    ]);
  });
});

describe('quiet entries', () => {
  const quiet = (overrides: Record<string, unknown> = {}) => ({
    showId: 303,
    episode: 2,
    airedAt: Math.floor((NOW - 30 * 60 * 60 * 1000) / 1000),
    asOf: new Date(NOW).toISOString(),
    settled: true,
    status: 'quiet',
    upvotes: 3,
    comments: 2,
    url: 'https://www.reddit.com/r/anime/comments/q1/x/',
    ...overrides,
  });

  it('round-trips a quiet entry — thread verified, no sentiment fields', () => {
    const parsed = vibeEntrySchema.parse(quiet());
    expect(parsed.status).toBe('quiet');
    expect(parsed.status === 'quiet' && parsed.comments).toBe(2);
    expect(parsed).not.toHaveProperty('summary');
  });

  it('rejects a quiet entry with an off-reddit url', () => {
    expect(vibeEntrySchema.safeParse(quiet({ url: 'https://example.com/x' })).success).toBe(false);
  });

  it('isJustAired flips at the two-hour window and never fires on an unknown air time', () => {
    const justAired = vibeEntrySchema.parse(
      quiet({ airedAt: Math.floor((NOW - 1 * 60 * 60 * 1000) / 1000), settled: false }),
    );
    const stale = vibeEntrySchema.parse(quiet());
    const unknown = vibeEntrySchema.parse(quiet({ airedAt: 0 }));
    expect(isJustAired(justAired, NOW)).toBe(true);
    expect(isJustAired(stale, NOW)).toBe(false);
    expect(isJustAired(unknown, NOW)).toBe(false);
  });
});
