/** @vitest-environment happy-dom */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetArmedRatings } from '../../components/AlsoAiringCard';
import type { AlsoAiringEntry, AlsoAiringRow, Pulse } from '../../lib/alsoAiring';
import type { AnimeMedia } from '../../types';
import { AlsoAiring } from './AlsoAiring';

const PULSE: Pulse = {
  source: 'reddit',
  bars: [
    { episode: 1, tone: 'mixed' },
    { episode: 2, tone: 'positive' },
    { episode: 3, tone: 'positive' },
  ],
  trend: { direction: 'rising', sinceEpisode: 2 },
  latestTone: 'positive',
  aspects: [{ name: 'story', tone: 'positive' }],
  comments: 2100,
  anilistScore: 7.4,
};

vi.mock('../../lib/alsoAiring', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/alsoAiring')>()),
  computePulse: vi.fn(() => PULSE),
}));

const VIBES = { get: () => undefined, size: 0 };
vi.mock('../../queries/vibes', () => ({ useVibesIndex: () => VIBES }));

const HOUR = 3600;

function anime(id: number, title = `Show ${id}`): AnimeMedia {
  return {
    id,
    idMal: id,
    averageScore: 74,
    title: { romaji: title, english: title, userPreferred: title },
    bannerImage: null,
    coverImage: { large: 'https://example.test/cover.jpg', color: null },
    startDate: { year: 2026, month: 1, day: 1 },
    nextAiringEpisode: null,
    status: 'RELEASING',
    format: 'TV',
    episodes: 12,
    externalLinks: [{ site: 'Crunchyroll', url: 'https://example.test/watch', icon: null, color: null }],
    genres: ['Action'],
  };
}

function entry(id: number, over: Partial<AlsoAiringEntry> = {}): AlsoAiringEntry {
  const now = Math.floor(Date.now() / 1000);
  const aired = over.aired ?? true;
  return {
    anime: anime(id),
    kind: 'discover',
    status: null,
    episode: 5,
    airingAt: aired ? now - 5 * HOUR : now + 2 * HOUR,
    aired,
    maxWatched: 0,
    firstUnwatched: 1,
    stackWaiting: 0,
    lastRating: null,
    premiere: false,
    ...over,
  };
}

describe('AlsoAiring', () => {
  let container: HTMLDivElement;
  let root: Root;
  const handlers = () => ({ onOpen: vi.fn(), onLog: vi.fn(), onAdopt: vi.fn(), onPlan: vi.fn() });

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resetArmedRatings();
    container = document.createElement('div');
    document.body.appendChild(container);
    // Watch links open a new tab; keep happy-dom from trying to navigate.
    container.addEventListener('click', (e) => {
      if ((e.target as Element).closest('a')) e.preventDefault();
    });
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  const render = async (ui: ReactElement) => {
    await act(async () => root.render(ui));
  };

  const click = async (el: Element | null | undefined) => {
    expect(el).toBeTruthy();
    await act(async () => (el as HTMLElement).click());
  };

  const button = (label: string) =>
    [...container.querySelectorAll('button, a')].find(
      (el) => el.textContent?.trim() === label || el.getAttribute('aria-label') === label,
    );

  const row = (entries: AlsoAiringEntry[]): AlsoAiringRow => {
    const firstUpcoming = entries.findIndex((e) => !e.aired);
    return { entries, nowIndex: firstUpcoming === -1 ? entries.length : firstUpcoming };
  };

  it('renders nothing when the row is empty', async () => {
    await render(<AlsoAiring row={{ entries: [], nowIndex: 0 }} {...handlers()} />);
    expect(container.textContent).toBe('');
  });

  it('puts the NOW divider between the last aired and the first upcoming show', async () => {
    const entries = [entry(1), entry(2), entry(3, { aired: false, episode: 6 }), entry(4, { aired: false, episode: 3 })];
    await render(<AlsoAiring row={row(entries)} {...handlers()} />);

    expect(container.querySelector('h2')?.textContent).toBe('Also Airing');
    expect(container.textContent).toContain('4 more shows in your window · 2 still to air');

    const track = container.querySelector('[data-testid="also-airing-track"]')!;
    const children = [...track.children];
    const nowAt = children.findIndex((el) => el.getAttribute('data-testid') === 'also-airing-now');
    expect(nowAt).toBe(2);
    expect(children[1].textContent).toContain('Show 2');
    expect(children[3].textContent).toContain('Show 3');
    expect(container.querySelectorAll('[data-testid="also-airing-now"]')).toHaveLength(1);
  });

  it('omits the NOW divider when nothing is still to air', async () => {
    await render(<AlsoAiring row={row([entry(1), entry(2)])} {...handlers()} />);
    expect(container.querySelector('[data-testid="also-airing-now"]')).toBeNull();
  });

  it('arms the rate state from Watch, and "Not watched yet" disarms it', async () => {
    await render(<AlsoAiring row={row([entry(1)])} {...handlers()} />);

    const watch = button('Watch Episode 1');
    expect(watch?.tagName).toBe('A');
    expect(watch?.getAttribute('target')).toBe('_blank');
    await click(watch);

    expect(container.textContent).toContain('Back from Episode 1?');
    expect(container.textContent).toContain('How was it?');
    for (const score of [5, 6, 7, 8, 9, 10]) expect(button(`Rate Episode 1 a ${score}`)).toBeTruthy();

    await click(button('Not watched yet'));
    expect(container.textContent).not.toContain('How was it?');
    expect(button('Watch Episode 1')).toBeTruthy();
  });

  it('keeps the armed state across a remount', async () => {
    const entries = [entry(1)];
    await render(<AlsoAiring row={row(entries)} {...handlers()} />);
    await click(button('Watch Episode 1'));
    await act(async () => root.unmount());

    root = createRoot(container);
    await render(<AlsoAiring row={row(entries)} {...handlers()} />);
    expect(container.textContent).toContain('How was it?');
  });

  it('logs the score, then adopts immediately when later episodes are already out', async () => {
    const h = handlers();
    const e = entry(1);
    await render(<AlsoAiring row={row([e])} {...h} />);
    await click(button('Watch Episode 1'));
    await click(button('Rate Episode 1 a 8'));

    expect(h.onLog).toHaveBeenCalledWith(1, 1, 8);
    expect(container.textContent).toContain('Add Show 1 to Watching?');
    expect(container.textContent).toContain("Episodes 2–5 are already out. It moves up to Today's Drops.");
    expect(h.onAdopt).not.toHaveBeenCalled();

    await click(button('Yes, add it'));
    expect(h.onAdopt).toHaveBeenCalledTimes(1);
    expect(h.onAdopt).toHaveBeenCalledWith(e, { episode: 1, score: 8 });
  });

  it('still adopts exactly once when the card unmounts mid-celebration', async () => {
    const h = handlers();
    // Caught up after rating: latest aired is 1, so Yes plays the stamp first.
    const e = entry(1, { episode: 1, premiere: true });
    await render(<AlsoAiring row={row([e])} {...h} />);
    await click(button('Watch Episode 1'));
    await click(button('Watched only'));
    expect(h.onLog).toHaveBeenCalledWith(1, 1, null);
    expect(container.textContent).toContain('It drops in Today\'s Drops when Episode 2 airs');

    await click(button('Yes, add it'));
    expect(h.onAdopt).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    expect(h.onAdopt).toHaveBeenCalledTimes(1);
    expect(h.onAdopt).toHaveBeenCalledWith(e, { episode: 1, score: null });
    root = createRoot(container);
  });

  it('Not now keeps the rating and offers Plan to Watch', async () => {
    const h = handlers();
    const e = entry(1);
    await render(<AlsoAiring row={row([e])} {...h} />);
    await click(button('Watch Episode 1'));
    await click(button('Rate Episode 1 a 9'));
    await click(button('Not now'));

    expect(container.textContent).toContain('Rated Ep 1 · 9');
    expect(button('Still deciding')).toBeTruthy();
    await click(button('Plan to Watch'));
    expect(h.onPlan).toHaveBeenCalledWith(e);
    expect(h.onAdopt).not.toHaveBeenCalled();
  });

  it('gives a stacking card no watch or rate, just Open series', async () => {
    const h = handlers();
    const e = entry(1, { kind: 'stacking', status: 'stacking', maxWatched: 2, firstUnwatched: 3, stackWaiting: 3 });
    await render(<AlsoAiring row={row([e])} {...h} />);

    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).not.toContain('Watch Episode');
    expect(container.textContent).toContain('Stacking · 3 waiting');
    await click(button('Open series'));
    expect(h.onOpen).toHaveBeenCalledWith(e.anime);
  });
});
