/** @vitest-environment happy-dom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimeCard } from './AnimeCard';
import type { AnimeMedia } from '../types';

const SHOW = {
  id: 21,
  idMal: 21,
  title: { romaji: 'One Piece', english: 'One Piece', userPreferred: 'One Piece' },
  coverImage: { large: 'https://example.test/c.jpg', extraLarge: null, color: null },
  bannerImage: null,
  startDate: { year: 1999, month: 10, day: 20 },
  nextAiringEpisode: null,
  status: 'RELEASING',
  format: 'TV',
  episodes: null,
  averageScore: 88,
  genres: ['Action'],
  externalLinks: [{ site: 'Crunchyroll', url: 'https://example.test/watch' }],
} as unknown as AnimeMedia;

describe('AnimeCard', () => {
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
    localStorage.clear();
  });

  async function render(onClick: (anime: AnimeMedia) => void) {
    await act(async () => {
      root.render(<AnimeCard anime={SHOW} onClick={onClick} />);
    });
  }

  it('opens from the keyboard exactly once', async () => {
    const onClick = vi.fn();
    await render(onClick);

    // The cover overlay is the focusable way in; activating it must not also
    // bubble into the card's own click handler.
    const opener = container.querySelector<HTMLButtonElement>('button[aria-label="Open One Piece"]');
    expect(opener).not.toBeNull();

    await act(async () => {
      opener!.click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps streaming links as real anchors', async () => {
    await render(vi.fn());

    const link = container.querySelector<HTMLAnchorElement>('a[href="https://example.test/watch"]');
    expect(link).not.toBeNull();
    expect(link!.target).toBe('_blank');
    expect(link!.rel).toContain('noopener');
    expect(link!.textContent).toContain('Crunchyroll');
  });
});
