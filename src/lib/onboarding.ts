import type { UiPrefs } from '../stores/userData';
import { AnimeMedia, EpisodeLog, LibraryEntry, LibraryStatus } from '../types';
import { getAiredEpisodesCount, latestAiredEpisode } from './aired';

/**
 * The pure half of new-user onboarding: which shows the picker offers, how
 * they're grouped and ordered, and what the flow writes to the library. Clock
 * in, data out, so the mid-season and season-start cases are unit-testable.
 */

/** The pages that carry a one-time tip (`uiPrefs.seenTips`). */
export type PageTipId = 'schedule' | 'season' | 'watching' | 'library' | 'forYou';

export type OnboardingStep = 'welcome' | 'pick' | 'catchUp' | 'tour';
/** Where the flow starts: first run, "Add this season's shows", or "Take the tour". */
export type OnboardingStart = 'welcome' | 'pick' | 'tour';

export function onboardingSteps(start: OnboardingStart, needsCatchUp: boolean): OnboardingStep[] {
  if (start === 'tour') return ['tour'];
  const shows: OnboardingStep[] = needsCatchUp ? ['pick', 'catchUp'] : ['pick'];
  return start === 'welcome' ? ['welcome', ...shows, 'tour'] : shows;
}

/**
 * Open the flow on its own only for someone who has truly never used the app,
 * and only where it can't hijack anything: the schedule, with no `?show=` link
 * being opened. A shared show link lands on its show, not on a wizard.
 */
export function shouldAutoOpen({
  libraryCount,
  logCount,
  uiPrefs,
  pathname,
  hasShowParam,
}: {
  libraryCount: number;
  logCount: number;
  uiPrefs: Pick<UiPrefs, 'onboarded' | 'welcomeDismissed'>;
  pathname: string;
  hasShowParam: boolean;
}): boolean {
  if (libraryCount > 0 || logCount > 0) return false;
  if (uiPrefs.onboarded || uiPrefs.welcomeDismissed) return false;
  if (hasShowParam) return false;
  return pathname === '/' || pathname === '/schedule';
}

// ---- The picker -----------------------------------------------------------

const PICKABLE_FORMATS = new Set(['TV', 'TV_SHORT', 'ONA']);

/**
 * A long-runner (One Piece, Detective Conan, a years-old kids' show) is
 * airing, but it isn't "this season" to a newcomer — it only appears when the
 * filter names it.
 */
export function isLongRunner(anime: AnimeMedia, nowSec: number): boolean {
  const next = anime.nextAiringEpisode;
  if (!next || next.episode <= 28) return false;
  const start = anime.startDate;
  if (!start?.year) return true;
  const now = new Date(nowSec * 1000);
  const monthsRunning = (now.getFullYear() - start.year) * 12 + (now.getMonth() + 1 - (start.month ?? 1));
  return monthsRunning > 13;
}

/**
 * Episodes out, for the picker and the backfill. Stricter than
 * getAiredEpisodesCount: with a known next episode the count comes from it
 * alone, never from the planned total — AniList sometimes marks a show
 * RELEASING before its episode 1 airs, and "caught up" would then log a
 * whole season that doesn't exist yet.
 */
export function airedForPicker(anime: AnimeMedia, nowSec: number): number {
  if (anime.nextAiringEpisode) return latestAiredEpisode(anime, nowSec)?.episode ?? 0;
  return getAiredEpisodesCount(anime, nowSec);
}

export type PickerSectionId = 'airing' | 'premiering' | 'next';

export interface PickerShow {
  anime: AnimeMedia;
  /** Episodes out now — the catch-up step asks about anything above zero. */
  aired: number;
  /** Already in the library: shown, but not pickable. */
  libraryStatus: LibraryStatus | null;
}

export interface PickerSection {
  id: PickerSectionId;
  shows: PickerShow[];
}

function matchesTerm(anime: AnimeMedia, term: string): boolean {
  const { english, romaji, userPreferred } = anime.title;
  return [english, romaji, userPreferred].some((t) => t?.toLowerCase().includes(term));
}

/** Most talked-about first: trending, then score, then id for a stable order. */
export function comparePickable(a: AnimeMedia, b: AnimeMedia): number {
  return (
    (b.trending ?? 0) - (a.trending ?? 0) || (b.averageScore ?? 0) - (a.averageScore ?? 0) || a.id - b.id
  );
}

/**
 * Group the season into what a newcomer can pick.
 *
 * - `airing`: on the current schedule with at least one episode out.
 * - `premiering`: on the current schedule, nothing out yet. Split on the aired
 *   count rather than `episode === 1`: the bundle can be hours stale, and an
 *   episode 1 whose airingAt has passed is already out.
 * - `next`: next season's line-up (only passed in during a season's final
 *   weeks), minus anything the schedule already carries — an early premiere is
 *   RELEASING and sits in `airing`. Unannounced dates are allowed here.
 *
 * Every section needs a known air date on the current schedule: a RELEASING
 * show with no next episode is on a break, and its aired count would fall
 * back to the planned total.
 */
export function pickerSections({
  schedule,
  nextSeason = [],
  library,
  nowSec,
  term = '',
}: {
  schedule: AnimeMedia[];
  nextSeason?: AnimeMedia[];
  library: Record<number, LibraryEntry>;
  nowSec: number;
  term?: string;
}): PickerSection[] {
  const needle = term.trim().toLowerCase();
  const keep = (a: AnimeMedia) =>
    PICKABLE_FORMATS.has(a.format ?? '') && (needle ? matchesTerm(a, needle) : !isLongRunner(a, nowSec));
  const toShow = (anime: AnimeMedia): PickerShow => ({
    anime,
    aired: airedForPicker(anime, nowSec),
    libraryStatus: library[anime.id]?.status ?? null,
  });
  const byRank = (a: PickerShow, b: PickerShow) => comparePickable(a.anime, b.anime);

  const scheduleIds = new Set<number>();
  const airing: PickerShow[] = [];
  const premiering: PickerShow[] = [];
  for (const anime of schedule) {
    scheduleIds.add(anime.id);
    if (!anime.nextAiringEpisode || !keep(anime)) continue;
    const show = toShow(anime);
    (show.aired > 0 ? airing : premiering).push(show);
  }

  const next: PickerShow[] = [];
  const nextIds = new Set<number>();
  for (const anime of nextSeason) {
    if (scheduleIds.has(anime.id) || nextIds.has(anime.id)) continue;
    if (!anime.nextAiringEpisode && anime.status !== 'NOT_YET_RELEASED') continue;
    if (!keep(anime)) continue;
    nextIds.add(anime.id);
    next.push(toShow(anime));
  }

  return [
    { id: 'airing', shows: airing.sort(byRank) },
    { id: 'premiering', shows: premiering.sort(byRank) },
    { id: 'next', shows: next.sort(byRank) },
  ];
}

/** What a tile says under its title; formatting (dates, locale) is the view's job. */
export type PickerMeta =
  | { kind: 'aired'; count: number }
  | { kind: 'starts'; airingAt: number }
  | { kind: 'startDate'; month: number; day: number | null }
  | { kind: 'unannounced' };

export function pickerMeta(show: PickerShow): PickerMeta {
  if (show.aired > 0) return { kind: 'aired', count: show.aired };
  const next = show.anime.nextAiringEpisode;
  if (next) return { kind: 'starts', airingAt: next.airingAt };
  const start = show.anime.startDate;
  if (start?.month) return { kind: 'startDate', month: start.month, day: start.day ?? null };
  return { kind: 'unannounced' };
}

// ---- What the flow writes ---------------------------------------------------

export interface OnboardingPick {
  showId: number;
  /** Last episode watched: 0 = not started, `aired` = caught up. */
  through: number;
}

export interface OnboardingPlan {
  entries: LibraryEntry[];
  logs: EpisodeLog[];
}

/**
 * Turn the picks into library entries and backfilled logs.
 *
 * - Every pick becomes `watching` — including "not started": the deck and the
 *   Catch-up Queue only look at watching shows, and a Plan to Watch show whose
 *   episode 1 already aired would never surface anywhere.
 * - "Through N" logs 1..N, because every behind-count in the app is
 *   `aired - logs.length`; logging only N would still read N-1 behind.
 * - Backfilled logs carry `watchedAt: 0` — "watched, time unknown", the same
 *   value migrations fall back to. Stamping now would tell Up Next "7 episodes
 *   this week — you're on a run" about a show you watched a month ago.
 * - Anything already there is left alone: a show in the library keeps its
 *   status, an existing log keeps its rating.
 */
export function buildOnboardingPlan({
  picks,
  animeById,
  library,
  logs,
  nowSec,
}: {
  picks: OnboardingPick[];
  animeById: ReadonlyMap<number, AnimeMedia>;
  library: Record<number, LibraryEntry>;
  logs: Record<string, EpisodeLog>;
  nowSec: number;
}): OnboardingPlan {
  const entries: LibraryEntry[] = [];
  const planLogs: EpisodeLog[] = [];
  for (const { showId, through } of picks) {
    if (library[showId]) continue;
    const anime = animeById.get(showId);
    entries.push({
      showId,
      idMal: anime?.idMal ?? null,
      status: 'watching',
      showScore: null,
      source: 'manual',
      updatedAt: nowSec * 1000,
    });
    const aired = anime ? airedForPicker(anime, nowSec) : 0;
    const last = Math.min(Math.max(Math.floor(through), 0), aired);
    for (let episodeNumber = 1; episodeNumber <= last; episodeNumber++) {
      // logKey's format (stores/userData.ts); importing the store here would boot it.
      if (logs[`${showId}:${episodeNumber}`]) continue;
      planLogs.push({ showId, episodeNumber, watchedAt: 0, score: null });
    }
  }
  return { entries, logs: planLogs };
}
