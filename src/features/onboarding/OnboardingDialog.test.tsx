/** @vitest-environment happy-dom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAnimeBySeason, fetchCurrentSeasonAnime } from '../../api/anilist/queries';
import type { OnboardingStart } from '../../lib/onboarding';
import { useUserData } from '../../stores/userData';
import type { AnimeMedia } from '../../types';
import OnboardingDialog from './OnboardingDialog';
import { closeOnboarding, openOnboarding, useOnboarding } from './onboardingStore';

vi.mock('../../api/anilist/queries', () => ({
  fetchCurrentSeasonAnime: vi.fn(async () => []),
  fetchAnimeBySeason: vi.fn(async () => []),
  fetchAnimeByIds: vi.fn(async () => []),
  fetchMediaById: vi.fn(async () => {
    throw new Error('not in this test');
  }),
  fetchAnimeByMalIds: vi.fn(async () => []),
  searchAnime: vi.fn(async () => []),
}));

// "No bundle": the schedule resolves off the mocked live fetcher above.
vi.mock('../../queries/seasonBundle', () => ({
  loadScheduleFromBundle: vi.fn(async () => null),
  getBundleShow: vi.fn(() => undefined),
  getBundleSummary: vi.fn(() => undefined),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const DAY = 24 * 3600;
/** Mid-season: seven weeks before fall, so no next-season section. */
const MID_SEASON = new Date(2026, 7, 10, 12);
/** Four days before fall. */
const SEASON_EDGE = new Date(2026, 8, 27, 12);

function show(id: number, title: string, aired: number, opts: Partial<AnimeMedia> = {}): AnimeMedia {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    id,
    idMal: id + 1000,
    averageScore: 80,
    title: { romaji: title, english: title, userPreferred: title },
    bannerImage: null,
    coverImage: { large: `https://example.test/${id}.jpg`, color: null },
    startDate: { year: 2026, month: 7, day: 1 },
    nextAiringEpisode: { airingAt: nowSec + 3 * DAY, timeUntilAiring: 3 * DAY, episode: aired + 1 },
    status: aired > 0 ? 'RELEASING' : 'NOT_YET_RELEASED',
    format: 'TV',
    episodes: 12,
    externalLinks: [],
    genres: [],
    trending: 100 - id,
    ...opts,
  };
}

const buttons = () => Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'));
const button = (text: string) => buttons().find((b) => b.textContent?.trim() === text) ?? null;
const tile = (title: string) =>
  buttons().find((b) => (b.hasAttribute('aria-pressed') || b.hasAttribute('aria-disabled')) && b.textContent?.includes(title)) ??
  null;
/** The success toast's Undo, pressed. */
function pressUndo() {
  const options = vi.mocked(toast.success).mock.calls[0][1] as unknown as { action: { onClick: () => void } };
  act(() => options.action.onClick());
}

const dialogTitle = () => {
  const dialog = document.body.querySelector('[role="dialog"]');
  return document.getElementById(dialog?.getAttribute('aria-labelledby') ?? '')?.textContent ?? null;
};

describe('OnboardingDialog', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MID_SEASON);
    useUserData.setState({ library: {}, logs: {}, uiPrefs: { includeMovies: false, selectedSources: [] } });
    vi.mocked(toast.success).mockClear();
    vi.mocked(fetchCurrentSeasonAnime).mockReset();
    vi.mocked(fetchAnimeBySeason).mockReset();
    vi.mocked(fetchAnimeBySeason).mockResolvedValue([]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    closeOnboarding();
    vi.useRealTimers();
    localStorage.clear();
  });

  async function settle(until?: () => boolean) {
    for (let i = 0; i < (until ? 100 : 8); i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
      if (until?.()) break;
    }
  }

  async function render(start: OnboardingStart, schedule: AnimeMedia[] | Error) {
    if (schedule instanceof Error) vi.mocked(fetchCurrentSeasonAnime).mockRejectedValue(schedule);
    else vi.mocked(fetchCurrentSeasonAnime).mockResolvedValue(schedule);
    openOnboarding(start);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/schedule']}>
            <OnboardingDialog />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await settle();
  }

  const click = async (el: HTMLElement | null) => {
    expect(el).not.toBeNull();
    await act(async () => el!.click());
    await settle();
  };

  it('walks a mid-season newcomer from welcome to a backfilled library', async () => {
    const frieren = show(1, 'Frieren', 7);
    const premiere = show(2, 'Apothecary Diaries', 0);
    await render('welcome', [frieren, premiere]);

    expect(dialogTitle()).toBe("Let's set up your season.");
    await click(button('Pick my shows'));
    expect(dialogTitle()).toBe('What are you watching?');

    await click(tile('Frieren'));
    await click(tile('Apothecary Diaries'));
    expect(tile('Frieren')!.getAttribute('aria-pressed')).toBe('true');
    expect(document.body.textContent).toContain('2 shows picked');
    // Nothing is written while the picks are still being made.
    expect(useUserData.getState().library).toEqual({});

    await click(button('Next'));
    expect(dialogTitle()).toBe('Where are you up to?');
    expect(document.body.textContent).toContain("Apothecary Diaries hasn't started yet");
    const through3 = document.body.querySelector<HTMLButtonElement>('[aria-label="Through episode 3"]');
    await click(through3);
    expect(through3!.getAttribute('aria-checked')).toBe('true');

    await click(button('Next'));
    expect(dialogTitle()).toBe("Today's Drops");

    const { library, logs } = useUserData.getState();
    expect(library[1]).toMatchObject({ status: 'watching', idMal: 1001, source: 'manual' });
    expect(library[2]).toMatchObject({ status: 'watching' });
    expect(Object.keys(logs).sort()).toEqual(['1:1', '1:2', '1:3']);
    expect(Object.values(logs).every((l) => l.watchedAt === 0 && l.score === null)).toBe(true);

    await click(button('Next'));
    await click(button('Next'));
    await click(button('Go to my schedule'));

    expect(useOnboarding.getState().open).toBe(false);
    expect(useUserData.getState().uiPrefs.onboarded).toBe(true);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.success).mock.calls[0][0]).toBe('Added 2 shows to Watching');

    // Undo takes back exactly what the flow wrote.
    pressUndo();
    expect(useUserData.getState().library).toEqual({});
    expect(useUserData.getState().logs).toEqual({});
  });

  it('skips the progress step when nothing picked has aired', async () => {
    await render('welcome', [show(1, 'Frieren', 7), show(2, 'Apothecary Diaries', 0)]);
    await click(button('Pick my shows'));
    await click(tile('Apothecary Diaries'));
    await click(button('Next'));
    expect(dialogTitle()).toBe("Today's Drops");
    expect(useUserData.getState().library[2]).toMatchObject({ status: 'watching' });
    expect(useUserData.getState().logs).toEqual({});
  });

  it('shows library shows as inert, and undo keeps a rating that was already there', async () => {
    useUserData.setState({
      library: { 3: { showId: 3, idMal: null, status: 'stacking', showScore: null, source: 'manual' } },
      logs: { '1:2': { showId: 1, episodeNumber: 2, watchedAt: 5, score: 8 } },
    });
    await render('pick', [show(1, 'Frieren', 4), show(3, 'Dandadan', 6)]);

    const owned = tile('Dandadan');
    expect(owned!.getAttribute('aria-disabled')).toBe('true');
    expect(owned!.textContent).toContain('In your library');
    await click(owned);
    expect(document.body.textContent).toContain('Nothing picked yet');

    await click(tile('Frieren'));
    await click(button('Next'));
    // Caught up is the default: episodes 1-4, with the rated 2 left alone.
    await click(button('Done'));
    expect(useUserData.getState().logs['1:2']).toEqual({ showId: 1, episodeNumber: 2, watchedAt: 5, score: 8 });
    expect(Object.keys(useUserData.getState().logs).sort()).toEqual(['1:1', '1:2', '1:3', '1:4']);

    pressUndo();
    expect(Object.keys(useUserData.getState().library)).toEqual(['3']);
    expect(useUserData.getState().logs).toEqual({
      '1:2': { showId: 1, episodeNumber: 2, watchedAt: 5, score: 8 },
    });
  });

  it('skip and Escape both count as onboarded, and write nothing', async () => {
    await render('welcome', [show(1, 'Frieren', 7)]);
    await click(button('Skip for now'));
    expect(useUserData.getState().uiPrefs.onboarded).toBe(true);
    expect(useOnboarding.getState().open).toBe(false);

    await act(async () => root.unmount());
    root = createRoot(container);
    useUserData.setState({ uiPrefs: { includeMovies: false, selectedSources: [] } });
    await render('pick', [show(1, 'Frieren', 7)]);
    await click(tile('Frieren'));
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle();
    expect(useUserData.getState().uiPrefs.onboarded).toBe(true);
    expect(useUserData.getState().library).toEqual({});
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows skeletons while the season loads and a retryable error when it fails', async () => {
    vi.mocked(fetchCurrentSeasonAnime).mockImplementation(() => new Promise(() => {}));
    openOnboarding('pick');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <OnboardingDialog />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    expect(document.body.querySelector('[aria-busy="true"]')).not.toBeNull();

    await act(async () => root.unmount());
    root = createRoot(container);
    await render('pick', new Error('AniList is down'));
    await settle(() => document.body.textContent?.includes("Couldn't load") ?? false);
    expect(document.body.textContent).toContain("Couldn't load this season's shows");
    expect(button('Retry')).not.toBeNull();
  });

  it("adds next season's line-up in the season's final weeks", async () => {
    vi.setSystemTime(SEASON_EDGE);
    const early = show(20, 'Overgeared', 1);
    vi.mocked(fetchAnimeBySeason).mockResolvedValue([
      early,
      show(21, 'Blue Box Season 2', 0),
      show(22, 'Devils Crest', 0, { nextAiringEpisode: null, startDate: { year: 2026, month: 11, day: null } }),
    ]);
    await render('pick', [show(1, 'Frieren', 12), early]);
    await settle(() => document.body.textContent?.includes('Coming this Fall') ?? false);

    expect(fetchAnimeBySeason).toHaveBeenCalledWith('FALL', 2026);
    expect(document.body.textContent).toContain('Coming this Fall');
    expect(document.body.textContent).toContain('Fall 2026 starts in 4 days');
    expect(tile('Blue Box Season 2')).not.toBeNull();
    expect(tile('Devils Crest')!.textContent).toContain('Starts in November');
    // The early premiere is already on the schedule, so it shows once.
    expect(buttons().filter((b) => b.hasAttribute('aria-pressed') && b.textContent?.includes('Overgeared'))).toHaveLength(1);
  });

  it('never asks about next season in mid-season', async () => {
    await render('pick', [show(1, 'Frieren', 7)]);
    expect(fetchAnimeBySeason).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('Coming this');
  });

  it('runs the tour alone from Settings, with a practice card that logs nothing', async () => {
    await render('tour', [show(1, 'Frieren', 7)]);
    expect(dialogTitle()).toBe("Today's Drops");
    expect(button('Back')).toBeNull();
    expect(document.body.textContent).not.toContain('Step 1 of');

    await click(document.body.querySelector<HTMLButtonElement>('[aria-label="Rate episode 7 a 9 and mark watched"]'));
    expect(useUserData.getState().logs).toEqual({});
  });
});
