import { Check, Layers, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useEffect, useRef, useState } from 'react';
import type { AlsoAiringEntry, Pulse, PulseBar, Tone } from '../lib/alsoAiring';
import { displayTitle } from '../lib/displayTitle';
import { DUR, EASE_STANDARD } from '../lib/motion';
import { cn } from '../lib/utils';
import { pickWatchLink } from '../lib/watchLinks';
import { useUserData } from '../stores/userData';
import type { AnimeMedia } from '../types';
import { FitTitle } from './FitTitle';
import { RatedStamp, SendOffBeat } from './RatedStamp';

/** Fixed card footprint — the Also Airing pager does its offset math off these. */
/**
 * The shared-layout id that carries a card from Also Airing up into Today's
 * Drops when it's adopted. Set on the Also Airing card only while its "Add to
 * Watching?" question is open, and on the drop card only while it's arriving,
 * so no other re-layout of either row ever animates between them.
 */
export const adoptLayoutId = (showId: number) => `adopt-${showId}`;

export const ALSO_AIRING_CARD_WIDTH = 300;
export const ALSO_AIRING_CARD_WIDTH_NARROW = 264;
export const ALSO_AIRING_CARD_HEIGHT = 364;

const DAY_SEC = 86_400;
const SCORES = [5, 6, 7, 8, 9, 10] as const;
/** Stacking pips shown at most, ending one past the latest aired episode. */
const STACK_PIPS = 8;

/**
 * Card-local flow state that has to outlive the card. The row re-sorts and the
 * schedule route unmounts on every hop, but "I pressed Watch on Episode 3" is
 * a promise to come back and rate it — so the armed episode lives here, keyed
 * by show, not in component state.
 */
const armedRatings = new Map<number, number>();
/** A logged rating whose "Add to Watching?" question is still open (or answered "Not now"). */
const openAsks = new Map<number, { episode: number; score: number | null; phase: 'ask' | 'declined' }>();
/** `${showId}:${episode}` — "Still deciding" answered for that rating; never asked again. */
const stillDeciding = new Set<string>();

/** Test hook: forget every armed rating and open question. */
export function resetArmedRatings(): void {
  armedRatings.clear();
  openAsks.clear();
  stillDeciding.clear();
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'rate'; episode: number }
  | { kind: 'ask'; episode: number; score: number | null }
  | { kind: 'declined'; episode: number; score: number | null }
  | { kind: 'stamp'; episode: number; score: number | null }
  | { kind: 'sendoff'; episode: number; score: number | null };

function restorePhase(showId: number): Phase {
  const ask = openAsks.get(showId);
  if (ask && !stillDeciding.has(`${showId}:${ask.episode}`)) {
    return { kind: ask.phase, episode: ask.episode, score: ask.score };
  }
  const armed = armedRatings.get(showId);
  return armed !== undefined ? { kind: 'rate', episode: armed } : { kind: 'idle' };
}

const TONE: Record<Tone, { label: string; text: string; bar: string; dot: string; height: string }> = {
  positive: { label: 'Loved it', text: 'text-sent-positive-fg', bar: 'bg-sent-positive', dot: 'bg-sent-positive', height: 'h-[30px]' },
  mixed: { label: 'Mixed', text: 'text-sent-mixed-fg', bar: 'bg-sent-mixed', dot: 'bg-sent-mixed', height: 'h-[18px]' },
  negative: { label: 'Rough', text: 'text-sent-negative-fg', bar: 'bg-sent-negative', dot: 'bg-sent-negative', height: 'h-2' },
};

const ASPECT_MARK: Record<Tone, string> = { positive: '↑', mixed: '–', negative: '↓' };

function clockTime(sec: number): string {
  return new Date(sec * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Bare time today, weekday-qualified otherwise — the drop card's convention. */
function airTime(sec: number): string {
  const date = new Date(sec * 1000);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? clockTime(sec) : `${date.toLocaleDateString([], { weekday: 'short' })} ${clockTime(sec)}`;
}

function span(seconds: number): string {
  const minutes = Math.max(1, Math.floor(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

/** "today", "tomorrow", "on Saturday", "next Saturday" — reads after "airs" / "drops". */
function whenPhrase(sec: number): string {
  const target = new Date(sec * 1000);
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(target) - startOf(today)) / (DAY_SEC * 1000));
  const weekday = target.toLocaleDateString([], { weekday: 'long' });
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return days < 7 ? `on ${weekday}` : `next ${weekday}`;
}

function compactCount(value: number): string {
  if (value < 1000) return String(value);
  const thousands = value / 1000;
  return `${thousands < 10 ? thousands.toFixed(1) : Math.round(thousands)}k`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** When episode `n` airs: the schedule's own answer if it has one, else a weekly estimate. */
function airingOf(entry: AlsoAiringEntry, n: number): number {
  const next = entry.anime.nextAiringEpisode;
  if (next && next.episode === n) return next.airingAt;
  if (n === entry.episode) return entry.airingAt;
  return entry.airingAt + (n - entry.episode) * 7 * DAY_SEC;
}

const BTN =
  'flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-control border px-2 text-label font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const BTN_WATCH = cn(BTN, 'border-accent-600/70 bg-hero-drops-bg text-accent-400 hover:bg-accent-600 hover:text-fg-inverse');
const BTN_QUIET = cn(BTN, 'border-hero-drops-edge bg-hero-drops-well text-hero-text-hi hover:bg-hero-drops-well-hover');
const BTN_SOLID = cn(BTN, 'border-accent-600 bg-accent-600 text-fg-inverse hover:bg-accent-500');
const CHIP =
  'inline-flex max-w-full items-center gap-1.5 truncate rounded-full border bg-hero-drops-bg/85 px-2.5 py-1 text-caption font-semibold backdrop-blur-md shadow-e2';

export interface AlsoAiringCardProps {
  entry: AlsoAiringEntry;
  pulse: Pulse;
  onOpen: (anime: AnimeMedia) => void;
  onLog: (showId: number, episode: number, score: number | null) => void;
  onAdopt: (entry: AlsoAiringEntry, rated: { episode: number; score: number | null }) => void;
  onPlan: (entry: AlsoAiringEntry) => void;
}

/**
 * One card in the Also Airing row: a thin banner, then the show's reception
 * chart as the main thing ("Pulse first").
 *
 * A discover or dropped card is a rate-to-adopt funnel. Watch opens the
 * stream and arms the card; coming back to it asks how the episode was, logs
 * the answer on the spot, then asks whether the show belongs in Watching. The
 * log is written before the question, so declining never loses the rating.
 * Undo toasts and the fly-up into Today's Drops are the parent's job.
 */
export const AlsoAiringCard = memo(function AlsoAiringCard({
  entry,
  pulse,
  onOpen,
  onLog,
  onAdopt,
  onPlan,
}: AlsoAiringCardProps) {
  const { anime, kind, status, episode, airingAt, aired, maxWatched, firstUnwatched, stackWaiting, lastRating } = entry;
  const title = displayTitle(anime);
  const customSite = useUserData((s) => s.uiPrefs.customSource?.name);
  const watchLink = pickWatchLink(anime.externalLinks, customSite);
  const latestAired = aired ? episode : episode - 1;
  const nowSec = Math.floor(Date.now() / 1000);

  const [phase, setPhaseState] = useState<Phase>(() => restorePhase(anime.id));
  const overlayRef = useRef<HTMLDivElement>(null);
  const interacted = useRef(false);

  // The adopt call must happen exactly once, even if the row drops the card
  // mid-celebration (the parent may re-filter it out on the log itself).
  const adoptPending = useRef<{ episode: number; score: number | null } | null>(null);
  const adopted = useRef(false);
  const latest = useRef({ entry, onAdopt });
  latest.current = { entry, onAdopt };

  const finishAdopt = () => {
    const rated = adoptPending.current;
    if (!rated || adopted.current) return;
    adopted.current = true;
    adoptPending.current = null;
    latest.current.onAdopt(latest.current.entry, rated);
  };

  useEffect(
    () => () => {
      if (adoptPending.current && !adopted.current) {
        adopted.current = true;
        latest.current.onAdopt(latest.current.entry, adoptPending.current);
      }
    },
    [],
  );

  const setPhase = (next: Phase) => {
    interacted.current = true;
    setPhaseState(next);
  };

  // Focus follows the flow once the user is driving it (never on a restore).
  useEffect(() => {
    if (interacted.current && (phase.kind === 'rate' || phase.kind === 'ask')) overlayRef.current?.focus();
  }, [phase.kind]);

  const arm = () => {
    armedRatings.set(anime.id, firstUnwatched);
    setPhase({ kind: 'rate', episode: firstUnwatched });
  };

  const disarm = () => {
    armedRatings.delete(anime.id);
    setPhase({ kind: 'idle' });
  };

  const pick = (n: number, score: number | null) => {
    onLog(anime.id, n, score);
    armedRatings.delete(anime.id);
    openAsks.set(anime.id, { episode: n, score, phase: 'ask' });
    setPhase({ kind: 'ask', episode: n, score });
  };

  const yes = (n: number, score: number | null) => {
    openAsks.delete(anime.id);
    adoptPending.current = { episode: n, score };
    adopted.current = false;
    if (latestAired > n) {
      finishAdopt();
      setPhase({ kind: 'idle' });
    } else {
      setPhase({ kind: 'stamp', episode: n, score });
    }
  };

  const notNow = (n: number, score: number | null) => {
    openAsks.set(anime.id, { episode: n, score, phase: 'declined' });
    setPhase({ kind: 'declined', episode: n, score });
  };

  const plan = () => {
    openAsks.delete(anime.id);
    onPlan(entry);
    setPhase({ kind: 'idle' });
  };

  const deciding = (n: number) => {
    stillDeciding.add(`${anime.id}:${n}`);
    openAsks.delete(anime.id);
    setPhase({ kind: 'idle' });
  };

  const openShow = () => onOpen(anime);

  const hasBanner = !!(anime.bannerImage || anime.trailer?.thumbnail);
  const art = anime.bannerImage || anime.trailer?.thumbnail || anime.coverImage.extraLarge || anime.coverImage.large;
  const dropped = kind === 'dropped';
  const stacking = kind === 'stacking';
  const upcoming = !aired;
  const upcomingPremiere = upcoming && episode === 1;
  const dim = dropped && phase.kind === 'idle';

  const whenRight = aired ? (
    <span className={dropped ? 'text-hero-text-low' : 'text-accent-400'}>Aired {span(nowSec - airingAt)} ago</span>
  ) : upcomingPremiere ? (
    <span className="text-warning-400">Premieres {clockTime(airingAt)}</span>
  ) : (
    <span className="text-warning-400">In {span(airingAt - nowSec)}</span>
  );

  const action = (() => {
    if (stacking) {
      return (
        <button type="button" onClick={openShow} className={BTN_QUIET}>
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          Open series
        </button>
      );
    }
    if (phase.kind === 'declined') {
      const scoreText = phase.score === null ? 'Watched' : phase.score;
      return (
        <div className="flex flex-col gap-1.5">
          <p className="text-center text-caption text-hero-text-mid">
            Rated Ep {phase.episode} · {scoreText}
          </p>
          <div className="flex gap-2">
            {status !== 'plan_to_watch' && (
              <button type="button" onClick={plan} className={BTN_QUIET}>
                Plan to Watch
              </button>
            )}
            <button type="button" onClick={() => deciding(phase.episode)} className={BTN_QUIET}>
              Still deciding
            </button>
          </div>
        </div>
      );
    }
    if (upcomingPremiere && firstUnwatched === 1) {
      if (status === null) {
        return (
          <button type="button" onClick={() => onPlan(entry)} className={BTN_WATCH}>
            Plan to Watch
          </button>
        );
      }
      return (
        <p className="flex h-11 items-center justify-center text-center text-caption text-hero-text-mid">
          {status === 'plan_to_watch' ? `In your plan · premieres ${clockTime(airingAt)}` : `Premieres ${clockTime(airingAt)}`}
        </p>
      );
    }
    if (firstUnwatched > latestAired) {
      // Nothing out yet that you haven't seen: the card is a heads-up, not an offer.
      return (
        <p className="flex h-11 items-center justify-center text-center text-caption text-hero-text-mid">
          Caught up · Ep {episode} {upcoming ? `airs ${clockTime(airingAt)}` : 'logged'}
        </p>
      );
    }
    if (watchLink) {
      return (
        <a href={watchLink} target="_blank" rel="noreferrer" onClick={arm} className={BTN_WATCH}>
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          Watch Episode {firstUnwatched}
        </a>
      );
    }
    return (
      <button type="button" onClick={arm} className={BTN_WATCH}>
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        I watched Episode {firstUnwatched}
      </button>
    );
  })();

  return (
    <motion.div
      layoutId={phase.kind === 'ask' ? adoptLayoutId(anime.id) : undefined}
      transition={{ layout: { duration: DUR.portal, ease: EASE_STANDARD } }}
      className={cn(
        'relative flex h-[364px] w-[264px] shrink-0 flex-col overflow-hidden rounded-card border bg-hero-drops-bg shadow-e3 transition-opacity sm:w-[300px]',
        stacking ? 'border-accent-500/45' : 'border-hero-drops-edge',
        dim && 'opacity-65',
      )}
    >
      <div className="relative h-[92px] shrink-0 overflow-hidden">
        <button
          type="button"
          onClick={openShow}
          aria-label={`Open ${title}`}
          className={cn(
            'absolute inset-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
            dropped ? 'grayscale brightness-60' : upcoming && 'grayscale-90 brightness-70',
          )}
        >
          {hasBanner ? (
            <img src={art} alt="" className="h-full w-full object-cover" />
          ) : (
            <>
              <span className="absolute inset-0">
                <img src={art} alt="" className="h-full w-full scale-110 object-cover opacity-40 blur-xl" />
              </span>
              <img src={art} alt="" className="relative h-full object-contain py-1.5" />
            </>
          )}
          <span className="pointer-events-none absolute inset-0 bg-scrim/20" aria-hidden="true" />
          <span
            className="pointer-events-none absolute -inset-1 top-0 transform-gpu bg-linear-to-t/srgb from-hero-drops-bg via-hero-drops-bg/60 to-transparent"
            aria-hidden="true"
          />
        </button>

        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 z-10 flex flex-wrap gap-1.5">
          {stacking && (
            <span className={cn(CHIP, 'border-accent-500/45 text-accent-300')}>
              Stacking · {stackWaiting} waiting
            </span>
          )}
          {dropped && (
            <span className={cn(CHIP, 'border-hero-text-low/40 text-hero-text-mid')}>Dropped at Ep {maxWatched}</span>
          )}
          {lastRating && (
            <span className={cn(CHIP, 'border-accent-500/35 text-accent-300')}>
              You rated Ep {lastRating.episode} · {lastRating.score}
            </span>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3.5 pb-3 pt-2">
        <FitTitle
          title={title}
          onClick={openShow}
          maxPx={16}
          minPx={11}
          className={cn('font-display hover:text-accent-400', upcoming ? 'text-hero-text-mid' : 'text-hero-text-hi')}
        />

        <div className="flex items-center justify-between gap-2 whitespace-nowrap text-caption">
          <span className="truncate text-hero-text-mid">
            Ep {episode} · {airTime(airingAt)}
          </span>
          {whenRight}
        </div>

        {stacking ? <StackStrip entry={entry} latestAired={latestAired} /> : <PulseBox pulse={pulse} entry={entry} />}

        <div className="mt-auto">{action}</div>
      </div>

      {phase.kind === 'rate' && (
        <div
          ref={overlayRef}
          tabIndex={-1}
          role="group"
          aria-label={`Rate Episode ${phase.episode} of ${title}`}
          className="absolute inset-x-0 bottom-0 top-[92px] z-20 flex flex-col justify-center gap-2.5 bg-hero-drops-bg/95 px-3.5 py-3 backdrop-blur-sm focus:outline-none"
        >
          <div>
            <p className="text-micro font-semibold uppercase tracking-wider text-accent-400">
              Back from Episode {phase.episode}?
            </p>
            <p className="font-display text-base font-bold text-hero-text-hi">How was it?</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SCORES.map((score) => (
              <button
                key={score}
                type="button"
                onClick={() => pick(phase.episode, score)}
                aria-label={`Rate Episode ${phase.episode} a ${score}`}
                className="h-11 rounded-control border border-hero-drops-edge bg-hero-drops-bg text-base font-medium tabular-nums text-hero-text-hi transition-colors hover:border-accent-500 hover:bg-accent-600 hover:text-fg-inverse focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {score}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => pick(phase.episode, null)} className={BTN_QUIET}>
              Watched only
            </button>
            <button type="button" onClick={disarm} className={cn(BTN_QUIET, 'text-hero-text-mid')}>
              Not watched yet
            </button>
          </div>
        </div>
      )}

      {phase.kind === 'ask' && (
        <div
          ref={overlayRef}
          tabIndex={-1}
          role="group"
          aria-label={`Add ${title} to Watching?`}
          className="absolute inset-x-0 bottom-0 top-[92px] z-20 flex flex-col justify-center gap-2.5 bg-hero-drops-bg/95 px-3.5 py-3 backdrop-blur-sm focus:outline-none"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-inner bg-accent-600 font-display text-xl font-bold text-fg-inverse">
              {phase.score === null ? <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /> : phase.score}
            </span>
            <span className="text-caption font-semibold text-accent-300">Episode {phase.episode} logged</span>
          </div>
          <p className="font-display text-base font-bold leading-snug text-hero-text-hi">Add {title} to Watching?</p>
          <p className="text-caption leading-relaxed text-hero-text-mid">
            {latestAired > phase.episode
              ? `Episodes ${phase.episode + 1}–${latestAired} are already out. It moves up to Today's Drops.`
              : `It drops in Today's Drops when Episode ${phase.episode + 1} airs ${whenPhrase(airingOf(entry, phase.episode + 1))}.`}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => yes(phase.episode, phase.score)} className={BTN_SOLID}>
              Yes, add it
            </button>
            <button type="button" onClick={() => notNow(phase.episode, phase.score)} className={BTN_QUIET}>
              Not now
            </button>
          </div>
        </div>
      )}

      {phase.kind === 'stamp' && (
        <RatedStamp
          size="sm"
          score={phase.score}
          episode={phase.episode}
          onDone={() => setPhaseState({ kind: 'sendoff', episode: phase.episode, score: phase.score })}
        />
      )}

      {phase.kind === 'sendoff' && (
        <SendOffBeat
          size="sm"
          heading="In Watching now"
          body={`Episode ${phase.episode + 1} drops in Today's Drops ${whenPhrase(airingOf(entry, phase.episode + 1))}.`}
          onDone={() => {
            finishAdopt();
            setPhaseState({ kind: 'idle' });
          }}
        />
      )}
    </motion.div>
  );
});

function PulseBox({ pulse, entry }: { pulse: Pulse; entry: AlsoAiringEntry }) {
  const genres = entry.anime.genres.slice(0, 3).join(', ');
  const box = 'flex flex-col gap-1.5 rounded-control border border-hero-drops-edge bg-hero-drops-well px-2.5 py-2';

  if (pulse.source !== 'reddit') {
    return (
      <div className={box}>
        {pulse.source === 'anilist' && pulse.anilistScore !== null && (
          <div className="flex items-center justify-between text-caption">
            <span className="text-hero-text-low">AniList</span>
            <span className="font-semibold tabular-nums text-hero-text-hi">{pulse.anilistScore.toFixed(1)}</span>
          </div>
        )}
        {genres && <p className="truncate text-caption text-hero-text-low">{genres}</p>}
        {pulse.source === 'none' && <p className="text-caption text-hero-text-low">No r/anime read yet</p>}
      </div>
    );
  }

  const tone = pulse.latestTone ? TONE[pulse.latestTone] : null;
  const upcomingBar = !entry.aired;

  return (
    <div className={box}>
      <div className="flex items-center justify-between gap-2 text-caption">
        {pulse.trend ? (
          <span
            className={cn(
              'truncate font-semibold',
              pulse.trend.direction === 'rising' ? 'text-sent-positive-fg' : 'text-sent-mixed-fg',
            )}
          >
            {pulse.trend.direction === 'rising' ? '↗ Rising' : '↘ Cooling'} since Ep {pulse.trend.sinceEpisode}
          </span>
        ) : (
          <span className="text-hero-text-low">r/anime</span>
        )}
        {tone && (
          <span className={cn('flex shrink-0 items-center gap-1.5 text-label font-semibold', tone.text)}>
            <span className={cn('h-2 w-2 rounded-full', tone.dot)} aria-hidden="true" />
            {tone.label}
          </span>
        )}
      </div>

      <div className="flex h-[46px] items-end gap-1" role="img" aria-label={barsLabel(pulse.bars)}>
        {pulse.bars.map((bar) => (
          <Bar key={bar.episode} bar={bar} />
        ))}
        {upcomingBar && (
          <div className="flex min-w-0 flex-1 flex-col items-center gap-[3px]">
            <span className="block h-[30px] w-full rounded-xs border border-dashed border-warning-400/50" />
            <span className="text-micro font-medium tabular-nums text-warning-400">{entry.episode}</span>
          </div>
        )}
      </div>

      {(pulse.aspects.length > 0 || pulse.comments !== null) && (
        <div className="flex gap-2.5 overflow-hidden whitespace-nowrap text-caption text-hero-text-mid">
          {pulse.aspects.map((aspect) => (
            <span key={aspect.name}>
              {capitalize(aspect.name)} {ASPECT_MARK[aspect.tone]}
            </span>
          ))}
          {pulse.comments !== null && pulse.comments > 0 && (
            <span className="text-hero-text-low">{compactCount(pulse.comments)} comments</span>
          )}
        </div>
      )}
    </div>
  );
}

function Bar({ bar }: { bar: PulseBar }) {
  const tone = bar.tone ? TONE[bar.tone] : null;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-[3px]">
      <span className={cn('block w-full rounded-xs', tone ? cn(tone.bar, tone.height) : 'h-1 bg-hero-drops-edge')} />
      <span className="text-micro font-medium tabular-nums text-hero-text-low">{bar.episode}</span>
    </div>
  );
}

function barsLabel(bars: PulseBar[]): string {
  const read = bars
    .filter((b) => b.tone !== null)
    .map((b) => `Episode ${b.episode} ${TONE[b.tone as Tone].label}`);
  return read.length > 0 ? `r/anime reception: ${read.join(', ')}` : 'No r/anime readings yet';
}

/** Where you are in the pile, not how it was received — a stacking show is spoiler-free. */
function StackStrip({ entry, latestAired }: { entry: AlsoAiringEntry; latestAired: number }) {
  const total = entry.anime.episodes;
  const end = Math.max(1, total ? Math.min(total, latestAired + 1) : latestAired + 1);
  const start = Math.max(1, end - STACK_PIPS + 1);
  const pips = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-accent-500/25 bg-hero-drops-accent-well px-2.5 py-2">
      <div className="flex items-center justify-between text-caption">
        <span className="font-semibold text-accent-300">Your stack</span>
        <span className="text-hero-text-low">no spoilers</span>
      </div>
      <div
        className="flex h-[46px] items-end gap-1"
        role="img"
        aria-label={`${entry.maxWatched} watched, ${entry.stackWaiting} waiting`}
      >
        {pips.map((ep) => (
          <div key={ep} className="flex min-w-0 flex-1 flex-col items-center gap-[3px]">
            <span
              className={cn(
                'block h-[30px] w-full rounded-xs',
                ep <= entry.maxWatched
                  ? 'bg-accent-500/25'
                  : ep <= latestAired
                    ? ep === latestAired
                      ? 'bg-accent-500'
                      : 'border border-accent-400/50 bg-accent-500/35'
                    : 'border border-dashed border-hero-text-low/50',
              )}
            />
            <span className="text-micro font-medium tabular-nums text-hero-text-low">{ep}</span>
          </div>
        ))}
      </div>
      {total ? (
        <p className="truncate text-caption text-hero-text-mid">Wakes at the finale · Ep {total}</p>
      ) : (
        <p className="truncate text-caption text-hero-text-mid">{entry.stackWaiting} waiting</p>
      )}
    </div>
  );
}
