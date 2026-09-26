import { Bookmark, Check, CheckCircle2, Clock, Layers, Play, Sparkles, Star } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { toast } from 'sonner';
import { adoptLayoutId } from '../../components/AlsoAiringCard';
import { CardMetaPills } from '../../components/CardMetaPills';
import { FitTitle } from '../../components/FitTitle';
import { LibraryStatusMenu } from '../../components/LibraryStatusMenu';
import { RatedStamp, SendOffBeat } from '../../components/RatedStamp';
import { RatingBlock } from '../../components/RatingBlock';
import { SwipeCell, portalExitCell, useSwapSlots } from '../../components/SwipeCell';
import { UpNextCard } from '../../components/UpNextDeck';
import { VibeChip } from '../../components/VibeChip';
import type { UpNextCandidate } from '../../lib/upNext';
import { latestAiredEpisode } from '../../lib/aired';
import { dropRole, inAudience, type DropAudience } from '../../lib/dropAudience';
import { DROP_WINDOW_SEC, PIN_GRACE_SEC, dropFreshness } from '../../lib/freshness';
import { CELEBRATE, DUR, EASE_STANDARD, LAYOUT_SWAP, SPRING_POP, celebrationTier } from '../../lib/motion';
import { displayTitle } from '../../lib/displayTitle';
import { NOT_IN_WATCHING_LABEL, WATCH_STATE_LABELS } from '../../lib/status';
import { cn } from '../../lib/utils';
import type { VibeEntry } from '../../lib/vibesFile';
import { pickWatchLink } from '../../lib/watchLinks';
import { watchCta } from '../../lib/watchCta';
import { useVibesIndex } from '../../queries/vibes';
import { useUserData } from '../../stores/userData';
import { AnimeMedia, DropSkip, EpisodeLog, LibraryStatus } from '../../types';

/** The Up Next deck, dealt into this grid's leftover columns (the merged row). */
export interface CheckInFeedUpNext {
  candidates: UpNextCandidate[];
  /** Pre-wrapped with the host's undo toast. */
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onSkip: (showId: number) => void;
  onSelect: (anime: AnimeMedia) => void;
}

interface CheckInFeedProps {
  animeList: AnimeMedia[];
  favorites: number[];
  /** Stacking-status show ids — drop material only on their finale's day. */
  stacking?: number[];
  /** Plan to Watch ids and guest season premieres — drop material only for episode 1. */
  planning?: number[];
  guests?: number[];
  logs: EpisodeLog[];
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onAnimeSelect?: (anime: AnimeMedia) => void;
  upNext?: CheckInFeedUpNext;
  /**
   * Shows just adopted from Also Airing whose drop card should arrive with the
   * rating celebration already playing: showId -> the episode rated there.
   */
  arrivals?: Record<number, { episode: number; score: number | null }>;
  onArrivalShown?: (showId: number) => void;
}

/** What the "Add to Watching?" ask resolved to; 'keep' leaves the library alone. */
export type AdoptChoice = 'watching' | 'plan' | 'keep';

/**
 * One rating's celebration. The log is written the moment the score is
 * tapped — the beats are presentation only — so `frozen` keeps the card as it
 * was rated on screen while the stamp plays, and holds a card whose drop the
 * log just resolved (`leaving`) in its slot until the send-off is done.
 */
interface Celebration {
  id: number;
  frozen: Drop;
  episode: number;
  score: number | null;
  leaving: boolean;
  /** Came up from Also Airing — keeps the shared-layout id for the flight. */
  arrived?: boolean;
}

let celebrationSeq = 0;

/**
 * Live column count of the drops grid, mirroring its Tailwind breakpoints
 * (md:2 lg:3 xl:4). The merged row needs it to know how many deck cards
 * complete the final row on the screen actually being looked at.
 */
function useGridColumns(): number {
  const [cols, setCols] = useState(1);
  useEffect(() => {
    const tiers = [
      { mq: window.matchMedia('(min-width: 1280px)'), cols: 4 },
      { mq: window.matchMedia('(min-width: 1024px)'), cols: 3 },
      { mq: window.matchMedia('(min-width: 768px)'), cols: 2 },
    ];
    const update = () => setCols(tiers.find((t) => t.mq.matches)?.cols ?? 1);
    update();
    tiers.forEach((t) => t.mq.addEventListener('change', update));
    return () => tiers.forEach((t) => t.mq.removeEventListener('change', update));
  }, []);
  return cols;
}

interface Drop {
  anime: AnimeMedia;
  episode: number;
  airedAt: number;
  maxWatched: number;
  userAvgScore: number | null;
  /** A stacking show's finale — the card wears the binge-ready graduation. */
  graduation: boolean;
  /** Episode 1 — the card wears the premiere band. */
  premiere: boolean;
  /** A season premiere whose own entry isn't in the library: the dashed guest card. */
  guest: boolean;
  /** Not in Watching: rating it asks whether to add it (Plan to Watch or guest premieres). */
  adopt: boolean;
}

/** The quick row; everything below 5 lives behind the LowScoreButtons expander. */

/**
 * Stable empty default for the stacking prop — an inline `= []` would be a
 * fresh identity every render and make the drops memo recompute each time,
 * reading a fresh clock and defeating the admission-pin design.
 */
const NO_STACKING: number[] = [];

/** Same stable-identity rule for the skips argument. */
const NO_SKIPS: Record<number, DropSkip> = {};

/** And for the premiere audiences (Plan to Watch ids, guest season premieres). */
const NO_IDS: number[] = [];

/**
 * Admission pins: showId -> the latest-aired episode a drop card is up for.
 * The drops memo only re-runs when logs/animeList/favorites change, and it
 * reads the clock when it does — so without pins, a card that crossed the
 * window while sitting on screen vanishes on exactly the recompute that a
 * catch-up rating triggers, looking like the rating logged today's episode.
 * The window therefore only gates *admission*; an admitted card stays until
 * the episode is logged, a newer one replaces it, or PIN_GRACE_SEC runs out.
 * Module-level so a route hop doesn't reset it; a reload does, which means a
 * refresh re-judges every card against the window alone.
 *
 * airedAt rides along because a finale's airing signal is the one AniList
 * later deletes — the post-finale refresh nulls nextAiringEpisode — so a
 * pinned finale card falls back to its pin instead of vanishing mid-window.
 */
const admittedDrops = new Map<number, { episode: number; airedAt: number }>();

/** Test hook. */
export function resetAdmittedDrops() {
  admittedDrops.clear();
}

/**
 * The drops the feed would draw right now. Exported so DailySchedule can tell
 * when the feed has gone quiet (the Up Next handoff moment). Idempotent for a
 * given input set — re-admitting an already-admitted episode is a no-op — so
 * the component and the host may both call it in one render.
 */
export function computeDrops(
  animeList: AnimeMedia[],
  favorites: number[],
  logs: EpisodeLog[],
  stacking: number[] = [],
  skips: Record<number, DropSkip> = NO_SKIPS,
  planning: number[] = NO_IDS,
  guests: number[] = NO_IDS,
): Drop[] {
  const recent: Drop[] = [];
  const now = Math.floor(Date.now() / 1000);
  const audience: DropAudience = { favorites, stacking, planning, guests };

  for (const anime of animeList) {
    if (!inAudience(anime.id, audience)) continue;

    // latestAiredEpisode is stale-proof: it recognizes a passed airingAt as
    // "this episode aired" even when the 8-hourly bundle hasn't caught up,
    // which is exactly the window in which a drop matters most. When the
    // signal is gone entirely (a finale's nextAiringEpisode nulled by the
    // post-airing refresh), an existing pin carries the card instead.
    const latest = latestAiredEpisode(anime, now);
    const pin = admittedDrops.get(anime.id);
    const current = latest ?? pin ?? null;
    if (current === null) continue;

    const episodeNum = current.episode;
    // Who the card is for (dropAudience.ts): a stacking show only for its
    // finale, Plan to Watch and guest seasons only for episode 1. Exact signal
    // only for a finale: the estimated branch can fabricate one when an episode
    // count is wrong (pins were admitted on an exact signal already).
    // A pin was admitted on the rules below, so it stands as exact: once the
    // post-airing refresh moves AniList on to the next episode, the premiere
    // it admitted must not read as a guess and vanish mid-window.
    const estimated = pin?.episode === episodeNum ? false : (latest?.estimated ?? false);
    const role = dropRole(anime.id, episodeNum, anime.episodes, estimated, audience);
    if (role === null) continue;

    // "Skip this week": the skipped episode never drops again — but its pin
    // survives, so an Undo restores the card even after the window. Next
    // week's episode isn't the skipped one and admits normally.
    if (skips[anime.id]?.episode === episodeNum) continue;

    const timeSinceAir = now - current.airedAt;
    const inWindow = timeSinceAir >= 0 && timeSinceAir <= DROP_WINDOW_SEC;
    const pinned = pin?.episode === episodeNum;
    // A pin carries a card past the window so a catch-up rating can't look
    // like it dismissed today's episode — but only so far. Past the grace the
    // pin is dropped outright, or a tab left open for days would hoard cards.
    if (pinned && timeSinceAir > DROP_WINDOW_SEC + PIN_GRACE_SEC) {
      admittedDrops.delete(anime.id);
      continue;
    }
    if (!inWindow && !pinned) continue;

    const showLogs = logs.filter((l) => l.showId === anime.id);
    if (showLogs.some((l) => l.episodeNumber === episodeNum)) continue;

    admittedDrops.set(anime.id, { episode: episodeNum, airedAt: current.airedAt });
    const maxWatched = showLogs.length > 0 ? Math.max(...showLogs.map((l) => l.episodeNumber)) : 0;
    const ratedLogs = showLogs.filter((l) => l.score !== null && l.score !== undefined);
    const userAvgScore =
      ratedLogs.length > 0 ? ratedLogs.reduce((acc, l) => acc + (l.score ?? 0), 0) / ratedLogs.length : null;
    recent.push({
      anime,
      episode: episodeNum,
      airedAt: current.airedAt,
      maxWatched,
      userAvgScore,
      graduation: role.kind === 'graduation',
      premiere: role.kind === 'premiere' || (role.kind === 'weekly' && role.premiere),
      guest: role.kind === 'premiere' && role.guest,
      adopt: role.kind === 'premiere',
    });
  }
  return recent.sort((a, b) => b.airedAt - a.airedAt);
}

/**
 * Would computeDrops admit this show, judged with a fresh clock? (Same
 * admission test, minus the pins — pinned cards are already in the drops
 * list.) The drops memo and the deck's candidate memo re-run on different
 * dependencies, so for a stretch after an episode airs the deck can know
 * about it while the drops list on screen predates it. A show in that gap is
 * a drop card waiting for the next drops recompute, not catch-up material —
 * deck surfaces use this to hold it back until the drop card claims it.
 */
export function wouldBeDrop(
  anime: AnimeMedia,
  favorites: number[],
  logs: EpisodeLog[],
  nowSec: number,
  stacking: number[] = [],
  skips: Record<number, DropSkip> = NO_SKIPS,
  planning: number[] = NO_IDS,
  guests: number[] = NO_IDS,
): boolean {
  const audience: DropAudience = { favorites, stacking, planning, guests };
  if (!inAudience(anime.id, audience)) return false;
  const latest = latestAiredEpisode(anime, nowSec);
  if (latest === null) return false;
  // A skipped episode is deck material by design — without this, the show
  // would vanish from both surfaces for the rest of the drop window.
  if (skips[anime.id]?.episode === latest.episode) return false;
  if (dropRole(anime.id, latest.episode, anime.episodes, latest.estimated, audience) === null) return false;
  const timeSinceAir = nowSec - latest.airedAt;
  if (timeSinceAir < 0 || timeSinceAir > DROP_WINDOW_SEC) return false;
  return !logs.some((l) => l.showId === anime.id && l.episodeNumber === latest.episode);
}

/**
 * "Today's Drops": watching shows whose latest episode aired within the last
 * 24 hours and hasn't been logged yet, drawn as the big cinematic banner card.
 * A card already on screen outlives the window (see admittedDrops), so rating
 * catch-up episodes advances it instead of dismissing it.
 */
export function CheckInFeed({
  animeList,
  favorites,
  stacking = NO_STACKING,
  planning = NO_IDS,
  guests = NO_IDS,
  logs,
  onLog,
  onAnimeSelect,
  upNext,
  arrivals,
  onArrivalShown,
}: CheckInFeedProps) {
  const vibes = useVibesIndex();
  const cols = useGridColumns();
  const dropSkips = useUserData((s) => s.dropSkips);
  const [celebrations, setCelebrations] = useState<Record<number, Celebration>>({});

  const liveDrops = useMemo(
    () => computeDrops(animeList, favorites, logs, stacking, dropSkips, planning, guests),
    [animeList, favorites, logs, stacking, dropSkips, planning, guests],
  );

  // A card whose drop the rating just resolved stays in its slot until its
  // send-off beat is over — then it leaves the way a logged drop always has.
  const drops = useMemo(() => {
    const live = new Set(liveDrops.map((d) => d.anime.id));
    const lingering = Object.values(celebrations)
      .filter((c) => c.leaving && !live.has(c.frozen.anime.id))
      .map((c) => c.frozen);
    if (lingering.length === 0) return liveDrops;
    return [...liveDrops, ...lingering].sort((a, b) => b.airedAt - a.airedAt);
  }, [liveDrops, celebrations]);

  // Arrivals from Also Airing: the drop exists now that the show is in
  // Watching; its celebration plays as though it had been rated right here,
  // showing the episode that was rated until the stamp hands over. Built
  // during render (cached by show so the id is stable), because a card that
  // mounted without it would flash its live face first and then swipe back.
  const arrivalCache = useRef(new Map<number, Celebration>());
  const arrivalCelebrations = useMemo(() => {
    const out: Record<number, Celebration> = {};
    if (!arrivals) return out;
    for (const d of liveDrops) {
      const a = arrivals[d.anime.id];
      if (a === undefined) continue;
      let c = arrivalCache.current.get(d.anime.id);
      if (!c || c.episode !== a.episode) {
        c = {
          id: ++celebrationSeq,
          frozen: { ...d, maxWatched: a.episode - 1, adopt: false, premiere: false },
          episode: a.episode,
          score: a.score,
          leaving: false,
          arrived: true,
        };
        arrivalCache.current.set(d.anime.id, c);
      }
      out[d.anime.id] = c;
    }
    return out;
  }, [arrivals, liveDrops]);
  // Then hand each one over to the ordinary celebration state (same object,
  // same id, so nothing restarts) and release the arrival.
  useEffect(() => {
    const ids = Object.keys(arrivalCelebrations).map(Number);
    if (ids.length === 0) return;
    setCelebrations((current) => {
      const next = { ...current };
      for (const id of ids) next[id] = arrivalCelebrations[id];
      return next;
    });
    for (const id of ids) {
      arrivalCache.current.delete(id);
      onArrivalShown?.(id);
    }
  }, [arrivalCelebrations, onArrivalShown]);

  // This surface's onLog arrives raw from schedule/route.tsx, so the undo
  // toast lives here — same pattern as watching/route.tsx (which already
  // toasts before its onLog reaches the Catch-Up Queue).
  const handleLog = useCallback(
    (showId: number, episodeNumber: number, score: number | null) => {
      onLog(showId, episodeNumber, score);
      toast(`Logged episode ${episodeNumber}`, {
        action: { label: 'Undo', onClick: () => useUserData.getState().unlogEpisode(showId, episodeNumber) },
      });
    },
    [onLog],
  );

  const handleRate = useCallback(
    (drop: Drop, episodeNumber: number, score: number | null) => {
      setCelebrations((current) => ({
        ...current,
        [drop.anime.id]: {
          id: ++celebrationSeq,
          frozen: drop,
          episode: episodeNumber,
          score,
          // Logging the episode on offer resolves the drop; a catch-up
          // episode behind it leaves the card in place for the next one.
          leaving: episodeNumber >= drop.episode,
        },
      }));
      handleLog(drop.anime.id, episodeNumber, score);
    },
    [handleLog],
  );

  const endCelebration = useCallback((showId: number) => {
    setCelebrations((current) => {
      if (current[showId] === undefined) return current;
      const next = { ...current };
      delete next[showId];
      return next;
    });
  }, []);

  const handleAdoptChoice = useCallback((drop: Drop, choice: AdoptChoice) => {
    if (choice === 'keep') return;
    adoptWithUndo(drop.anime.id, choice === 'watching' ? 'watching' : 'plan_to_watch', displayTitle(drop.anime));
  }, []);

  // A mis-tap here hides the card for a week, so the undo toast is mandatory
  // (a graduation card has no next week — its home becomes the deck).
  const handleSkip = useCallback((drop: Drop) => {
    // Record the freshest aired episode, not just the on-screen one: a pinned
    // card can predate an airing a fresh clock already sees, and skipping the
    // stale number would let the new episode re-admit on this very tap.
    const latest = latestAiredEpisode(drop.anime, Math.floor(Date.now() / 1000));
    const episode = Math.max(drop.episode, latest?.episode ?? 0);
    useUserData.getState().skipDrop(drop.anime.id, episode);
    toast(drop.graduation ? 'Saved for later — waiting in your deck' : 'Skipped for this week', {
      action: { label: 'Undo', onClick: () => useUserData.getState().unskipDrop(drop.anime.id) },
    });
  }, []);

  // The merged row: deck cards complete the final drops row instead of the
  // page waiting for every drop to be logged. Single-column screens skip it —
  // there is no leftover column to fill. A behind drop show is also a ranked
  // deck candidate, so filter by drop id or a show could appear twice in the
  // same row. dropIds alone isn't enough: the drops memo may predate an
  // airing the candidates already know about, so a would-be drop is filtered
  // by a fresh clock too (this runs un-memoized, so it stays current).
  const dropIds = new Set(drops.map((d) => d.anime.id));
  const nowSec = Math.floor(Date.now() / 1000);
  const available = upNext
    ? upNext.candidates.filter(
        (c) =>
          !dropIds.has(c.anime.id) &&
          !wouldBeDrop(c.anime, favorites, logs, nowSec, stacking, dropSkips, planning, guests),
      )
    : [];
  const fillCount = cols > 1 ? Math.min((cols - (drops.length % cols)) % cols, available.length) : 0;
  const fillers = available.slice(0, fillCount);

  // Two sticky slot groups, drops always ahead of fillers: replacements swap
  // in place only within a group — a skipped filler's slot is retaken by the
  // next candidate, a day-rollover episode swaps into its show's slot — but a
  // logged drop compacts away, so deck cards only ever extend the tail of the
  // last row and never take a drop's place mid-grid. Hooks run before the
  // empty-drops return so their order is stable and slots reset when the feed
  // goes quiet.
  const dropByKey = new Map(drops.map((d) => [`drop-${d.anime.id}-${d.episode}`, d]));
  const fillerByKey = new Map(fillers.map((c) => [`up-${c.anime.id}`, c]));
  const dropSlots = useSwapSlots([...dropByKey.keys()]);
  const fillerSlots = useSwapSlots([...fillerByKey.keys()]);

  // The portal move: when compaction wraps a cell to the previous row (always
  // column 1 up to the last column of the row above), a diagonal layout slide
  // would drag the card across the whole grid. Instead the cell's key gets a
  // new generation, remounting it — the old instance slides off screen left
  // (registered in portalExitCell), the new one rides in from the right. A
  // cols change reflows every row at once, so it updates rows without
  // portaling. Ref mutations are idempotent for StrictMode re-renders.
  const cellGens = useRef(new Map<string, { row: number; gen: number; enterKey: string | null }>());
  const colsChanged = useRef(cols);
  const colsDidChange = colsChanged.current !== cols;
  colsChanged.current = cols;
  const resolveCell = (id: string, index: number): { key: string; portalEnter: boolean } => {
    const row = Math.floor(index / cols);
    let entry = cellGens.current.get(id);
    if (!entry) {
      entry = { row, gen: 0, enterKey: null };
      cellGens.current.set(id, entry);
    } else if (entry.row !== row) {
      if (!colsDidChange && cols > 1 && row < entry.row) {
        portalExitCell(`${id}g${entry.gen}`);
        entry.gen += 1;
        entry.enterKey = `${id}g${entry.gen}`;
      }
      entry.row = row;
    }
    const key = `${id}g${entry.gen}`;
    return { key, portalEnter: entry.enterKey === key };
  };

  if (drops.length === 0) return null;

  const deckRemaining = available.length - fillers.length;
  const merged = fillers.length > 0;

  // In merged mode everything is explicitly placed, because the drops surface
  // is painted into the same grid cells behind the cards — auto-placed items
  // would flow around those cells instead of over them.
  const place = (index: number): CSSProperties => ({
    gridColumn: (index % cols) + 1,
    gridRow: Math.floor(index / cols) + 1,
    zIndex: 1,
  });
  // Trays tint the drop cells, which the group split keeps contiguous at the
  // front; per-row keys survive a full row becoming the remainder row, so the
  // span change animates instead of remounting.
  const trays: { col: string; row: number; key: string }[] = [];
  if (merged) {
    const fullDropRows = Math.floor(drops.length / cols);
    const dropRemainder = drops.length % cols;
    for (let row = 0; row < fullDropRows; row++) trays.push({ col: '1 / -1', row: row + 1, key: `tray-${row}` });
    if (dropRemainder > 0) {
      trays.push({ col: `1 / ${dropRemainder + 1}`, row: fullDropRows + 1, key: `tray-${fullDropRows}` });
    }
  }

  return (
    <div className="mb-12">
      <h2 className="mb-6 text-xl font-bold tracking-tight text-fg flex items-center gap-3">
        <span className="relative flex h-4 w-4" aria-hidden="true">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-accent-500"></span>
        </span>
        Today's Drops
        {merged && deckRemaining > 0 && (
          <span className="ml-auto text-caption font-normal tracking-normal text-fg-faint">
            +{deckRemaining} more in the deck
          </span>
        )}
      </h2>

      {/* relative: popLayout absolutely positions exiting cells against this grid. */}
      <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <AnimatePresence mode="popLayout">
          {dropSlots.map((slot, i) => {
            const drop = dropByKey.get(slot.key)!;
            const cell = resolveCell(`d${slot.slotId}`, i);
            return (
              <SwipeCell
                key={cell.key}
                cellKey={cell.key}
                portalEnter={cell.portalEnter}
                occupantKey={slot.key}
                style={merged ? place(i) : undefined}
              >
                <CheckInItem
                  drop={drop}
                  vibe={vibes.get(drop.anime.id, drop.episode)}
                  celebration={celebrations[drop.anime.id] ?? arrivalCelebrations[drop.anime.id]}
                  arriving={(celebrations[drop.anime.id] ?? arrivalCelebrations[drop.anime.id])?.arrived === true}
                  onRate={handleRate}
                  onCelebrationEnd={endCelebration}
                  onAdoptChoice={handleAdoptChoice}
                  onSkip={handleSkip}
                  onAnimeSelect={onAnimeSelect}
                />
              </SwipeCell>
            );
          })}
          {fillerSlots.map((slot, j) => {
            const cell = resolveCell(`u${slot.slotId}`, dropSlots.length + j);
            return (
              <SwipeCell
                key={cell.key}
                cellKey={cell.key}
                portalEnter={cell.portalEnter}
                occupantKey={slot.key}
                style={place(dropSlots.length + j)}
              >
                <UpNextCard
                  candidate={fillerByKey.get(slot.key)!}
                  onLog={upNext!.onLog}
                  onSkip={upNext!.onSkip}
                  onAnimeSelect={upNext!.onSelect}
                />
              </SwipeCell>
            );
          })}
        </AnimatePresence>
        {trays.map((tray) => (
          <motion.div
            key={tray.key}
            layout
            transition={{ layout: LAYOUT_SWAP }}
            aria-hidden="true"
            className="pointer-events-none rounded-card border border-accent-500/25 bg-gradient-to-b from-accent-500/10 to-accent-500/[0.03] shadow-[inset_0_0_30px_color-mix(in_srgb,var(--color-accent-500)_6%,transparent)]"
            style={{ gridColumn: tray.col, gridRow: tray.row, margin: '-12px', zIndex: 0 }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * File a show under `status` with an undo that puts the library back exactly
 * as it was — including "not in the library at all", which removeFromLibrary
 * can't express without also taking the episode logs with it.
 */
export function adoptWithUndo(showId: number, status: LibraryStatus, title: string): void {
  const previous = useUserData.getState().library[showId];
  useUserData.getState().setStatus(showId, status);
  toast(status === 'watching' ? `Added ${title} to Watching` : `Added ${title} to Planning`, {
    action: {
      label: 'Undo',
      onClick: () =>
        useUserData.setState((s) => {
          const library = { ...s.library };
          if (previous) library[showId] = previous;
          else delete library[showId];
          return { library };
        }),
    },
  });
}

/**
 * Slides the old value up and the new one in from below whenever it changes —
 * the "logged, here's the next one" feedback for numbers that advance in place.
 */
function Ticker({ value }: { value: string | number }) {
  return (
    <span className="relative inline-flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: '105%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-105%', opacity: 0 }}
          transition={SPRING_POP}
          className="inline-block whitespace-nowrap"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** "on Saturday" when the next episode's airing is known, else "next week". */
function whenNext(anime: AnimeMedia, afterEpisode: number): string {
  const next = anime.nextAiringEpisode;
  const now = Math.floor(Date.now() / 1000);
  if (next && next.episode === afterEpisode + 1 && next.airingAt > now) {
    return `on ${new Date(next.airingAt * 1000).toLocaleDateString([], { weekday: 'long' })}`;
  }
  return 'next week';
}

/** What the send-off beat says when a card is about to leave the row. */
function sendOffCopy(drop: Drop, episode: number, choice: AdoptChoice | null): { heading: string; body: string } {
  const title = displayTitle(drop.anime);
  const finale = drop.anime.episodes !== null && episode >= drop.anime.episodes;
  if (choice === 'watching') {
    return finale
      ? { heading: 'In Watching now', body: `That was the finale — ${title} is filed under Watching.` }
      : { heading: 'In Watching now', body: `Episode ${episode + 1} drops here ${whenNext(drop.anime, episode)}.` };
  }
  if (choice !== null) {
    return {
      heading: 'Not in Watching',
      body: `So Episode ${episode + 1} won't drop here. You'll find it in Also Airing when it airs.`,
    };
  }
  if (drop.graduation) return { heading: 'Stack cleared', body: `You're all caught up on ${title}.` };
  if (finale) return { heading: "You're all caught up", body: `That was the finale of ${title}.` };
  return {
    heading: "You're all caught up",
    body: `No more ${title} until Episode ${episode + 1} airs ${whenNext(drop.anime, episode)}. This card steps out now and comes back when it does.`,
  };
}

/** "Season 2" from the title, the same rule the progress pill uses. */
function seasonNumber(anime: AnimeMedia): string | null {
  const match = anime.title.english?.match(/Season (\d+)/i) || anime.title.userPreferred?.match(/Season (\d+)/i);
  return match ? match[1] : null;
}

type Phase = 'stamp' | 'ask' | 'bye';

const CheckInItem = memo(function CheckInItem({
  drop: liveDrop,
  vibe,
  celebration,
  arriving,
  onRate,
  onCelebrationEnd,
  onAdoptChoice,
  onSkip,
  onAnimeSelect,
}: {
  drop: Drop;
  vibe: VibeEntry | undefined;
  celebration: Celebration | undefined;
  /** Just adopted from Also Airing: fly in from that card (shared layout). */
  arriving: boolean;
  onRate: (drop: Drop, episodeNumber: number, score: number | null) => void;
  onCelebrationEnd: (showId: number) => void;
  onAdoptChoice: (drop: Drop, choice: AdoptChoice) => void;
  onSkip: (drop: Drop) => void;
  onAnimeSelect?: (anime: AnimeMedia) => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<Phase | null>(() => (celebration ? 'stamp' : null));
  const [sendOff, setSendOff] = useState<{ heading: string; body: string } | null>(null);

  // A new celebration (a rating just landed) restarts the beats. Keyed by the
  // celebration's own id so rating the next episode mid-swap starts over.
  const celebrationId = celebration?.id;
  useEffect(() => {
    setSendOff(null);
    setPhase(celebrationId === undefined ? null : 'stamp');
  }, [celebrationId]);

  // While the beats play the card keeps showing what was rated — the log is
  // already written, so the live drop has moved on (or gone). Only once the
  // stamp is done does the live drop take over, which is the swipe-replace.
  const drop = celebration && phase !== null ? celebration.frozen : liveDrop;

  const { anime, maxWatched, userAvgScore, episode: todayEp, graduation: isGraduation, premiere, guest } = drop;
  const stackedCount = todayEp - maxWatched;
  const title = displayTitle(anime);
  const hasBanner = !!(anime.bannerImage || anime.trailer?.thumbnail);
  const bgImage = anime.bannerImage || anime.trailer?.thumbnail || anime.coverImage.extraLarge || anime.coverImage.large;
  const studio = anime.studios?.nodes?.[0]?.name || 'Unknown Studio';

  // The absolute when, to complement the relative freshness rail rather than
  // repeat it: bare time if it aired today, weekday-qualified once it didn't.
  const airedDate = new Date(drop.airedAt * 1000);
  const timeStr = airedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = airedDate.toDateString() === new Date().toDateString();
  const whenStr = sameDay ? timeStr : `${airedDate.toLocaleDateString([], { weekday: 'short' })} ${timeStr}`;
  const freshness = dropFreshness(drop.airedAt, Math.floor(Date.now() / 1000));

  const customSite = useUserData((s) => s.uiPrefs.customSource?.name);
  const watchLink = pickWatchLink(anime.externalLinks, customSite);

  const isCaughtUp = maxWatched >= todayEp - 1;
  const nextEp = isCaughtUp ? todayEp : maxWatched + 1;
  const targetEp = nextEp;

  const handleRateAndWatch = (score: number | null) => {
    if (phase !== null) return;
    onRate(liveDrop, targetEp, score);
  };

  const openShow = () => onAnimeSelect?.(anime);

  const season = seasonNumber(anime);
  const seasonText = season ? `Season ${season}` : 'Series';
  const totalEpisodes = anime.episodes ?? '?';
  const premiereLabel = season ? `Season ${season} premiere` : guest ? 'Season premiere' : 'Series premiere';

  const genresStr = anime.genres.slice(0, 3).join(', ');
  const formatStr = anime.format ? anime.format.replace('_', ' ') : '';
  const ratingStr = anime.averageScore ? `Global ${(anime.averageScore / 10).toFixed(1)}` : '';
  const infoLine = [genresStr, formatStr, whenStr, studio, ratingStr].filter(Boolean).join(' • ');

  const ctaLabel = isGraduation
    ? `Start the binge — Episode ${nextEp}`
    : premiere && maxWatched === 0
      ? season
        ? `Start Season ${season} — Episode 1`
        : 'Start watching — Episode 1'
      : watchCta({ episode: nextEp, started: maxWatched > 0, caughtUp: isCaughtUp });

  // Beat sequencing. Stamp → (ask, for a show that isn't in Watching) →
  // send-off if the card is leaving, else straight to the live drop.
  const afterStamp = () => {
    if (!celebration) return;
    if (celebration.frozen.adopt) {
      setPhase('ask');
      return;
    }
    if (celebration.leaving) {
      setSendOff(sendOffCopy(celebration.frozen, celebration.episode, null));
      setPhase('bye');
      return;
    }
    setPhase(null);
    onCelebrationEnd(celebration.frozen.anime.id);
  };
  const chooseAdopt = (choice: AdoptChoice) => {
    if (!celebration) return;
    onAdoptChoice(celebration.frozen, choice);
    setSendOff(sendOffCopy(celebration.frozen, celebration.episode, choice));
    setPhase('bye');
  };
  const afterSendOff = () => {
    if (!celebration) return;
    setPhase(null);
    onCelebrationEnd(celebration.frozen.anime.id);
  };

  const swapTransition = reduced ? { duration: 0 } : { duration: CELEBRATE.swap, ease: EASE_STANDARD };

  const face = (
    <>
      <div className="relative w-full h-48 sm:h-52 bg-hero-drops-bg shrink-0 overflow-hidden rounded-t-card">
        <button
          type="button"
          onClick={openShow}
          aria-label={`Open ${title}`}
          className="absolute inset-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {hasBanner ? (
            <img
              src={bgImage}
              alt={`${title} key art`}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <>
              <span className="absolute inset-0">
                <img src={bgImage} alt="" className="w-full h-full object-cover opacity-40 blur-xl scale-110" />
              </span>
              <img
                src={bgImage}
                alt={`${title} cover`}
                className="relative h-full object-contain py-2 transition-transform duration-500 group-hover:scale-105"
              />
            </>
          )}
          <span
            className={cn(
              'absolute inset-0 pointer-events-none transition-colors',
              isGraduation ? 'bg-success-500/10' : isCaughtUp || premiere ? 'bg-accent-500/10' : 'bg-scrim/20',
            )}
            aria-hidden="true"
          />
          {/* transform-gpu + srgb: the scrim must rasterize as its own layer with
              the plain gradient path, or GPUs draw seam lines through its alpha
              range while the swipe animates the subtree. */}
          <span
            className="absolute -inset-1 top-0 transform-gpu will-change-transform bg-linear-to-t/srgb from-hero-drops-bg via-hero-drops-bg/60 to-transparent pointer-events-none"
            aria-hidden="true"
          />
        </button>

        {/* The premiere band (docs §17): the moment a show starts, said across
            the art where the eye lands first. */}
        {premiere && !isGraduation && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex h-[30px] items-center justify-center gap-2.5 bg-accent-600/90 font-display text-caption font-bold uppercase tracking-[0.22em] text-fg-inverse"
            aria-hidden="true"
          >
            Episode 1 <span className="opacity-60">·</span> {premiereLabel}
          </div>
        )}

        <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-1.5">
          {isGraduation ? (
            <div className="flex items-center gap-1.5 bg-scrim/75 backdrop-blur-md border border-success-400/50 text-success-300 text-caption font-semibold px-2.5 py-1 rounded-full shadow-e2">
              <Layers className="w-3.5 h-3.5 text-success-400" aria-hidden="true" />
              {WATCH_STATE_LABELS['stack-complete']}
            </div>
          ) : premiere ? (
            <div
              className={cn(
                'flex items-center gap-1.5 bg-hero-drops-bg/80 backdrop-blur-md border text-accent-300 text-caption font-semibold px-2.5 py-1 rounded-full shadow-e2',
                guest ? 'border-dashed border-accent-400/60' : 'border-accent-500/30',
              )}
            >
              <Sparkles className="w-3.5 h-3.5 text-accent-400" aria-hidden="true" />
              {guest ? NOT_IN_WATCHING_LABEL : WATCH_STATE_LABELS.premiere}
            </div>
          ) : isCaughtUp ? (
            <div className="flex items-center gap-1.5 bg-hero-drops-bg/80 backdrop-blur-md border border-accent-500/30 text-accent-300 text-caption font-semibold px-2.5 py-1 rounded-full shadow-e2">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent-400" aria-hidden="true" />
              {WATCH_STATE_LABELS['caught-up']}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-hero-drops-bg/80 backdrop-blur-md border border-hero-text-low/40 text-hero-text-mid text-caption font-semibold px-2.5 py-1 rounded-full shadow-e2">
              <Clock className="w-3.5 h-3.5 text-hero-text-mid" aria-hidden="true" />
              {WATCH_STATE_LABELS.behind}
            </div>
          )}

          <VibeChip vibe={vibe} showTitle={title} onOpen={openShow} variant="glass" className="text-caption py-1" />
        </div>

        <LibraryStatusMenu
          showId={anime.id}
          align="end"
          renderTrigger={({ inLibrary }) => (
            <button
              className={cn(
                'absolute top-3 right-3 z-20 w-8 h-8 flex items-center justify-center backdrop-blur-md border rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                inLibrary
                  ? 'bg-accent-600/90 border-accent-500/50 text-fg-inverse'
                  : 'bg-hero-drops-bg/80 border-hero-text-low/40 text-hero-text-mid hover:text-hero-text-hi',
              )}
            >
              <Bookmark className="w-4 h-4" fill={inLibrary ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
          )}
        />
      </div>

      <div className="p-4 sm:p-5 flex flex-col flex-1 z-10">
        <FitTitle
          title={title}
          onClick={openShow}
          className="text-hero-text-hi hover:text-accent-400"
        />
        <CardMetaPills
          progress={
            <>
              {seasonText} • <Ticker value={maxWatched} />/{totalEpisodes} watched
            </>
          }
          userAvgScore={userAvgScore}
        />

        <div className="flex justify-between items-center mb-1 gap-2">
          <div className="text-label text-hero-text-mid line-clamp-1">
            Episode {todayEp}
            {isGraduation && ' — Finale'}
          </div>
          {/* Freshness, not "today": the window is 48h, so a card states its
              own age and how close it is to leaving. The rail drains as the
              window is spent, and the tone crosses to amber — the app's time
              colour (docs §16) — once the episode is a day old. */}
          <div
            className={cn(
              'flex items-center gap-1.5 text-caption sm:text-xs flex-shrink-0',
              freshness.tier === 'leaving'
                ? 'text-warning-300'
                : freshness.tier === 'aging'
                  ? 'text-warning-400'
                  : isGraduation
                    ? 'text-success-300'
                    : 'text-accent-400',
            )}
          >
            <span
              className={cn(
                'h-1 w-7 shrink-0 overflow-hidden rounded-full bg-hero-drops-edge',
                freshness.tier === 'leaving' && 'animate-pulse motion-reduce:animate-none',
              )}
              aria-hidden="true"
            >
              <span
                className={cn(
                  'block h-full rounded-full transition-[width] duration-500',
                  freshness.tier === 'leaving'
                    ? 'bg-warning-400'
                    : freshness.tier === 'aging'
                      ? 'bg-warning-500'
                      : isGraduation
                        ? 'bg-success-400'
                        : 'bg-accent-500',
                )}
                style={{ width: `${Math.max(4, (1 - freshness.spent) * 100)}%` }}
              />
            </span>
            {freshness.label}
          </div>
        </div>

        <div className="text-micro sm:text-caption text-hero-text-low mb-5 line-clamp-1">{infoLine}</div>

        <RatingBlock
          episode={targetEp}
          onRate={handleRateAndWatch}
          label={<Ticker value={`Rate Episode ${isCaughtUp ? todayEp : nextEp}`} />}
          tone={isGraduation ? 'success' : 'accent'}
          hint="Tap a score to rate + mark watched"
          className="mb-5"
        />

        <div className="mt-auto">
          <div className="relative w-full h-[52px] mt-1">
            {isGraduation ? (
              <div className="absolute inset-0 flex items-start gap-2">
                <div className="flex flex-col items-center w-20 -ml-2 shrink-0">
                  <div className="w-5 h-5 rounded-full bg-success-600 flex items-center justify-center z-10 ring-[3px] ring-hero-drops-bg">
                    <Check className="w-3 h-3 text-fg-inverse stroke-[3]" aria-hidden="true" />
                  </div>
                  <div className="text-micro text-hero-text-mid mt-1.5 text-center leading-tight">
                    Watched through
                    <br />
                    Ep. <Ticker value={maxWatched} />
                  </div>
                </div>

                {/* The runway: one pip per stacked episode, the finale as the
                    star node — the binge answer to the behind card's
                    "N episodes to go". */}
                <div className="flex flex-1 min-w-0 flex-col items-center gap-1.5 pt-[7px]">
                  <div className="flex w-full gap-[3px]" aria-hidden="true">
                    {Array.from({ length: Math.max(0, stackedCount - 1) }, (_, i) => (
                      <span
                        key={i}
                        className="h-[9px] flex-1 rounded-[3px] border border-success-400/40 bg-success-500/20"
                      />
                    ))}
                  </div>
                  <div className="rounded-full border border-success-500/30 bg-hero-drops-bg px-2 py-0.5 text-micro text-success-300 whitespace-nowrap">
                    <Ticker value={stackedCount} /> episode{stackedCount === 1 ? '' : 's'} ready · zero waits
                  </div>
                </div>

                <div className="flex flex-col items-center w-20 -mr-2 shrink-0">
                  <div className="w-5 h-5 rounded-full border-2 border-success-400 bg-hero-drops-bg flex items-center justify-center z-10 ring-[3px] ring-hero-drops-bg">
                    <Star className="w-2.5 h-2.5 text-success-400 fill-current" aria-hidden="true" />
                  </div>
                  <div className="text-micro text-hero-text-mid mt-1.5 text-center leading-tight font-medium">
                    Finale: Ep. {todayEp}
                  </div>
                </div>
              </div>
            ) : premiere && maxWatched === 0 ? (
              // The premiere timeline: the whole season still ahead, from a
              // glowing first node to the finale.
              <div className="absolute inset-0">
                <div
                  className="absolute top-2.5 left-4 right-4 border-t-2 border-dashed border-accent-500/45"
                  aria-hidden="true"
                />
                <div className="absolute inset-0 flex justify-between items-start">
                  <div className="flex flex-col items-center w-24 -ml-4">
                    <div className="w-5 h-5 rounded-full bg-accent-600 z-10 ring-[3px] ring-hero-drops-bg shadow-glow-lg" />
                    <div className="text-micro text-accent-300 mt-1.5 text-center leading-tight font-semibold">
                      {sameDay ? 'Starts today' : `Started ${airedDate.toLocaleDateString([], { weekday: 'short' })}`}
                    </div>
                  </div>
                  <div className="flex flex-col items-center w-20 -mr-2">
                    <div className="w-5 h-5 rounded-full border-2 border-hero-text-low/60 bg-hero-drops-bg z-10 ring-[3px] ring-hero-drops-bg" />
                    <div className="text-micro text-hero-text-mid mt-1.5 text-center leading-tight">
                      {anime.episodes ? `Finale: Ep. ${anime.episodes}` : 'Weekly'}
                    </div>
                  </div>
                </div>
              </div>
            ) : isCaughtUp ? (
              <div className="absolute inset-0">
                <div className="absolute top-2.5 left-4 right-4 h-[3px] bg-accent-600 rounded-full" aria-hidden="true" />
                <div className="absolute inset-0 flex justify-between items-start">
                  <div className="flex flex-col items-center w-24 -ml-4">
                    <div className="w-5 h-5 rounded-full bg-accent-600 flex items-center justify-center z-10 ring-[3px] ring-hero-drops-bg">
                      <Check className="w-3 h-3 text-fg-inverse stroke-[3]" aria-hidden="true" />
                    </div>
                    <div className="text-micro text-hero-text-mid mt-1.5 text-center leading-tight">
                      Caught up through
                      <br />
                      Ep. {Math.max(0, todayEp - 1)}
                    </div>
                  </div>

                  <div className="flex flex-col items-center w-20 -mr-2">
                    <div className="w-5 h-5 rounded-full border-2 border-accent-500 bg-hero-drops-bg flex items-center justify-center z-10 ring-[3px] ring-hero-drops-bg">
                      <Star className="w-2.5 h-2.5 text-accent-400 fill-current" aria-hidden="true" />
                    </div>
                    <div className="text-micro text-hero-text-mid mt-1.5 text-center leading-tight">Latest: Ep. {todayEp}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0">
                <div className="absolute top-2.5 left-4 right-4 flex items-center" aria-hidden="true">
                  <div className="h-[3px] bg-accent-600 rounded-full w-[45%]" />
                  <div className="h-[3px] border-t-2 border-dashed border-hero-text-low/60 flex-1 ml-1" />
                </div>

                <div className="absolute inset-0 flex justify-between items-start">
                  <div className="flex flex-col items-center w-24 -ml-4">
                    <div className="w-5 h-5 rounded-full bg-accent-600 flex items-center justify-center z-10 ring-[3px] ring-hero-drops-bg">
                      <Check className="w-3 h-3 text-fg-inverse stroke-[3]" aria-hidden="true" />
                    </div>
                    <div className="text-micro text-hero-text-mid mt-1.5 text-center leading-tight">
                      Watched through
                      <br />
                      Ep. <Ticker value={maxWatched} />
                    </div>
                  </div>

                  <div className="flex flex-col items-center w-20 absolute left-[45%] -translate-x-1/2">
                    <div className="w-5 h-5 rounded-full border-2 border-accent-500 bg-hero-drops-bg flex items-center justify-center z-10 ring-[3px] ring-hero-drops-bg">
                      <div className="w-2 h-2 rounded-full bg-accent-400" aria-hidden="true" />
                    </div>
                    <div className="text-micro text-hero-text-mid mt-1.5 text-center leading-tight font-medium">
                      Next: Ep. <Ticker value={nextEp} />
                    </div>
                  </div>

                  <div className="flex flex-col items-center w-20 -mr-2">
                    <div className="w-5 h-5 rounded-full border-2 border-hero-text-low/60 bg-hero-drops-bg flex items-center justify-center z-10 ring-[3px] ring-hero-drops-bg">
                      <Star className="w-2.5 h-2.5 text-hero-text-low fill-current" aria-hidden="true" />
                    </div>
                    <div className="text-micro text-hero-text-mid mt-1.5 text-center leading-tight">Latest: Ep. {todayEp}</div>
                  </div>
                </div>

                <div className="absolute top-[16px] left-[72.5%] transform -translate-x-1/2 -translate-y-1/2 border border-hero-drops-edge bg-hero-drops-bg rounded-full px-2 py-0.5 text-micro text-hero-text-mid whitespace-nowrap z-10 shadow-e1">
                  <Ticker value={todayEp - nextEp} /> episodes to go
                </div>
              </div>
            )}
          </div>

          {watchLink ? (
            <a
              href={watchLink}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'w-full h-11 sm:h-12 flex items-center justify-center gap-2 rounded-inner font-medium text-sm sm:text-base transition-all mt-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isGraduation
                  ? 'bg-success-600 text-fg-inverse hover:bg-success-500'
                  : premiere
                    ? 'bg-accent-600 text-fg-inverse hover:bg-accent-500 shadow-glow hover:shadow-glow-lg'
                    : 'bg-hero-drops-bg border border-accent-600 text-accent-400 hover:bg-accent-600 hover:text-fg-inverse shadow-glow hover:shadow-glow-lg',
              )}
            >
              <Play className="w-4 h-4 fill-current" aria-hidden="true" />
              <Ticker value={ctaLabel} />
            </a>
          ) : (
            <p className="w-full h-11 sm:h-12 flex items-center justify-center gap-2 rounded-inner font-medium text-sm sm:text-base mt-6 bg-hero-drops-edge text-hero-text-mid">
              No stream linked
            </p>
          )}

          <button
            type="button"
            onClick={() => onSkip(liveDrop)}
            aria-label={
              // Leads with the visible label so voice control can match it
              // (WCAG 2.5.3 Label in Name).
              isGraduation
                ? `Binge later — save ${title} for the deck`
                : guest
                  ? `Not this season — hide ${title}`
                  : `Skip this week — hide ${title} until the next episode`
            }
            className="relative mt-2 flex h-8 w-full items-center justify-center rounded-field text-caption font-medium text-hero-text-low transition-colors hover:bg-hero-drops-well hover:text-hero-text-mid focus:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
          >
            {isGraduation ? 'Binge later →' : guest ? 'Not this season →' : 'Skip this week →'}
          </button>
        </div>
      </div>
    </>
  );

  // The face is keyed by the episode on offer, so logging one swipes the
  // old face out and the next episode's face in — the swipe-replace beat.
  const faceKey = `${todayEp}-${targetEp}`;

  const card = (
    <motion.div
      layoutId={arriving ? adoptLayoutId(anime.id) : undefined}
      transition={{ layout: reduced ? { duration: 0 } : { duration: DUR.portal, ease: EASE_STANDARD } }}
      className={cn(
        'relative flex flex-col overflow-hidden rounded-card bg-hero-drops-bg shadow-e3 h-full group border transition-all',
        isGraduation
          ? 'border-success-500/40 shadow-glow-success'
          : guest
            ? 'border-[1.5px] border-dashed border-accent-500/60'
            : premiere
              ? 'border-accent-500/55 shadow-glow-lg'
              : isCaughtUp
                ? 'border-accent-500/40 shadow-glow-lg'
                : 'border-hero-drops-edge',
      )}
      style={
        phase === 'stamp' && celebration && celebrationTier(celebration.score) === 3 && !reduced
          ? { animation: `stamp-thump 0.45s ease 0.3s both` }
          : undefined
      }
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={faceKey}
          className="flex h-full w-full flex-col"
          initial={{ x: '100%', opacity: 0.4 }}
          animate={{ x: 0, opacity: 1, rotate: 0 }}
          exit={{ x: '-112%', opacity: 0, rotate: -4 }}
          transition={swapTransition}
        >
          {face}
        </motion.div>
      </AnimatePresence>

      {/* Beats. A transparent shield swallows taps while the stamp plays, so a
          double tap can't log the next episode under the celebration. */}
      {phase === 'stamp' && celebration && (
        <>
          <div className="absolute inset-0 z-20" aria-hidden="true" />
          <RatedStamp score={celebration.score} episode={celebration.episode} onDone={afterStamp} />
        </>
      )}
      {phase === 'ask' && celebration && (
        <AdoptAsk
          drop={celebration.frozen}
          score={celebration.score}
          episode={celebration.episode}
          onChoose={chooseAdopt}
        />
      )}
      {phase === 'bye' && sendOff && <SendOffBeat heading={sendOff.heading} body={sendOff.body} onDone={afterSendOff} />}
    </motion.div>
  );

  if (!isGraduation) return card;

  // The graduation card sits on a literal pile of card edges — the stacked
  // episodes underneath it. The edges overflow into the grid gap so the card
  // itself stays exactly drop-card sized; SwipeCell only clips during an
  // active swap, so they render whenever the card is at rest.
  return (
    <div className="relative isolate h-full">
      {card}
      <div
        aria-hidden="true"
        className="absolute inset-x-[13px] -bottom-[11px] -z-10 h-6 rounded-b-[14px] border border-t-0 border-success-500/50 bg-hero-drops-pile-1 shadow-e2"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-[28px] -bottom-[22px] -z-20 h-6 rounded-b-[14px] border border-t-0 border-success-500/25 bg-hero-drops-pile-2"
      />
    </div>
  );
});

/**
 * "Add it to Watching?" — asked after rating a premiere of a show that isn't
 * in Watching (Plan to Watch, or a guest season). The rating is already
 * logged whatever the answer; this only decides where the show lives.
 */
function AdoptAsk({
  drop,
  score,
  episode,
  onChoose,
}: {
  drop: Drop;
  score: number | null;
  episode: number;
  onChoose: (choice: AdoptChoice) => void;
}) {
  const title = displayTitle(drop.anime);
  const season = seasonNumber(drop.anime);
  const subject = drop.guest && season ? `Season ${season}` : title;
  return (
    <div
      role="dialog"
      aria-label={`Add ${subject} to Watching?`}
      className="absolute inset-0 z-30 flex flex-col justify-center gap-4 rounded-[inherit] bg-hero-drops-bg/95 p-8"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 -rotate-6 items-center justify-center rounded-inner bg-accent-600 font-display text-3xl font-bold text-fg-inverse">
          {score === null ? <Check className="h-7 w-7" strokeWidth={3} aria-hidden="true" /> : score}
        </span>
        <div>
          <div className="text-label font-semibold text-accent-300">Episode {episode} logged</div>
          <div className="text-caption text-hero-text-low">Saved whatever you choose</div>
        </div>
      </div>
      <h3 className="font-display text-xl font-bold leading-snug text-hero-text-hi">Add {subject} to Watching?</h3>
      <p className="text-sm leading-relaxed text-hero-text-mid">
        Then Episode {episode + 1} lands in Today's Drops {whenNext(drop.anime, episode)}.
      </p>
      <button
        type="button"
        onClick={() => onChoose('watching')}
        className="h-12 rounded-inner bg-accent-600 font-semibold text-fg-inverse shadow-glow transition-colors hover:bg-accent-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Yes, add to Watching
      </button>
      {drop.guest ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChoose('plan')}
            className="h-11 flex-1 rounded-field border border-hero-drops-edge bg-hero-drops-well text-sm font-medium text-hero-text-hi transition-colors hover:bg-hero-drops-well-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Plan to Watch
          </button>
          <button
            type="button"
            onClick={() => onChoose('keep')}
            className="h-11 flex-1 rounded-field border border-hero-drops-edge bg-hero-drops-well text-sm font-medium text-hero-text-mid transition-colors hover:bg-hero-drops-well-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Still deciding
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onChoose('keep')}
          className="h-11 rounded-field border border-hero-drops-edge bg-hero-drops-well text-sm font-medium text-hero-text-mid transition-colors hover:bg-hero-drops-well-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Not now — keep it in Planning
        </button>
      )}
    </div>
  );
}
