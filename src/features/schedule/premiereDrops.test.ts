import { beforeEach, describe, expect, it } from 'vitest';
import type { AnimeMedia, EpisodeLog } from '../../types';
import { computeDrops, resetAdmittedDrops, wouldBeDrop } from './CheckInFeed';

const NOW = Math.floor(Date.now() / 1000);
const HOUR = 3600;

/** A show whose episode `episode` aired `airedHoursAgo` ago (the stale-signal shape drops rely on). */
function airedShow(id: number, episode: number, airedHoursAgo: number, title = `Show ${id}`): AnimeMedia {
  return {
    id,
    idMal: id,
    averageScore: 80,
    title: { romaji: title, english: title, userPreferred: title },
    bannerImage: null,
    coverImage: { large: 'https://example.test/cover.jpg', color: null },
    startDate: { year: 2026, month: 10, day: 1 },
    nextAiringEpisode: { airingAt: NOW - airedHoursAgo * HOUR, timeUntilAiring: -airedHoursAgo * HOUR, episode },
    status: 'RELEASING',
    format: 'TV',
    episodes: 12,
    externalLinks: [],
    genres: ['Drama'],
  };
}

const NO_LOGS: EpisodeLog[] = [];

describe('premiere drops', () => {
  beforeEach(() => resetAdmittedDrops());

  it('admits a Plan to Watch show for episode 1, as an adoptable premiere', () => {
    const [drop] = computeDrops([airedShow(1, 1, 3)], [], NO_LOGS, [], {}, [1], []);
    expect(drop).toMatchObject({ episode: 1, premiere: true, guest: false, adopt: true, graduation: false });
  });

  it('keeps a Plan to Watch show out once its premiere has passed', () => {
    expect(computeDrops([airedShow(1, 2, 3)], [], NO_LOGS, [], {}, [1], [])).toEqual([]);
  });

  it('admits a guest season premiere as the dashed guest card', () => {
    const [drop] = computeDrops([airedShow(2, 1, 3, 'Hollow Crown Season 2')], [], NO_LOGS, [], {}, [], [2]);
    expect(drop).toMatchObject({ premiere: true, guest: true, adopt: true });
  });

  it('marks a watching show on episode 1 as a premiere it does not need to ask about', () => {
    const [drop] = computeDrops([airedShow(3, 1, 3)], [3], NO_LOGS);
    expect(drop).toMatchObject({ premiere: true, guest: false, adopt: false });
  });

  it('never admits a premiere that was skipped', () => {
    expect(computeDrops([airedShow(1, 1, 3)], [], NO_LOGS, [], { 1: { episode: 1, skippedAt: 0 } }, [1], [])).toEqual([]);
  });

  it('agrees with wouldBeDrop, so the deck holds the same premieres back', () => {
    const premiere = airedShow(1, 1, 3);
    const later = airedShow(2, 2, 3);
    expect(wouldBeDrop(premiere, [], NO_LOGS, NOW, [], {}, [1], [])).toBe(true);
    expect(wouldBeDrop(later, [], NO_LOGS, NOW, [], {}, [2], [])).toBe(false);
    expect(wouldBeDrop(premiere, [], NO_LOGS, NOW, [], {}, [], [1])).toBe(true);
  });
});
