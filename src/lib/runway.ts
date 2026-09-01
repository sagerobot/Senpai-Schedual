import { AnimeMedia, EpisodeLog } from '../types';
import { displayTitle } from './displayTitle';

/**
 * "On the Runway": the hour before an episode airs.
 *
 * The unit here is an **airing moment**, not a show. Anime airs in blocks —
 * three of your shows at 11:30 sharp is an ordinary Saturday — and those
 * three share one countdown. Keying on the show instead would invent a
 * hierarchy that does not exist and render three identical clocks, which
 * reads as a bug.
 *
 * Pure and clock-free (callers pass `nowSec`), so the whole thing is
 * unit-testable and the live tick can live in the component.
 *
 * This module deliberately knows **nothing about `dropSkips`**. A skip always
 * records an episode that has already aired (`handleSkip` in CheckInFeed takes
 * `max(drop.episode, latestAiredEpisode)`), so a skip entry can never name an
 * episode the runway is counting down to — the stages never touch the same
 * episode. Checking it would be permanently-false code implying a coupling
 * that isn't there.
 */

/** An episode is on the runway for the hour before it airs. */
export const RUNWAY_WINDOW_SEC = 3600;

/**
 * Chip geometry, shared with the strip so the pagination maths and the
 * rendered widths can never drift apart. Below the floor the text column
 * drops under ~170px and a title stops being a title, so the lane paginates
 * rather than shrinking further.
 */
export const MIN_CHIP_WIDTH = 238;
export const CHIP_GAP = 14;
/** How much of the next chip stays visible under the edge mask. */
export const CHIP_PEEK = 28;

export interface RunwayShow {
  anime: AnimeMedia;
  /** The episode about to air. */
  episode: number;
  airingAt: number;
  /** Aired-but-unwatched episodes standing between you and this one. */
  behindCount: number;
  /** maxWatched + 1 — what to press play on to close the gap. */
  nextEpisode: number;
  /** A gap of exactly one: an offer you can act on before this lands. */
  closable: boolean;
  /** The season's last episode. */
  finale: boolean;
}

export interface RunwayMoment {
  /** Unix seconds — the shared airing time of everything in `shows`. */
  airingAt: number;
  shows: RunwayShow[];
}

/**
 * The moments inside the next hour, soonest first.
 *
 * Eligibility mirrors the drops feed: watching shows, plus a stacking show
 * only for its finale — a show you are deliberately letting pile up does not
 * want twelve countdowns a season.
 */
export function computeRunway(
  animeList: AnimeMedia[],
  favorites: number[],
  logs: EpisodeLog[],
  nowSec: number,
  stacking: number[] = [],
): RunwayMoment[] {
  const watchedByShow = new Map<number, number[]>();
  for (const log of logs) {
    const list = watchedByShow.get(log.showId);
    if (list) list.push(log.episodeNumber);
    else watchedByShow.set(log.showId, [log.episodeNumber]);
  }

  const shows: RunwayShow[] = [];

  for (const anime of animeList) {
    const next = anime.nextAiringEpisode;
    if (!next) continue;

    const remaining = next.airingAt - nowSec;
    if (remaining <= 0 || remaining > RUNWAY_WINDOW_SEC) continue;

    const isStacking = stacking.includes(anime.id);
    if (!favorites.includes(anime.id) && !isStacking) continue;

    const finale = anime.episodes !== null && next.episode >= anime.episodes;
    if (isStacking && !finale) continue;

    const watched = watchedByShow.get(anime.id) ?? [];
    // Already logged ahead — a raw, a rewatch, a manual entry. Nothing left
    // to anticipate, and a countdown would contradict the log.
    if (watched.includes(next.episode)) continue;

    const maxWatched = watched.reduce((max, n) => Math.max(max, n), 0);
    // The drop card's "caught up" rule, so the handoff at T-0 doesn't change
    // its mind about where you are.
    const behindCount = Math.max(0, next.episode - 1 - maxWatched);

    shows.push({
      anime,
      episode: next.episode,
      airingAt: next.airingAt,
      behindCount,
      nextEpisode: maxWatched + 1,
      closable: behindCount === 1,
      finale,
    });
  }

  // Group by the minute, not the second: a simulcast block's airingAt values
  // are normally identical, but a stray 30-second offset must not split one
  // moment into two.
  const byMinute = new Map<number, RunwayShow[]>();
  for (const show of shows) {
    const key = Math.floor(show.airingAt / 60);
    const group = byMinute.get(key);
    if (group) group.push(show);
    else byMinute.set(key, [show]);
  }

  const moments: RunwayMoment[] = [];
  for (const group of byMinute.values()) {
    moments.push({
      airingAt: Math.min(...group.map((s) => s.airingAt)),
      // Actionable first, so the one chip you can do something about survives
      // pagination; alphabetical under that so the order is stable from tick
      // to tick. Neither says one show matters more than another — they share
      // a clock precisely because none of them is first.
      shows: group.sort(
        (a, b) =>
          Number(b.closable) - Number(a.closable) ||
          displayTitle(a.anime).localeCompare(displayTitle(b.anime)),
      ),
    });
  }

  return moments.sort((a, b) => a.airingAt - b.airingAt);
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function count(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/**
 * The headline sub-line: what lands, and when. The time formatter is injected
 * so this stays locale-free and testable.
 */
export function runwaySummary(moments: RunwayMoment[], formatTime: (airingAt: number) => string): string {
  if (moments.length === 0) return '';

  if (moments.length === 1) {
    const only = moments[0];
    const when = formatTime(only.airingAt);
    if (only.shows.length === 1) return `${displayTitle(only.shows[0].anime)} lands at ${when}`;
    return `${count(only.shows.length)} shows land at ${when}`.replace(/^./, (c) => c.toUpperCase());
  }

  const parts = moments.slice(0, 2).map((m) => `${count(m.shows.length)} at ${formatTime(m.airingAt)}`);
  const extra = moments.length - 2;
  const line = extra > 0 ? `${parts.join(', ')}, +${extra} more` : parts.join(', ');
  return line.replace(/^./, (c) => c.toUpperCase());
}

/**
 * The narrow-chip title. A long subtitled name loses its subtitle rather than
 * letting ellipsis mangle it — "Frieren", not "Frieren: Beyond Journ…".
 */
export function shortTitle(title: string, maxLength: number): string {
  if (title.length <= maxLength) return title;
  const head = title.split(/[:—–]/)[0].trim();
  return head.length > 0 && head.length < title.length ? head : title;
}

/**
 * How the lane lays itself out at a measured width: shrink chips to share the
 * space, and only once they hit the floor start paginating.
 */
export interface LaneLayout {
  chipWidth: number;
  /** Chips fully on screen at once. */
  visible: number;
  /** Chips move one at a time; 0 when everything fits. */
  maxOffset: number;
  paginated: boolean;
}

export function laneLayout(laneWidth: number, chipCount: number): LaneLayout {
  if (chipCount === 0 || laneWidth <= 0) {
    return { chipWidth: MIN_CHIP_WIDTH, visible: chipCount, maxOffset: 0, paginated: false };
  }

  const evenWidth = (laneWidth - (chipCount - 1) * CHIP_GAP) / chipCount;
  if (evenWidth >= MIN_CHIP_WIDTH) {
    return { chipWidth: evenWidth, visible: chipCount, maxOffset: 0, paginated: false };
  }

  // Past the floor: chips lock to the floor and the lane pages. The peek is
  // reserved so the next chip is always half-under the mask — the bubble says
  // there is more, the peek says what's more is a chip and not a cliff.
  const step = MIN_CHIP_WIDTH + CHIP_GAP;
  const visible = Math.max(1, Math.floor((laneWidth + CHIP_GAP - CHIP_PEEK) / step));
  return {
    chipWidth: MIN_CHIP_WIDTH,
    visible,
    maxOffset: Math.max(0, chipCount - visible),
    paginated: chipCount > visible,
  };
}
