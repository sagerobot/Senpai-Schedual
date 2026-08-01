/** @vitest-environment happy-dom */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vibeEntrySchema, type VibeEntry } from '../lib/vibesFile';
import type { AnimeMedia } from '../types';
import { EpisodeCard } from './EpisodeCard';

// The bookmark pulls in the user-data store and a Radix dropdown; the card's
// own contract (progress, logging, CTA) is what's under test here.
vi.mock('./LibraryStatusMenu', () => ({
  LibraryStatusMenu: () => null,
}));

const ANIME: AnimeMedia = {
  id: 1,
  idMal: 1,
  averageScore: 86,
  title: { romaji: 'Cowboy Bebop', english: 'Cowboy Bebop', userPreferred: 'Cowboy Bebop' },
  bannerImage: null,
  coverImage: { large: 'https://example.test/cover.jpg', color: null },
  startDate: { year: 1998, month: 4, day: 3 },
  nextAiringEpisode: null,
  status: 'FINISHED',
  format: 'TV',
  episodes: 26,
  externalLinks: [],
  genres: ['Action'],
};

function vibe(overrides: Record<string, unknown> = {}): VibeEntry {
  return vibeEntrySchema.parse({
    showId: 1,
    episode: 4,
    airedAt: 1_780_000_000,
    asOf: '2026-07-31T12:00:00.000Z',
    settled: true,
    status: 'found',
    summary: 'The thread was overwhelmingly positive. Most of it was about the fight.',
    goods: ['The fight'],
    bads: [],
    indicator: 'positive',
    upvotes: 5100,
    comments: 2400,
    url: 'https://www.reddit.com/r/anime/comments/abc/x/',
    ...overrides,
  });
}

describe('EpisodeCard', () => {
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
  });

  async function render(ui: ReactElement) {
    await act(async () => {
      root.render(ui);
    });
  }

  function click(el: Element | null) {
    expect(el).not.toBeNull();
    (el as HTMLElement).click();
  }

  it('renders the title, progress text, and cover alt text', async () => {
    await render(<EpisodeCard anime={ANIME} progress={{ watched: 3, aired: 12 }} onOpen={() => {}} />);

    expect(container.textContent).toContain('Cowboy Bebop');
    expect(container.textContent).toContain('3 / 12');
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Cowboy Bebop cover');
    // One linear bar, no SVG rings.
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(container.querySelector('svg path')).toBeNull();
  });

  it('fires onLog with the score on a chip tap', async () => {
    const onLog = vi.fn();
    await render(
      <EpisodeCard anime={ANIME} progress={{ watched: 3, aired: 12 }} nextEpisodeToWatch={4} onOpen={() => {}} onLog={onLog} />,
    );

    await act(async () => {
      click(container.querySelector('button[aria-label="Rate episode 4 a 7 and mark watched"]'));
    });
    expect(onLog).toHaveBeenCalledTimes(1);
    expect(onLog).toHaveBeenCalledWith(4, 7);
  });

  it('offers the full 0-10 chip range', async () => {
    await render(
      <EpisodeCard anime={ANIME} progress={{ watched: 3, aired: 12 }} nextEpisodeToWatch={4} onOpen={() => {}} onLog={() => {}} />,
    );

    const group = container.querySelector('[role="group"]');
    expect(group?.querySelectorAll('button')).toHaveLength(11);
    expect(container.querySelector('button[aria-label="Rate episode 4 a 0 and mark watched"]')).not.toBeNull();
  });

  it('fires onLog with null on "Watched only"', async () => {
    const onLog = vi.fn();
    await render(
      <EpisodeCard anime={ANIME} progress={{ watched: 3, aired: 12 }} nextEpisodeToWatch={4} onOpen={() => {}} onLog={onLog} />,
    );

    const watchedOnly = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Watched only'),
    );
    await act(async () => {
      click(watchedOnly ?? null);
    });
    expect(onLog).toHaveBeenCalledTimes(1);
    expect(onLog).toHaveBeenCalledWith(4, null);
  });

  it('omits the watch CTA when there is no watchLink, renders it when there is', async () => {
    await render(
      <EpisodeCard anime={ANIME} progress={{ watched: 3, aired: 12 }} nextEpisodeToWatch={4} onOpen={() => {}} onLog={() => {}} />,
    );
    expect(container.querySelector('a')).toBeNull();

    await render(
      <EpisodeCard
        anime={ANIME}
        progress={{ watched: 3, aired: 12 }}
        nextEpisodeToWatch={4}
        onOpen={() => {}}
        onLog={() => {}}
        watchLink="https://example.test/watch"
        ctaLabel="Continue Episode 4"
      />,
    );
    const cta = container.querySelector('a');
    expect(cta?.getAttribute('href')).toBe('https://example.test/watch');
    expect(cta?.textContent).toContain('Continue Episode 4');
  });

  it('hides the whole action row without nextEpisodeToWatch, and opens via the cover', async () => {
    const onOpen = vi.fn();
    await render(
      <EpisodeCard anime={ANIME} progress={{ watched: 3, aired: 12 }} onOpen={onOpen} onLog={() => {}} watchLink="https://example.test/watch" />,
    );

    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(container.querySelector('a')).toBeNull();

    await act(async () => {
      click(container.querySelector('button[aria-label="Open Cowboy Bebop"]'));
    });
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('renders the sentiment chip in words and numbers, never colour alone', async () => {
    await render(
      <EpisodeCard anime={ANIME} progress={{ watched: 3, aired: 12 }} onOpen={() => {}} vibe={vibe()} />,
    );

    const chip = container.querySelector('button[aria-label^="Episode 4 community vibe"]');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain('Positive');
    expect(chip?.textContent).toContain('2.4k');
    expect(chip?.getAttribute('title')).toBe('The thread was overwhelmingly positive.');
  });

  it('opens the modal from the chip', async () => {
    const onOpen = vi.fn();
    await render(
      <EpisodeCard anime={ANIME} progress={{ watched: 3, aired: 12 }} onOpen={onOpen} vibe={vibe()} />,
    );

    await act(async () => {
      click(container.querySelector('button[aria-label^="Episode 4 community vibe"]'));
    });
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('shows no chip without a vibe, or for an episode with no thread', async () => {
    await render(<EpisodeCard anime={ANIME} progress={{ watched: 3, aired: 12 }} onOpen={() => {}} />);
    expect(container.textContent).not.toContain('Positive');

    await render(
      <EpisodeCard
        anime={ANIME}
        progress={{ watched: 3, aired: 12 }}
        onOpen={() => {}}
        vibe={vibe({ status: 'not_found' })}
      />,
    );
    expect(container.querySelector('button[aria-label^="Episode 4 community vibe"]')).toBeNull();
  });
});
