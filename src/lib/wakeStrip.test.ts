import { describe, expect, it } from 'vitest';
import { compareBuilds, initialWakeState, railSteps, reduceWake, wakeCopy, type WakeEvent, type WakeState } from './wakeStrip';

const run = (events: WakeEvent[], start: WakeState = initialWakeState('aaaaaaa')) =>
  events.reduce(reduceWake, start);

describe('compareBuilds', () => {
  it('matches identical stamps and flags a different one as newer', () => {
    expect(compareBuilds('aaaaaaa', 'aaaaaaa')).toBe('same');
    expect(compareBuilds('aaaaaaa', 'bbbbbbb')).toBe('newer');
  });

  it('never calls a dev build on either side an update', () => {
    expect(compareBuilds('dev', 'bbbbbbb')).toBe('unknown');
    expect(compareBuilds('aaaaaaa', 'dev')).toBe('unknown');
    expect(compareBuilds('aaaaaaa', null)).toBe('unknown');
  });
});

describe('reduceWake', () => {
  it('says nothing on a warm visit with the same build', () => {
    const s = run([{ type: 'probe-ok', serverBuild: 'aaaaaaa', now: 1 }]);
    expect(s.phase).toBe('hidden');
    expect(s.serverBuild).toBe('aaaaaaa');
    expect(s.checkedAt).toBe(1);
  });

  it('walks a cold visit: waking → latest → hidden', () => {
    let s = run([{ type: 'probe-failed' }]);
    expect(s.phase).toBe('waking');
    s = reduceWake(s, { type: 'probe-ok', serverBuild: 'aaaaaaa', now: 5 });
    expect(s.phase).toBe('latest');
    s = reduceWake(s, { type: 'settled' });
    expect(s.phase).toBe('hidden');
  });

  it('goes straight to updating when the server runs a newer build, warm or cold', () => {
    expect(run([{ type: 'probe-ok', serverBuild: 'bbbbbbb', now: 1 }]).phase).toBe('updating');
    expect(run([{ type: 'probe-failed' }, { type: 'probe-ok', serverBuild: 'bbbbbbb', now: 1 }]).phase).toBe('updating');
  });

  it('treats an old server that sends no build as the same build', () => {
    expect(run([{ type: 'probe-failed' }, { type: 'probe-ok', serverBuild: null, now: 1 }]).phase).toBe('latest');
  });

  it('gives up only from waking, and retry reopens the wait', () => {
    let s = run([{ type: 'probe-failed' }, { type: 'gave-up' }]);
    expect(s.phase).toBe('down');
    expect(reduceWake(initialWakeState('a'), { type: 'gave-up' }).phase).toBe('hidden');
    s = reduceWake(s, { type: 'retry' });
    expect(s.phase).toBe('waking');
  });

  it('a server coming back after down confirms visibly', () => {
    const s = run([{ type: 'probe-failed' }, { type: 'gave-up' }, { type: 'probe-ok', serverBuild: 'aaaaaaa', now: 9 }]);
    expect(s.phase).toBe('latest');
  });

  it('keeps the refused-reload affordance across repeated probes', () => {
    let s = run([{ type: 'probe-ok', serverBuild: 'bbbbbbb', now: 1 }, { type: 'reload-refused' }]);
    expect(s.reloadRefused).toBe(true);
    s = reduceWake(s, { type: 'probe-ok', serverBuild: 'bbbbbbb', now: 2 });
    expect(s.phase).toBe('updating');
    expect(s.reloadRefused).toBe(true);
  });

  it('a manual check shows checking, then confirms or updates', () => {
    let s = run([{ type: 'check-requested' }]);
    expect(s.phase).toBe('checking');
    expect(reduceWake(s, { type: 'probe-ok', serverBuild: 'aaaaaaa', now: 1 }).phase).toBe('latest');
    expect(reduceWake(s, { type: 'probe-ok', serverBuild: 'ccccccc', now: 1 }).phase).toBe('updating');
    // A manual check while the server is asleep becomes the wake story.
    s = reduceWake(s, { type: 'probe-failed' });
    expect(s.phase).toBe('waking');
  });

  it('a manual check cannot restart an update in progress', () => {
    const s = run([{ type: 'probe-ok', serverBuild: 'bbbbbbb', now: 1 }, { type: 'check-requested' }]);
    expect(s.phase).toBe('updating');
  });

  it('settled only closes the latest confirmation', () => {
    expect(run([{ type: 'probe-failed' }, { type: 'settled' }]).phase).toBe('waking');
  });
});

describe('copy and rail', () => {
  it('has no copy while hidden and copy for every visible phase', () => {
    expect(wakeCopy(initialWakeState('a'))).toBeNull();
    for (const phase of ['waking', 'checking', 'latest', 'updating', 'down'] as const) {
      const copy = wakeCopy({ ...initialWakeState('a'), phase });
      expect(copy?.headline).toBeTruthy();
    }
  });

  it('changes the update copy when the reload was refused', () => {
    const base = { ...initialWakeState('a'), phase: 'updating' as const };
    expect(wakeCopy(base)?.headline).not.toEqual(wakeCopy({ ...base, reloadRefused: true })?.headline);
  });

  it('marks the rail by phase', () => {
    expect(railSteps({ ...initialWakeState('a'), phase: 'waking' })).toEqual([1, 0, 0]);
    expect(railSteps({ ...initialWakeState('a'), phase: 'updating' })).toEqual([2, 2, 1]);
    expect(railSteps({ ...initialWakeState('a'), phase: 'latest' })).toEqual([2, 2, 2]);
    expect(railSteps({ ...initialWakeState('a'), phase: 'down' })).toEqual([3, 0, 0]);
  });
});
