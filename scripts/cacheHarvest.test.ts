import { describe, expect, it } from 'vitest';
import { mergeVibeEntries } from './vibeWork';
import { harvestCacheExport, type ExportedEntry, type SeasonFacts } from './cacheHarvest';

const NOW = Date.parse('2026-07-31T12:00:00.000Z');

/** A season holding shows 1 and 2, only the first of which is summarized. */
function season(overrides: Partial<SeasonFacts> = {}): SeasonFacts {
  return {
    showIds: new Set([1, 2]),
    summarized: new Set([1]),
    titles: new Map([
      [1, 'Already Summarized'],
      [2, 'Needs A Summary'],
    ]),
    ...overrides,
  };
}

const cachedVibe = (overrides: Record<string, unknown> = {}) => ({
  summary: 'The thread was warm about the episode, mostly about how the fight was staged.',
  goods: ['Fight choreography'],
  bads: ['Pacing'],
  indicator: 'positive',
  upvotes: 1200,
  comments: 430,
  url: 'https://www.reddit.com/r/anime/comments/abc/x/',
  ...overrides,
});

const row = (key: string, value: unknown, storedAt = '2026-07-30T09:00:00.000Z'): ExportedEntry => ({
  key,
  value,
  storedAt,
});

describe('harvestCacheExport summaries', () => {
  it('keeps a summary for a season show that has none', () => {
    const result = harvestCacheExport([row('summary:2', 'A quiet show about a loud town.')], season());
    expect(result.summaries).toEqual({ '2': 'A quiet show about a loud town.' });
    expect(result.stats).toMatchObject({ summaryKeys: 1, summariesKept: 1 });
  });

  it('leaves a summary the bundle already holds alone', () => {
    const result = harvestCacheExport([row('summary:1', 'Something else entirely.')], season());
    expect(result.summaries).toEqual({});
    expect(result.stats.summariesAlreadyHeld).toBe(1);
  });

  it('drops a summary for a show that is not in the season', () => {
    // The build prunes summaries for departed shows; harvesting one back in
    // would re-add exactly the row it just decided to drop.
    const result = harvestCacheExport([row('summary:999', 'An off-season show.')], season());
    expect(result.summaries).toEqual({});
    expect(result.stats.summariesOffSeason).toBe(1);
  });

  it('drops a summary whose value is not text', () => {
    const result = harvestCacheExport([row('summary:2', { text: 'nope' }), row('summary:2', '   ')], season());
    expect(result.summaries).toEqual({});
    expect(result.stats.malformed).toBe(2);
  });
});

describe('harvestCacheExport vibes', () => {
  it('shapes a cached vibe as a settled entry timestamped when the server cached it', () => {
    const result = harvestCacheExport([row('vibe:2:7', cachedVibe())], season());
    expect(result.vibes).toHaveLength(1);
    expect(result.vibes[0]).toMatchObject({
      showId: 2,
      episode: 7,
      status: 'found',
      kind: 'settle',
      asOf: '2026-07-30T09:00:00.000Z',
      indicator: 'positive',
      upvotes: 1200,
      title: 'Needs A Summary',
    });
  });

  it('keeps vibes for shows outside the season — those are the ones nothing else generates', () => {
    const result = harvestCacheExport([row('vibe:4321:12', cachedVibe())], season());
    expect(result.vibes).toHaveLength(1);
    expect(result.vibes[0].title).toBeUndefined();
  });

  it('omits asOf when the export carried no usable timestamp, and lets the merge fill it', () => {
    const result = harvestCacheExport([row('vibe:2:7', cachedVibe(), 'the other day')], season());
    expect(result.vibes[0].asOf).toBeUndefined();

    const merged = mergeVibeEntries({}, result.vibes, NOW);
    expect(merged.entries['2:7'].asOf).toBe(new Date(NOW).toISOString());
  });

  it('clamps a value the server would have clamped, and drops one with no summary', () => {
    const result = harvestCacheExport(
      [
        row('vibe:2:7', cachedVibe({ indicator: 'ecstatic', upvotes: '900', goods: 'not an array' })),
        row('vibe:2:8', cachedVibe({ summary: '' })),
        row('vibe:2:9', 'not a vibe at all'),
      ],
      season(),
    );
    expect(result.vibes).toHaveLength(1);
    expect(result.vibes[0]).toMatchObject({ indicator: 'mixed', upvotes: 900, goods: [] });
    expect(result.stats.malformed).toBe(2);
  });

  it('produces entries the vibe merge accepts and freezes', () => {
    const result = harvestCacheExport([row('vibe:2:7', cachedVibe())], season());
    const merged = mergeVibeEntries({}, result.vibes, NOW);

    expect(merged.rejected).toEqual([]);
    expect(merged.entries['2:7']).toMatchObject({ status: 'found', settled: true });
    expect(merged.entries['2:7'].asOf).toBe('2026-07-30T09:00:00.000Z');
  });

  it('repairs a cached vibe with an empty url from the bundle title', () => {
    const result = harvestCacheExport([row('vibe:2:7', cachedVibe({ url: '' }))], season());
    const merged = mergeVibeEntries({}, result.vibes, NOW);

    const entry = merged.entries['2:7'];
    expect(entry.status === 'found' && entry.url).toBe(
      'https://www.reddit.com/r/anime/search?q=Needs%20A%20Summary%20episode%207',
    );
  });

  it('never overwrites a settled reading already on the branch', () => {
    const result = harvestCacheExport([row('vibe:2:7', cachedVibe())], season());
    const first = mergeVibeEntries({}, result.vibes, NOW);
    const again = mergeVibeEntries(first.entries, result.vibes, NOW);

    expect(again.merged).toBe(0);
    expect(again.frozen).toBe(1);
  });
});

describe('harvestCacheExport bookkeeping', () => {
  it('ignores namespaces that are not harvestable and counts them', () => {
    const result = harvestCacheExport(
      [row('rec:5:abc123', 'because you liked things'), row('fallback:rec:5:abc123', 'no reason')],
      season(),
    );
    expect(result.summaries).toEqual({});
    expect(result.vibes).toEqual([]);
    expect(result.stats.otherKeys).toBe(2);
  });

  it('ignores keys that are shaped like a namespace but are not one', () => {
    const result = harvestCacheExport(
      [row('summary:abc', 'x'), row('vibe:2', cachedVibe()), row('vibe:2:3:4', cachedVibe())],
      season(),
    );
    expect(result.stats).toMatchObject({ summaryKeys: 0, vibeKeys: 0, otherKeys: 3 });
  });

  it('handles an empty export', () => {
    const result = harvestCacheExport([], season());
    expect(result).toMatchObject({ summaries: {}, vibes: [] });
    expect(result.stats.entries).toBe(0);
  });
});
