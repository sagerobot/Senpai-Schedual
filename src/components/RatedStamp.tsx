import { Check } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, type CSSProperties } from 'react';
import { CELEBRATE, celebrationTier } from '../lib/motion';
import { cn } from '../lib/utils';

/** Reduced motion still confirms the score — it just doesn't perform it. */
const REDUCED_STAMP_SEC = 0.7;

const SPARK_ANGLES = Array.from({ length: 12 }, (_, i) => i * 30);

function stampWord(score: number | null): string {
  if (score === null) return 'Marked watched';
  if (score >= 10) return 'Perfect 10';
  if (score >= 9) return 'Great episode';
  if (score >= 7) return 'Nice one';
  return 'Noted';
}

/** How long the stamp beat lasts for a score — callers sequence the next beat off it. */
export function stampSeconds(score: number | null, reduced: boolean): number {
  return reduced ? REDUCED_STAMP_SEC : CELEBRATE.stamp[celebrationTier(score)];
}

interface RatedStampProps {
  score: number | null;
  episode: number;
  /** `sm` for the Also Airing card, `lg` for a drop card. */
  size?: 'sm' | 'lg';
  /** Fires once when the beat is over. */
  onDone: () => void;
}

/**
 * The rating celebration's first beat: the score stamps onto the card.
 *
 * It grows with the score — one ring for a 5 or 6, two for a 7 or 8, three
 * plus a burst of sparks and a thump of the whole card for a 9 or 10 — so the
 * feedback carries the rating instead of just confirming a tap. It covers its
 * positioned parent and is purely presentational: the log itself was written
 * before the stamp started, so an interrupted animation can never lose it.
 */
export function RatedStamp({ score, episode, size = 'lg', onDone }: RatedStampProps) {
  const reduced = useReducedMotion() ?? false;
  const tier = celebrationTier(score);
  const seconds = stampSeconds(score, reduced);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const id = setTimeout(() => done.current(), seconds * 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const run = (delaySec = 0, durationSec = seconds): CSSProperties =>
    reduced ? {} : { animationDuration: `${durationSec}s`, animationDelay: `${delaySec}s`, animationFillMode: 'both' };

  const tile = size === 'lg' ? 'h-36 w-36 rounded-[34px] text-7xl' : 'h-20 w-20 rounded-[20px] text-4xl';
  const rings = tier === 3 ? [0.34, 0.54, 0.74] : tier === 2 ? [0.34, 0.54] : [0.34];

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-[inherit]"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">
        Episode {episode} {score === null ? 'marked watched' : `rated ${score}`}
      </span>
      <div
        aria-hidden="true"
        className={cn('absolute inset-0 bg-hero-drops-accent-well/80', !reduced && '[animation-name:stamp-veil]')}
        style={run()}
      />
      <div aria-hidden="true" className="absolute left-1/2 top-[40%] h-0 w-0">
        {!reduced &&
          rings.map((delay) => (
            <span
              key={delay}
              className={cn('absolute -translate-x-1/2 -translate-y-1/2 border-2 border-accent-400 opacity-0 [animation-name:stamp-ring]', tile)}
              style={{ ...run(delay, 0.9), animationTimingFunction: 'ease-out', left: 0, top: 0 }}
            />
          ))}
        {!reduced &&
          tier === 3 &&
          SPARK_ANGLES.map((deg) => (
            <span key={deg} className="absolute left-0 top-0" style={{ transform: `rotate(${deg}deg)` }}>
              <span
                className={cn(
                  'absolute -left-[3px] -top-[9px] block h-[18px] w-1.5 rounded-full opacity-0 [animation-name:stamp-spark]',
                  score === 10 ? 'bg-fg-inverse' : 'bg-accent-300',
                )}
                style={{ ...run(0.38, 1), animationTimingFunction: 'cubic-bezier(.2,.8,.2,1)' }}
              />
            </span>
          ))}
        <span
          className={cn(
            'absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-accent-600 font-display font-bold text-fg-inverse',
            tile,
            tier === 3 && 'shadow-glow-lg',
            !reduced && 'opacity-0 [animation-name:stamp-tile]',
            reduced && 'rotate-[-6deg]',
          )}
          style={{ ...run(), animationTimingFunction: 'cubic-bezier(.2,.8,.2,1)', left: 0, top: 0 }}
        >
          {score === null ? <Check className={size === 'lg' ? 'h-16 w-16' : 'h-9 w-9'} strokeWidth={3} /> : score}
        </span>
      </div>
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 text-center',
          size === 'lg' ? 'top-[62%]' : 'top-[66%]',
          !reduced && 'opacity-0 [animation-name:stamp-caption]',
        )}
        style={run()}
      >
        <div className={cn('font-display font-bold text-hero-text-hi', size === 'lg' ? 'text-2xl' : 'text-base')}>
          {stampWord(score)}
        </div>
        <div className="text-caption text-accent-300">Episode {episode} logged</div>
      </div>
    </div>
  );
}

interface SendOffProps {
  heading: string;
  body: string;
  size?: 'sm' | 'lg';
  onDone: () => void;
}

/**
 * The second beat for a card that is about to leave: says why, then goes.
 * A card vanishing the instant you rate it reads as "where did it go?", so
 * the exit is announced — with a draining bar that shows the countdown —
 * before the row closes over it.
 */
export function SendOffBeat({ heading, body, size = 'lg', onDone }: SendOffProps) {
  const reduced = useReducedMotion() ?? false;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const id = setTimeout(() => done.current(), CELEBRATE.sendOff * 1000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-[inherit] bg-hero-drops-bg/95 text-center',
        size === 'lg' ? 'p-10' : 'p-5',
        !reduced && '[animation:send-off-in_0.4s_var(--ease-standard)_both]',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex items-center justify-center rounded-full border-2 border-accent-500 shadow-glow',
          size === 'lg' ? 'h-16 w-16' : 'h-11 w-11',
        )}
      >
        <Check className={cn('text-accent-400', size === 'lg' ? 'h-8 w-8' : 'h-5 w-5')} strokeWidth={2.6} />
      </span>
      <p className={cn('font-display font-bold text-hero-text-hi', size === 'lg' ? 'text-2xl' : 'text-base')}>
        {heading}
      </p>
      <p className={cn('max-w-sm leading-relaxed text-hero-text-mid', size === 'lg' ? 'text-sm' : 'text-caption')}>
        {body}
      </p>
      <span aria-hidden="true" className="mt-1 h-1 w-40 max-w-full overflow-hidden rounded-full bg-hero-drops-edge">
        <span
          className="block h-full rounded-full bg-accent-500"
          style={reduced ? undefined : { animation: `send-off-drain ${CELEBRATE.sendOff}s linear both` }}
        />
      </span>
    </div>
  );
}
