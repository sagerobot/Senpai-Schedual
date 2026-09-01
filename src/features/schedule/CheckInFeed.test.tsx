/** @vitest-environment happy-dom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpNextCandidate } from '../../lib/upNext';
import { useUserData } from '../../stores/userData';
import type { AnimeMedia, EpisodeLog, LibraryEntry } from '../../types';
import { CheckInFeed, resetAdmittedDrops, wouldBeDrop } from './CheckInFeed';

vi.mock('../../components/LibraryStatusMenu', () => ({ LibraryStatusMenu: () => null }));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const NOW = Math.floor(Date.now() / 1000);

/** Episode 8 is next week, so the latest aired episode is 7 (estimated). */
function show(airedHoursAgo: number): AnimeMedia {
  return {
    id: 1,
    idMal: 1,
    averageScore: 86,
    title: { romaji: 'Cowboy Bebop', english: 'Cowboy Bebop', userPreferred: 'Cowboy Bebop' },
    bannerImage: null,
    coverImage: { large: 'https://example.test/cover.jpg', color: null },
    startDate: { year: 1998, month: 4, day: 3 },
    nextAiringEpisode: {
      airingAt: NOW + 7 * 24 * 3600 - airedHoursAgo * 3600,
      timeUntilAiring: 7 * 24 * 3600 - airedHoursAgo * 3600,
      episode: 8,
    },
    status: 'RELEASING',
    format: 'TV',
    episodes: 26,
    externalLinks: [{ url: 'https://example.test/watch', site: 'Crunchyroll', icon: null, color: null }],
    genres: ['Action'],
  };
}

const logsThrough = (n: number, showId = 1): EpisodeLog[] =>
  Array.from({ length: n }, (_, i) => ({ showId, episodeNumber: i + 1, watchedAt: NOW, score: 8 }));

/** A distinct show whose episode 6 airs `airsInSec` from NOW (negative = already aired). */
function episodeSixShow(id: number, airsInSec: number): AnimeMedia {
  return {
    ...show(0),
    id,
    idMal: id,
    title: { romaji: `Show ${id}`, english: `Show ${id}`, userPreferred: `Show ${id}` },
    nextAiringEpisode: { airingAt: NOW + airsInSec, timeUntilAiring: airsInSec, episode: 6 },
  };
}

/**
 * A 12-episode show whose finale aired `airedHoursAgo` ago, in the stale
 * signal shape the drops rely on: nextAiringEpisode still points AT the
 * finale with its airingAt in the past.
 */
function finaleShow(id: number, airedHoursAgo: number): AnimeMedia {
  return {
    ...show(0),
    id,
    idMal: id,
    title: { romaji: `Show ${id}`, english: `Show ${id}`, userPreferred: `Show ${id}` },
    episodes: 12,
    nextAiringEpisode: {
      airingAt: NOW - airedHoursAgo * 3600,
      timeUntilAiring: -airedHoursAgo * 3600,
      episode: 12,
    },
  };
}

const watchingEntry = (showId: number): LibraryEntry => ({
  showId,
  idMal: showId,
  status: 'watching',
  showScore: null,
  source: 'manual',
});

function candidate(anime: AnimeMedia, behindCount: number, airedCount: number): UpNextCandidate {
  return {
    anime,
    entry: watchingEntry(anime.id),
    reason: { kind: 'backlog', text: `${behindCount} episodes waiting` },
    nextEpisode: airedCount - behindCount + 1,
    behindCount,
    airedCount,
    userAvgScore: null,
    score: behindCount,
  };
}

describe('CheckInFeed drop admission', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resetAdmittedDrops();
    useUserData.setState({ dropSkips: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function render(ui: ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
    });
  }

  it('does not admit a drop that is already past the drop window', async () => {
    await render(
      <CheckInFeed animeList={[show(50)]} favorites={[1]} logs={logsThrough(3)} onLog={() => {}} onAnimeSelect={() => {}} />,
    );

    expect(container.textContent).not.toContain("Today's Drops");
  });

  it('still admits an episode from yesterday evening, and says so', async () => {
    // The band that made the owner's cards vanish under the old 24h window:
    // watched the following evening is the normal case, not the late one.
    await render(
      <CheckInFeed animeList={[show(26)]} favorites={[1]} logs={logsThrough(6)} onLog={() => {}} onAnimeSelect={() => {}} />,
    );

    expect(container.textContent).toContain("Today's Drops");
    expect(container.textContent).toContain('Yesterday');
    expect(container.textContent).not.toContain('aired today');
  });

  it('warns a card that is about to age out', async () => {
    await render(
      <CheckInFeed animeList={[show(45)]} favorites={[1]} logs={logsThrough(6)} onLog={() => {}} onAnimeSelect={() => {}} />,
    );

    expect(container.textContent).toContain('Leaves in 3h');
  });

  it('keeps an admitted card up across the window lapsing, advancing to the next unwatched episode', async () => {
    // Admitted while in the window: behind, so the card targets episode 4.
    await render(
      <CheckInFeed animeList={[show(23)]} favorites={[1]} logs={logsThrough(3)} onLog={() => {}} onAnimeSelect={() => {}} />,
    );
    expect(container.textContent).toContain('Rate Episode 4');

    // The catch-up rating lands after the window has lapsed. The recompute
    // used to expire the card here — as though today's episode were logged.
    await render(
      <CheckInFeed animeList={[show(50)]} favorites={[1]} logs={logsThrough(4)} onLog={() => {}} onAnimeSelect={() => {}} />,
    );
    expect(container.textContent).toContain("Today's Drops");
    expect(container.textContent).toContain('Rate Episode 5');

    // Logging the aired episode (7) is what resolves the card.
    await render(
      <CheckInFeed animeList={[show(50)]} favorites={[1]} logs={logsThrough(7)} onLog={() => {}} onAnimeSelect={() => {}} />,
    );
    expect(container.textContent).not.toContain("Today's Drops");
  });

  it('drops a pinned card once the grace past the window runs out', async () => {
    await render(
      <CheckInFeed animeList={[show(23)]} favorites={[1]} logs={logsThrough(3)} onLog={() => {}} onAnimeSelect={() => {}} />,
    );
    expect(container.textContent).toContain("Today's Drops");

    // 61h: past DROP_WINDOW_SEC + PIN_GRACE_SEC, so the pin stops carrying it
    // and a tab left open for days cannot hoard cards.
    await render(
      <CheckInFeed animeList={[show(61)]} favorites={[1]} logs={logsThrough(3)} onLog={() => {}} onAnimeSelect={() => {}} />,
    );
    expect(container.textContent).not.toContain("Today's Drops");
  });

  it('holds a just-aired show out of the merged row while the drops memo predates the airing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW * 1000);

    const dropShow = show(23); // id 1 — an admitted drop, so the merged row exists
    const justAiring = episodeSixShow(2, 600); // episode 6 airs 10 min after mount
    const catchUp = { ...show(26), id: 3, idMal: 3, title: { romaji: 'Show 3', english: 'Show 3', userPreferred: 'Show 3' } }; // latest aired 26h ago — legit deck material
    const animeList = [dropShow, justAiring, catchUp];
    const favorites = [1, 2, 3];
    const logs = [...logsThrough(3), ...logsThrough(5, 2), ...logsThrough(3, 3)];
    const noop = () => {};
    const upNextFor = (candidates: UpNextCandidate[]) => ({ candidates, onLog: noop, onSkip: noop, onSelect: noop });

    // Mounted before the airing: the drops memo computes with this clock.
    await render(
      <CheckInFeed animeList={animeList} favorites={favorites} logs={logs} onLog={noop} onAnimeSelect={noop} upNext={upNextFor([])} />,
    );
    expect(container.textContent).toContain('Cowboy Bebop');

    // Episode 6 airs; only the deck's candidates recompute (fresher clock).
    // The drops memo's inputs are identity-equal, so it still predates the
    // airing — the would-be drop must not be dealt in as a catch-up filler,
    // while an ordinary behind candidate still is.
    vi.setSystemTime((NOW + 900) * 1000);
    await render(
      <CheckInFeed
        animeList={animeList}
        favorites={favorites}
        logs={logs}
        onLog={noop}
        onAnimeSelect={noop}
        upNext={upNextFor([candidate(justAiring, 1, 6), candidate(catchUp, 4, 7)])}
      />,
    );
    expect(container.textContent).toContain('Show 3');
    expect(container.textContent).not.toContain('Show 2');
  });

  it('skip button hides the drop for the week and the toast Undo brings it back', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW * 1000);
    const aired = episodeSixShow(2, -300);
    const props = { favorites: [2], logs: logsThrough(5, 2), onLog: () => {}, onAnimeSelect: () => {} };
    await render(<CheckInFeed animeList={[aired]} {...props} />);
    expect(container.textContent).toContain("Today's Drops");

    const skipButton = container.querySelector<HTMLButtonElement>('button[aria-label^="Skip this week"]');
    expect(skipButton).not.toBeNull();
    await act(async () => skipButton!.click());

    expect(container.textContent).not.toContain("Today's Drops");
    expect(useUserData.getState().dropSkips[2].episode).toBe(6);
    expect(toast).toHaveBeenCalledWith('Skipped for this week', expect.anything());

    // Undo through the toast's own action, after the 24h window has lapsed —
    // only the surviving admission pin can bring the card back, so this fails
    // if a skip ever starts clearing pins.
    vi.setSystemTime((NOW + 25 * 3600) * 1000);
    const [, opts] = vi.mocked(toast).mock.calls.at(-1)! as unknown as [
      unknown,
      { action: { onClick: () => void } },
    ];
    await act(async () => opts.action.onClick());
    expect(container.textContent).toContain("Today's Drops");
  });

  it('readmits the show when the next episode airs after a skip', async () => {
    // Last week's episode 5 was skipped; episode 6 just aired.
    useUserData.getState().skipDrop(2, 5);
    await render(
      <CheckInFeed
        animeList={[episodeSixShow(2, -300)]}
        favorites={[2]}
        logs={logsThrough(5, 2)}
        onLog={() => {}}
        onAnimeSelect={() => {}}
      />,
    );
    expect(container.textContent).toContain("Today's Drops");
  });

  it('keeps a skipped episode out of the drops with fresh admission pins (the reload shape)', async () => {
    useUserData.getState().skipDrop(2, 6);
    await render(
      <CheckInFeed
        animeList={[episodeSixShow(2, -300)]}
        favorites={[2]}
        logs={logsThrough(5, 2)}
        onLog={() => {}}
        onAnimeSelect={() => {}}
      />,
    );
    expect(container.textContent).not.toContain("Today's Drops");
  });

  it('deals a skipped show into the merged row as an Up Next filler', async () => {
    const dropShow = show(23); // id 1 — keeps the drops row alive
    const skipped = episodeSixShow(2, -300);
    useUserData.getState().skipDrop(2, 6);
    const noop = () => {};
    await render(
      <CheckInFeed
        animeList={[dropShow, skipped]}
        favorites={[1, 2]}
        logs={[...logsThrough(3), ...logsThrough(5, 2)]}
        onLog={noop}
        onAnimeSelect={noop}
        upNext={{ candidates: [candidate(skipped, 1, 6)], onLog: noop, onSkip: noop, onSelect: noop }}
      />,
    );
    // Without the skip the fresh-clock guard would hold Show 2 out (it aired
    // 5 minutes ago); the skip hands it to the deck instead. Assert the
    // surface, not just presence: the candidate's reason text renders only on
    // an UpNextCard, and the drop card's rate well exactly once — for Cowboy
    // Bebop — which is what proves Show 2 came through as a filler.
    expect(container.textContent).toContain('Cowboy Bebop');
    expect(container.textContent).toContain('Show 2');
    expect(container.textContent).toContain('1 episodes waiting');
    expect(container.textContent!.match(/Tap a score to rate/g)).toHaveLength(1);
  });

  it("admits a stacking show's finale as a graduation drop", async () => {
    await render(
      <CheckInFeed
        animeList={[finaleShow(4, 2)]}
        favorites={[]}
        stacking={[4]}
        logs={logsThrough(2, 4)}
        onLog={() => {}}
        onAnimeSelect={() => {}}
      />,
    );
    expect(container.textContent).toContain('Stack complete');
    expect(container.textContent).toContain('2h ago');
    expect(container.textContent).toContain('Start the binge — Episode 3');
    expect(container.textContent).toContain('Finale: Ep. 12');
  });

  it("keeps a stacking show's mid-season episode out of the drops", async () => {
    // Episode 6 of 26 just aired — stacked on purpose, so no drop card.
    await render(
      <CheckInFeed
        animeList={[episodeSixShow(5, -300)]}
        favorites={[]}
        stacking={[5]}
        logs={[]}
        onLog={() => {}}
        onAnimeSelect={() => {}}
      />,
    );
    expect(container.textContent).not.toContain("Today's Drops");
  });

  it('keeps an admitted graduation card up after AniList clears the airing signal', async () => {
    const aired = finaleShow(6, 2);
    const props = { favorites: [], stacking: [6], onLog: () => {}, onAnimeSelect: () => {} };
    await render(<CheckInFeed animeList={[aired]} logs={logsThrough(2, 6)} {...props} />);
    expect(container.textContent).toContain('Stack complete');

    // The post-finale refresh nulls nextAiringEpisode and flips the status;
    // the admission pin carries the card through it.
    const refreshed = { ...aired, nextAiringEpisode: null, status: 'FINISHED' };
    await render(<CheckInFeed animeList={[refreshed]} logs={logsThrough(2, 6)} {...props} />);
    expect(container.textContent).toContain('Stack complete');

    // Logging the finale is what resolves it.
    await render(<CheckInFeed animeList={[refreshed]} logs={logsThrough(12, 6)} {...props} />);
    expect(container.textContent).not.toContain("Today's Drops");
  });
});

describe('wouldBeDrop', () => {
  const logs = logsThrough(5, 2);

  it('claims a favorited show whose unlogged episode just aired', () => {
    expect(wouldBeDrop(episodeSixShow(2, -300), [2], logs, NOW)).toBe(true);
  });

  it('ignores a show that is not favorited', () => {
    expect(wouldBeDrop(episodeSixShow(2, -300), [1], logs, NOW)).toBe(false);
  });

  it('ignores a show whose episode has not aired yet', () => {
    expect(wouldBeDrop(episodeSixShow(2, 300), [2], logs, NOW)).toBe(false);
  });

  it('ignores a show once the aired episode is logged', () => {
    expect(wouldBeDrop(episodeSixShow(2, -300), [2], logsThrough(6, 2), NOW)).toBe(false);
  });

  it('ignores a show past the drops window', () => {
    expect(wouldBeDrop(episodeSixShow(2, -50 * 3600), [2], logs, NOW)).toBe(false);
    // ...but yesterday's episode is still the drops feed's to claim.
    expect(wouldBeDrop(episodeSixShow(2, -26 * 3600), [2], logs, NOW)).toBe(true);
  });

  it('claims a stacking show for its finale and nothing else', () => {
    expect(wouldBeDrop(finaleShow(7, 2), [], [], NOW, [7])).toBe(true);
    expect(wouldBeDrop(episodeSixShow(7, -300), [], [], NOW, [7])).toBe(false);
    expect(wouldBeDrop(finaleShow(7, 2), [], [], NOW)).toBe(false);
  });

  it('releases a skipped episode to the deck instead of claiming it', () => {
    const skips = { 2: { episode: 6, skippedAt: NOW * 1000 } };
    expect(wouldBeDrop(episodeSixShow(2, -300), [2], logs, NOW, [], skips)).toBe(false);
    // A skip for last week's episode does not release this week's.
    const staleSkips = { 2: { episode: 5, skippedAt: NOW * 1000 } };
    expect(wouldBeDrop(episodeSixShow(2, -300), [2], logs, NOW, [], staleSkips)).toBe(true);
  });
});
