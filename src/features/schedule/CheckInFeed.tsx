import { Bookmark, Check, CheckCircle2, Clock, Info, Layers, Play, Star, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { toast } from 'sonner';
import { LibraryStatusMenu } from '../../components/LibraryStatusMenu';
import { LowScoreButtons } from "../../components/LowScoreButtons";
import { SwipeCell, portalExitCell, useSwapSlots } from '../../components/SwipeCell';
import { UpNextCard } from '../../components/UpNextDeck';
import { VibeChip } from '../../components/VibeChip';
import type { UpNextCandidate } from '../../lib/upNext';
import { latestAiredEpisode } from '../../lib/aired';
import { DROP_WINDOW_SEC, PIN_GRACE_SEC, dropFreshness } from '../../lib/freshness';
import { LAYOUT_SWAP, SPRING_POP } from '../../lib/motion';
import { displayTitle } from '../../lib/displayTitle';
import { WATCH_STATE_LABELS } from '../../lib/status';
import { cn } from '../../lib/utils';
import type { VibeEntry } from '../../lib/vibesFile';
import { pickWatchLink } from '../../lib/watchLinks';
import { watchCta } from '../../lib/watchCta';
import { useVibesIndex } from '../../queries/vibes';
import { useUserData } from '../../stores/userData';
import { AnimeMedia, DropSkip, EpisodeLog } from '../../types';

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
  logs: EpisodeLog[];
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onAnimeSelect?: (anime: AnimeMedia) => void;
  upNext?: CheckInFeedUpNext;
}

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
}

/** The quick row; everything below 5 lives behind the LowScoreButtons expander. */
const QUICK_SCORES = [5, 6, 7, 8, 9, 10];

/**
 * Stable empty default for the stacking prop — an inline `= []` would be a
 * fresh identity every render and make the drops memo recompute each time,
 * reading a fresh clock and defeating the admission-pin design.
 */
const NO_STACKING: number[] = [];

/** Same stable-identity rule for the skips argument. */
const NO_SKIPS: Record<number, DropSkip> = {};

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
): Drop[] {
  const recent: Drop[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (const anime of animeList) {
    const isStacking = stacking.includes(anime.id);
    if (!favorites.includes(anime.id) && !isStacking) continue;

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
    // A stacking show only ever drops for its finale — the graduation moment.
    // Exact signal only: the estimated branch can fabricate a finale when an
    // episode count is wrong (pins were admitted on an exact signal already).
    if (
      isStacking &&
      !(anime.episodes !== null && episodeNum >= anime.episodes && (latest === null || !latest.estimated))
    )
      continue;

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
      graduation: isStacking,
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
): boolean {
  const isStacking = stacking.includes(anime.id);
  if (!favorites.includes(anime.id) && !isStacking) return false;
  const latest = latestAiredEpisode(anime, nowSec);
  if (latest === null) return false;
  // A skipped episode is deck material by design — without this, the show
  // would vanish from both surfaces for the rest of the drop window.
  if (skips[anime.id]?.episode === latest.episode) return false;
  if (isStacking && !(anime.episodes !== null && latest.episode >= anime.episodes && !latest.estimated)) {
    return false;
  }
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
  logs,
  onLog,
  onAnimeSelect,
  upNext,
}: CheckInFeedProps) {
  const vibes = useVibesIndex();
  const cols = useGridColumns();
  const dropSkips = useUserData((s) => s.dropSkips);

  const drops = useMemo(
    () => computeDrops(animeList, favorites, logs, stacking, dropSkips),
    [animeList, favorites, logs, stacking, dropSkips],
  );

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
        (c) => !dropIds.has(c.anime.id) && !wouldBeDrop(c.anime, favorites, logs, nowSec, stacking, dropSkips),
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
                  onLog={handleLog}
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

const CheckInItem = memo(function CheckInItem({
  drop,
  vibe,
  onLog,
  onSkip,
  onAnimeSelect,
}: {
  drop: Drop;
  vibe: VibeEntry | undefined;
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onSkip: (drop: Drop) => void;
  onAnimeSelect?: (anime: AnimeMedia) => void;
}) {
  const { anime, maxWatched, userAvgScore, episode: todayEp, graduation: isGraduation } = drop;
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
    onLog(anime.id, targetEp, score);
  };

  const openShow = () => onAnimeSelect?.(anime);

  const seasonMatch = anime.title.english?.match(/Season (\d+)/i) || anime.title.userPreferred?.match(/Season (\d+)/i);
  const seasonText = seasonMatch ? `Season ${seasonMatch[1]}` : 'Series';
  const totalEpisodes = anime.episodes ?? '?';

  const genresStr = anime.genres.slice(0, 3).join(', ');
  const formatStr = anime.format ? anime.format.replace('_', ' ') : '';
  const ratingStr = anime.averageScore ? `Global ${(anime.averageScore / 10).toFixed(1)}` : '';
  const infoLine = [genresStr, formatStr, whenStr, studio, ratingStr].filter(Boolean).join(' • ');

  const card = (
    <div
      className={cn(
        'flex flex-col rounded-card bg-hero-drops-bg shadow-e3 h-full group border transition-all',
        isGraduation
          ? 'border-success-500/40 shadow-glow-success'
          : isCaughtUp
            ? 'border-accent-500/40 shadow-glow-lg'
            : 'border-hero-drops-edge',
      )}
    >
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
              isGraduation ? 'bg-success-500/10' : isCaughtUp ? 'bg-accent-500/10' : 'bg-scrim/20',
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

        <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-1.5">
          {isGraduation ? (
            <div className="flex items-center gap-1.5 bg-scrim/75 backdrop-blur-md border border-success-400/50 text-success-300 text-caption font-semibold px-2.5 py-1 rounded-full shadow-e2">
              <Layers className="w-3.5 h-3.5 text-success-400" aria-hidden="true" />
              {WATCH_STATE_LABELS['stack-complete']}
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
        <div className="flex justify-between items-start mb-1 gap-2">
          <h3 className="min-w-0 flex-1">
            <button
              type="button"
              onClick={openShow}
              className="block max-w-full text-left text-lg sm:text-xl font-bold text-hero-text-hi leading-tight line-clamp-1 hover:text-accent-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {title}
            </button>
          </h3>
          <div className="flex gap-1.5 mt-1 flex-col items-end sm:flex-row sm:items-center">
            <div className="text-caption text-hero-text-mid whitespace-nowrap flex-shrink-0 border border-hero-drops-edge bg-hero-drops-well px-2 py-0.5 rounded-full">
              {seasonText} • <Ticker value={maxWatched} />/{totalEpisodes} watched
            </div>
            {userAvgScore !== null && (
              <div className="text-caption font-semibold text-accent-300 whitespace-nowrap flex-shrink-0 border border-accent-500/30 bg-hero-drops-accent-well px-2 py-0.5 rounded-full flex items-center gap-1 shadow-glow-sm">
                <Star className="w-3 h-3 fill-accent-400 text-accent-400" aria-hidden="true" />
                Your Avg {userAvgScore.toFixed(1)}
              </div>
            )}
          </div>
        </div>

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

        <div className="border border-hero-drops-edge rounded-inner p-4 bg-hero-drops-deep flex flex-col items-center mb-5 relative">
          <div
            className={cn(
              'absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent to-transparent',
              isGraduation ? 'via-success-500/20' : 'via-accent-500/20',
            )}
            aria-hidden="true"
          />

          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-accent-500 fill-accent-500" aria-hidden="true" />
            <span className="text-sm text-hero-text-hi font-medium">
              <Ticker value={`Rate Episode ${isCaughtUp ? todayEp : nextEp}`} />
            </span>
          </div>

          <div
            role="group"
            aria-label={`Rate episode ${targetEp}, 5 to 10`}
            className="flex gap-2 w-full justify-between mb-4 px-1"
          >
            {QUICK_SCORES.map((s) => (
              <motion.button
                key={s}
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={() => handleRateAndWatch(s)}
                aria-label={`Rate episode ${targetEp} a ${s} and mark watched`}
                className={cn(
                  'flex-1 h-11 sm:h-[46px] bg-hero-drops-bg text-hero-text-hi border border-hero-drops-edge rounded-field text-base sm:text-lg font-medium hover:text-fg-inverse transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isGraduation
                    ? 'hover:bg-success-600 hover:border-success-500 hover:shadow-glow-success'
                    : 'hover:bg-accent-600 hover:border-accent-500 hover:shadow-glow',
                )}
              >
                {s}
              </motion.button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => handleRateAndWatch(null)}
              aria-label={`Mark episode ${targetEp} watched without a score`}
              className="relative flex items-center gap-1.5 px-3 py-1 rounded-full border border-hero-drops-edge bg-hero-drops-well text-micro sm:text-caption text-hero-text-mid hover:bg-hero-drops-well-hover hover:text-hero-text-hi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
            >
              Mark watched only <Info className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <LowScoreButtons
              episode={targetEp}
              onSelect={(score) => handleRateAndWatch(score)}
              triggerClassName="px-3 py-1 rounded-full border border-hero-drops-edge bg-hero-drops-well text-micro sm:text-caption text-hero-text-mid hover:bg-hero-drops-well-hover hover:text-hero-text-hi after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
              buttonClassName="h-7 min-w-7 px-1.5 rounded-xs border border-hero-drops-edge bg-hero-drops-well text-caption text-hero-text-mid hover:bg-hero-drops-well-hover hover:text-hero-text-hi"
            />
          </div>

          <div className="text-micro sm:text-caption text-hero-text-low">Tap a score to rate + mark watched</div>
        </div>

        <div className="mt-auto">
          <div className="relative w-full h-[52px] mt-1">
            <AnimatePresence initial={false}>
              {isGraduation ? (
                <motion.div
                  key="graduation"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="absolute inset-0 flex items-start gap-2"
                >
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
                </motion.div>
              ) : isCaughtUp ? (
                <motion.div
                  key="caught-up"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="absolute inset-0"
                >
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
                </motion.div>
              ) : (
                <motion.div
                  key="behind"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="absolute inset-0"
                >
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
                </motion.div>
              )}
            </AnimatePresence>
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
                  : 'bg-hero-drops-bg border border-accent-600 text-accent-400 hover:bg-accent-600 hover:text-fg-inverse shadow-glow hover:shadow-glow-lg',
              )}
            >
              <Play className="w-4 h-4 fill-current" aria-hidden="true" />
              <Ticker
                value={
                  isGraduation
                    ? `Start the binge — Episode ${nextEp}`
                    : watchCta({ episode: nextEp, started: maxWatched > 0, caughtUp: isCaughtUp })
                }
              />
            </a>
          ) : (
            <p className="w-full h-11 sm:h-12 flex items-center justify-center gap-2 rounded-inner font-medium text-sm sm:text-base mt-6 bg-hero-drops-edge text-hero-text-mid">
              No stream linked
            </p>
          )}

          <button
            type="button"
            onClick={() => onSkip(drop)}
            aria-label={
              // Leads with the visible label so voice control can match it
              // (WCAG 2.5.3 Label in Name).
              isGraduation
                ? `Binge later — save ${title} for the deck`
                : `Skip this week — hide ${title} until the next episode`
            }
            className="relative mt-2 flex h-8 w-full items-center justify-center rounded-field text-caption font-medium text-hero-text-low transition-colors hover:bg-hero-drops-well hover:text-hero-text-mid focus:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
          >
            {isGraduation ? 'Binge later →' : 'Skip this week →'}
          </button>
        </div>
      </div>
    </div>
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
