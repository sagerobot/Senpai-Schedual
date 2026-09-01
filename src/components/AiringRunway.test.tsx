/** @vitest-environment happy-dom */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnimeMedia, EpisodeLog } from '../types';
import { AiringRunway } from './AiringRunway';

const MIN = 60;

function show(id: number, inSec: number, { title = `Show ${id}`, episode = 6 } = {}): AnimeMedia {
  const now = Math.floor(Date.now() / 1000);
  return {
    id,
    idMal: id,
    averageScore: 80,
    title: { romaji: title, english: title, userPreferred: title },
    bannerImage: null,
    coverImage: { large: 'https://example.test/cover.jpg', color: null },
    startDate: { year: 2026, month: 1, day: 1 },
    nextAiringEpisode: { airingAt: now + inSec, timeUntilAiring: inSec, episode },
    status: 'RELEASING',
    format: 'TV',
    episodes: 12,
    externalLinks: [{ site: 'Crunchyroll', url: 'https://example.test/watch', icon: null, color: null }],
    genres: ['Action'],
  };
}

const logsThrough = (showId: number, n: number): EpisodeLog[] =>
  Array.from({ length: n }, (_, i) => ({ showId, episodeNumber: i + 1, watchedAt: Date.now(), score: 8 }));

describe('AiringRunway', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const render = async (ui: ReactElement) => {
    await act(async () => root.render(ui));
  };

  it('renders nothing when the next hour is empty', async () => {
    await render(<AiringRunway animeList={[show(1, 3 * 3600)]} favorites={[1]} logs={[]} />);
    expect(container.textContent).toBe('');
  });

  it('renders nothing for a show that is not being watched', async () => {
    await render(<AiringRunway animeList={[show(1, 12 * MIN)]} favorites={[]} logs={[]} />);
    expect(container.textContent).toBe('');
  });

  it('gives simultaneous airings one clock and equal chips', async () => {
    await render(
      <AiringRunway
        animeList={[
          show(1, 12 * MIN, { title: 'Dungeon Meshi' }),
          show(2, 12 * MIN, { title: 'Apothecary Diaries' }),
          show(3, 12 * MIN, { title: 'Frieren' }),
        ]}
        favorites={[1, 2, 3]}
        logs={[]}
      />,
    );

    // One <time>, not three: the countdown belongs to the moment.
    expect(container.querySelectorAll('time')).toHaveLength(1);
    expect(container.textContent).toContain('Three shows land at');
    for (const title of ['Dungeon Meshi', 'Apothecary Diaries', 'Frieren']) {
      expect(container.textContent).toContain(title);
    }
  });

  it('offers a catch-up link only for a gap it can close', async () => {
    await render(
      <AiringRunway
        animeList={[show(1, 12 * MIN, { title: 'Closable' }), show(2, 12 * MIN, { title: 'Hopeless' })]}
        favorites={[1, 2]}
        // Closable is one behind (ep 5 outstanding); Hopeless is three behind.
        logs={[...logsThrough(1, 4), ...logsThrough(2, 2)]}
      />,
    );

    const links = [...container.querySelectorAll('a')];
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toContain('Catch up — Ep. 5');
    expect(container.textContent).toContain('Ep. 3 next');
  });

  it('marks a show with nothing outstanding as ready', async () => {
    await render(<AiringRunway animeList={[show(1, 12 * MIN)]} favorites={[1]} logs={logsThrough(1, 5)} />);
    expect(container.textContent).toContain('Ready');
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('leaves once the episode airs, handing the show to the drops feed', async () => {
    vi.useFakeTimers();
    try {
      await render(<AiringRunway animeList={[show(1, 20)]} favorites={[1]} logs={[]} />);
      expect(container.textContent).toContain('On the runway');

      // Past T-0 the episode has aired: latestAiredEpisode reads it as a drop,
      // and the strip has nothing left to count down.
      await act(async () => {
        vi.advanceTimersByTime(25_000);
      });
      expect(container.textContent).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('names a single airing show in the summary and speaks it in minutes', async () => {
    await render(<AiringRunway animeList={[show(1, 47 * MIN, { title: 'Frieren' })]} favorites={[1]} logs={[]} />);
    expect(container.textContent).toContain('Frieren lands at');
    expect(container.textContent).toContain('Frieren airs in 47 minutes');
  });

  it('counts down a stacking show only for its finale', async () => {
    const mid = show(1, 12 * MIN, { episode: 6 });
    const finale = show(2, 12 * MIN, { episode: 12, title: 'Last Dance' });
    await render(<AiringRunway animeList={[mid, finale]} favorites={[]} stacking={[1, 2]} logs={[]} />);
    expect(container.textContent).toContain('Last Dance');
    expect(container.textContent).toContain('finale');
    expect(container.textContent).not.toContain('Show 1');
  });
});
