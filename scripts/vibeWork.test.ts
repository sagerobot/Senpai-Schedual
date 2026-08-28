import { describe, expect, it } from 'vitest';
import { vibeEntrySchema, vibeKey, type VibeEntry } from '../src/lib/vibesFile';
import { classifyVibeWork, mergeVibeEntries, type AiredEpisode } from './vibeWork';

const NOW = Date.parse('2026-07-31T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

/** Unix seconds, `hours` before NOW. */
const hoursAgo = (hours: number) => Math.floor((NOW - hours * HOUR) / 1000);

function aired(overrides: Partial<AiredEpisode> = {}): AiredEpisode {
  return { showId: 1, episode: 1, airedAt: hoursAgo(1), title: 'Test Show', ...overrides };
}

function entry(overrides: Record<string, unknown> = {}): VibeEntry {
  return vibeEntrySchema.parse({
    showId: 1,
    episode: 1,
    airedAt: hoursAgo(1),
    asOf: new Date(NOW - 2 * HOUR).toISOString(),
    settled: false,
    status: 'found',
    summary: 'The thread was upbeat about the animation and the cliffhanger it ended on.',
    goods: ['Animation'],
    bads: [],
    indicator: 'positive',
    upvotes: 100,
    comments: 50,
    url: 'https://www.reddit.com/r/anime/comments/abc/x/',
    ...overrides,
  });
}

function index(...entries: VibeEntry[]): Record<string, VibeEntry> {
  return Object.fromEntries(entries.map((e) => [vibeKey(e.showId, e.episode), e]));
}

describe('classifyVibeWork', () => {
  it('lists a just-aired episode as "first" — release-day sentiment is the point', () => {
    const work = classifyVibeWork({}, [aired({ airedAt: hoursAgo(0.2) })], NOW);
    expect(work.items).toEqual([
      { key: '1:1', showId: 1, episode: 1, title: 'Test Show', airedAt: hoursAgo(0.2), kind: 'first' },
    ]);
  });

  it('re-reads an unsettled entry once the episode crosses the next refresh rung', () => {
    // Read at age 1h, episode now 5h old: the 2h and 4h rungs have passed.
    const readEarly = entry({ airedAt: hoursAgo(5), asOf: new Date(NOW - 4 * HOUR).toISOString() });
    const work = classifyVibeWork(index(readEarly), [aired({ airedAt: hoursAgo(5) })], NOW);
    expect(work.items.map((i) => i.kind)).toEqual(['update']);
  });

  it('waits between rungs — a reading taken after the last rung holds until the next', () => {
    // Read at age 4.2h, episode now 5h old: 4h rung already covered, 8h not reached.
    const current = entry({ airedAt: hoursAgo(5), asOf: new Date(NOW - 0.8 * HOUR).toISOString() });
    expect(classifyVibeWork(index(current), [aired({ airedAt: hoursAgo(5) })], NOW).items).toEqual([]);
  });

  it('leaves an entry the previous run just wrote alone, even across a rung', () => {
    // Age 2.2h and the 2h rung crossed since the read — but the read is 10min old.
    const fresh = entry({ airedAt: hoursAgo(2.2), asOf: new Date(NOW - 10 * 60 * 1000).toISOString() });
    expect(classifyVibeWork(index(fresh), [aired({ airedAt: hoursAgo(2.2) })], NOW).items).toEqual([]);
  });

  it('sends a 24-48h old episode to the settle pass, entry or not', () => {
    const old = aired({ airedAt: hoursAgo(30) });
    expect(classifyVibeWork({}, [old], NOW).items.map((i) => i.kind)).toEqual(['settle']);
    expect(
      classifyVibeWork(index(entry({ airedAt: hoursAgo(30) })), [old], NOW).items.map((i) => i.kind),
    ).toEqual(['settle']);
  });

  it('never revisits a settled entry', () => {
    const frozen = entry({ settled: true });
    expect(classifyVibeWork(index(frozen), [aired()], NOW).items).toEqual([]);
    expect(classifyVibeWork(index(frozen), [aired({ airedAt: hoursAgo(30) })], NOW).items).toEqual([]);
  });

  it('ignores an episode that has not aired yet, and one past the settle window', () => {
    const work = classifyVibeWork({}, [
      aired({ episode: 1, airedAt: Math.floor((NOW + HOUR) / 1000) }),
      aired({ episode: 2, airedAt: hoursAgo(60) }),
    ], NOW);
    expect(work.items).toEqual([]);
  });

  it('orders the list most-recently-aired first', () => {
    const work = classifyVibeWork({}, [
      aired({ episode: 1, airedAt: hoursAgo(20) }),
      aired({ episode: 2, airedAt: hoursAgo(2) }),
      aired({ episode: 3, airedAt: hoursAgo(9) }),
    ], NOW);
    expect(work.items.map((i) => i.episode)).toEqual([2, 3, 1]);
  });

  it('reserves cap space for settle items, which get no second chance', () => {
    // Four fresh episodes and one about to leave the 48h window, cap of 2.
    const schedule = [
      ...Array.from({ length: 4 }, (_, i) => aired({ showId: 10 + i, airedAt: hoursAgo(1) })),
      aired({ showId: 99, airedAt: hoursAgo(47) }),
    ];

    const work = classifyVibeWork({}, schedule, NOW, 2);

    expect(work.items.map((i) => i.showId)).toContain(99);
    expect(work.items).toHaveLength(2);
    expect(work.eligible).toBe(5);
    expect(work.dropped).toBe(3);
    expect(work.counts).toEqual({ first: 1, update: 0, settle: 1 });
  });
});

describe('mergeVibeEntries', () => {
  const incomingFound = (overrides: Record<string, unknown> = {}) => ({
    showId: 1,
    episode: 1,
    airedAt: hoursAgo(30),
    status: 'found',
    summary: 'The thread landed positive overall, with most of the discussion about the finale twist.',
    goods: ['Direction'],
    bads: [],
    indicator: 'positive',
    upvotes: 900,
    comments: 300,
    url: 'https://www.reddit.com/r/anime/comments/xyz/x/',
    title: 'Test Show',
    kind: 'settle',
    ...overrides,
  });

  it('settles an entry when the work item was a settle pass, and only then', () => {
    const settled = mergeVibeEntries({}, [incomingFound()], NOW);
    expect(settled.entries['1:1'].settled).toBe(true);

    const hourly = mergeVibeEntries({}, [incomingFound({ kind: 'update' })], NOW);
    expect(hourly.entries['1:1'].settled).toBe(false);
  });

  it('ignores an agent-set settled flag when a kind is present', () => {
    const result = mergeVibeEntries({}, [incomingFound({ kind: 'first', settled: true })], NOW);
    expect(result.entries['1:1'].settled).toBe(false);
  });

  it('refuses to overwrite a settled entry', () => {
    const existing = index(entry({ settled: true, summary: 'The original settled reading of this episode.' }));

    const result = mergeVibeEntries(existing, [incomingFound({ kind: 'settle' })], NOW);

    expect(result.merged).toBe(0);
    expect(result.frozen).toBe(1);
    expect(result.entries['1:1']).toBe(existing['1:1']);
  });

  it('overwrites an unsettled entry', () => {
    const result = mergeVibeEntries(index(entry()), [incomingFound({ kind: 'update' })], NOW);
    const merged = result.entries['1:1'];
    expect(result.merged).toBe(1);
    expect(merged.status === 'found' && merged.upvotes).toBe(900);
  });

  it('rejects a summary too short to be a real reading', () => {
    const result = mergeVibeEntries({}, [incomingFound({ summary: 'I cannot help with that.' })], NOW);
    expect(result.merged).toBe(0);
    expect(result.entries).toEqual({});
    expect(result.rejected[0]).toEqual({ key: '1:1', reason: 'summary too short (24 chars)' });
  });

  it('repairs an off-reddit url from the work item title instead of losing the reading', () => {
    const result = mergeVibeEntries({}, [incomingFound({ url: 'https://example.test/thread' })], NOW);
    const merged = result.entries['1:1'];
    expect(merged.status === 'found' && merged.url).toBe(
      'https://www.reddit.com/r/anime/search?q=Test%20Show%20episode%201',
    );
  });

  it('rejects an off-reddit url with no title to rebuild from', () => {
    const result = mergeVibeEntries({}, [incomingFound({ url: 'nonsense', title: undefined })], NOW);
    expect(result.merged).toBe(0);
    expect(result.rejected[0].reason).toContain('no title');
  });

  it('clamps oversized agent output the same way the schema does', () => {
    const result = mergeVibeEntries({}, [incomingFound({ summary: 'y'.repeat(900), goods: Array(9).fill('ok') })], NOW);
    const merged = result.entries['1:1'];
    expect(merged.status === 'found' && merged.summary.length).toBe(600);
    expect(merged.status === 'found' && merged.goods).toHaveLength(5);
  });

  it('fills a missing asOf with now and a missing airedAt with it', () => {
    const result = mergeVibeEntries({}, [incomingFound({ asOf: undefined, airedAt: undefined })], NOW);
    const merged = result.entries['1:1'];
    expect(merged.asOf).toBe(new Date(NOW).toISOString());
    expect(merged.airedAt).toBe(Math.floor(NOW / 1000));
  });

  it('stores a not-found entry with no sentiment fields', () => {
    const result = mergeVibeEntries(
      {},
      [{ showId: 5, episode: 2, airedAt: hoursAgo(30), status: 'not_found', kind: 'settle' }],
      NOW,
    );
    expect(result.entries['5:2']).toMatchObject({ status: 'not_found', settled: true });
  });

  it('carries stored aspects forward when the new read heard none', () => {
    // The backfill-writer blocker: an update packet with empty aspects used to
    // wipe the stored object and trip the no-aspects-lost gate every run.
    const existing = index(entry({ aspects: { story: 'mixed', characters: 'positive' } }));

    const omitted = mergeVibeEntries(existing, [incomingFound({ kind: 'update', aspects: undefined })], NOW);
    const merged = omitted.entries['1:1'];
    expect(merged.status === 'found' && merged.aspects).toEqual({ story: 'mixed', characters: 'positive' });

    const empty = mergeVibeEntries(existing, [incomingFound({ kind: 'update', aspects: {} })], NOW);
    const still = empty.entries['1:1'];
    expect(still.status === 'found' && still.aspects).toEqual({ story: 'mixed', characters: 'positive' });
  });

  it('folds aspects per dimension: the new read wins where it spoke, silence changes nothing', () => {
    const existing = index(entry({ aspects: { animation: 'mixed', story: 'positive' } }));
    const result = mergeVibeEntries(
      existing,
      [incomingFound({ kind: 'update', aspects: { story: 'mixed', pacing: 'negative' } })],
      NOW,
    );
    const merged = result.entries['1:1'];
    expect(merged.status === 'found' && merged.aspects).toEqual({
      animation: 'mixed',
      story: 'mixed',
      pacing: 'negative',
    });
  });

  it('stores no aspects field at all when neither side heard any', () => {
    const result = mergeVibeEntries({}, [incomingFound({ aspects: {} })], NOW);
    const merged = result.entries['1:1'];
    expect(merged.status === 'found' && 'aspects' in merged).toBe(false);
  });

  it('never deletes: a rejected item leaves the stored entry alone', () => {
    const existing = index(entry());
    const result = mergeVibeEntries(existing, [{ garbage: true }, incomingFound({ summary: 'no' })], NOW);
    expect(result.entries['1:1']).toBe(existing['1:1']);
    expect(result.rejected).toHaveLength(2);
  });
});

describe('mergeVibeEntries: quiet', () => {
  const incomingQuiet = (overrides: Record<string, unknown> = {}) => ({
    showId: 1,
    episode: 1,
    airedAt: hoursAgo(30),
    status: 'quiet',
    upvotes: 3,
    comments: 2,
    url: 'https://www.reddit.com/r/anime/comments/qt/x/',
    title: 'Test Show',
    kind: 'settle',
    ...overrides,
  });

  it('stores a quiet entry, settled by kind like any other', () => {
    const result = mergeVibeEntries({}, [incomingQuiet()], NOW);
    const stored = result.entries['1:1'];
    expect(stored.status).toBe('quiet');
    expect(stored.settled).toBe(true);
    expect(stored.status === 'quiet' && stored.comments).toBe(2);
  });

  it('never trades a found reading down for a quiet one', () => {
    const existing = index(entry({ settled: false }));
    const result = mergeVibeEntries(existing, [incomingQuiet()], NOW);
    expect(result.entries['1:1'].status).toBe('found');
    expect(result.rejected.map((r) => r.reason)).toEqual(['quiet cannot replace a found reading']);
  });

  it('upgrades a quiet entry to a found reading', () => {
    const quietFirst = mergeVibeEntries({}, [incomingQuiet({ kind: 'first' })], NOW);
    const result = mergeVibeEntries(quietFirst.entries, [incomingFoundLike()], NOW);
    expect(result.entries['1:1'].status).toBe('found');
  });

  it('rejects a quiet entry without a verified thread url — there is no search-URL repair', () => {
    const result = mergeVibeEntries({}, [incomingQuiet({ url: 'https://example.com/thread' })], NOW);
    expect(result.entries['1:1']).toBeUndefined();
    expect(result.rejected[0].reason).toContain('verified reddit thread URL');
  });
});

/** A found item shaped like the writer emits, for the quiet-upgrade case. */
function incomingFoundLike(): Record<string, unknown> {
  return {
    showId: 1,
    episode: 1,
    airedAt: hoursAgo(30),
    status: 'found',
    summary: 'Late discussion filled in positive, centered on the production values.',
    goods: [],
    bads: [],
    indicator: 'positive',
    upvotes: 40,
    comments: 12,
    url: 'https://www.reddit.com/r/anime/comments/up/x/',
    title: 'Test Show',
    kind: 'update',
  };
}
