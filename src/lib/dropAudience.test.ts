import { describe, expect, it } from 'vitest';
import { dropRole, inAudience, type DropAudience } from './dropAudience';

const audience = (over: Partial<DropAudience> = {}): DropAudience => ({
  favorites: [],
  stacking: [],
  planning: [],
  guests: [],
  ...over,
});

describe('dropRole', () => {
  it('drops every episode of a watching show, flagging episode 1 as a premiere', () => {
    expect(dropRole(1, 5, 12, false, audience({ favorites: [1] }))).toEqual({ kind: 'weekly', premiere: false });
    expect(dropRole(1, 1, 12, false, audience({ favorites: [1] }))).toEqual({ kind: 'weekly', premiere: true });
  });

  it('drops a stacking show only for an exactly-signalled finale', () => {
    const a = audience({ stacking: [1] });
    expect(dropRole(1, 11, 12, false, a)).toBeNull();
    expect(dropRole(1, 12, 12, false, a)).toEqual({ kind: 'graduation' });
    expect(dropRole(1, 12, 12, true, a)).toBeNull();
    expect(dropRole(1, 40, null, false, a)).toBeNull();
  });

  it('drops a Plan to Watch show for its premiere and nothing after', () => {
    const a = audience({ planning: [1] });
    expect(dropRole(1, 1, 12, false, a)).toEqual({ kind: 'premiere', guest: false });
    expect(dropRole(1, 2, 12, false, a)).toBeNull();
  });

  it('never drops a Plan to Watch or guest premiere on an estimated signal', () => {
    expect(dropRole(1, 1, 12, true, audience({ planning: [1] }))).toBeNull();
    expect(dropRole(1, 1, 12, true, audience({ guests: [1] }))).toBeNull();
  });

  it('drops a guest season for its premiere only', () => {
    const a = audience({ guests: [1] });
    expect(dropRole(1, 1, 12, false, a)).toEqual({ kind: 'premiere', guest: true });
    expect(dropRole(1, 2, 12, false, a)).toBeNull();
  });

  it('lets Watching win over any other audience the id also appears in', () => {
    expect(dropRole(1, 1, 12, false, audience({ favorites: [1], guests: [1] }))).toEqual({ kind: 'weekly', premiere: true });
  });

  it('ignores a show in no audience', () => {
    expect(dropRole(1, 1, 12, false, audience())).toBeNull();
    expect(inAudience(1, audience())).toBe(false);
    expect(inAudience(1, audience({ planning: [1] }))).toBe(true);
  });
});
