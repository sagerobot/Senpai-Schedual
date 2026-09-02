import { AlertTriangle, Check, Loader2, RefreshCw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { DUR, EASE_STANDARD } from '../lib/motion';
import { cn } from '../lib/utils';
import { railSteps, wakeCopy, type StepState, type WakeState } from '../lib/wakeStrip';
import { Button } from './ui/Button';

/**
 * The wake strip: the in-page answer to "is this the current version?".
 *
 * It sits in the flow at the top of the main column — not a floating toast —
 * on the Daily Schedule header's own surface, and walks the visitor through
 * the cold start: waking → (same build) latest → gone, or → updating → reload.
 * Only the icon, copy, rail and edge tint change between phases; the layout
 * never shifts. Hidden renders nothing, and the exit folds the height away so
 * the page slides up under it.
 */

interface WakeStripProps {
  state: WakeState;
  onRetry: () => void;
  onReload: () => void;
}

const STEP_LABELS = ['Server', 'Version', 'Ready'] as const;

const EDGE: Record<WakeState['phase'], string> = {
  hidden: '',
  waking: 'border-hero-drops-edge/60',
  checking: 'border-hero-drops-edge/60',
  latest: 'border-success-500/35 shadow-glow-success',
  updating: 'border-accent-500/45 shadow-glow',
  down: 'border-warning-500/35 shadow-glow-warning',
};

const EYEBROW: Record<WakeState['phase'], string> = {
  hidden: '',
  waking: 'text-accent-400',
  checking: 'text-accent-400',
  latest: 'text-success-300',
  updating: 'text-accent-300',
  down: 'text-warning-300',
};

function PhaseIcon({ phase }: { phase: WakeState['phase'] }) {
  const cls = 'h-[18px] w-[18px]';
  switch (phase) {
    case 'latest':
      return <Check className={cn(cls, 'text-success-400')} aria-hidden="true" />;
    case 'updating':
      return <RefreshCw className={cn(cls, 'animate-spin text-accent-400')} aria-hidden="true" />;
    case 'down':
      return <AlertTriangle className={cn(cls, 'text-warning-400')} aria-hidden="true" />;
    default:
      return <Loader2 className={cn(cls, 'animate-spin text-accent-400')} aria-hidden="true" />;
  }
}

function StepDot({ state }: { state: StepState }) {
  switch (state) {
    case 2:
      return (
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-success-500">
          <Check className="h-[11px] w-[11px] text-scrim" strokeWidth={3} aria-hidden="true" />
        </span>
      );
    case 1:
      return (
        <span className="relative flex h-[18px] w-[18px] items-center justify-center">
          <span className="absolute inset-0.5 animate-ping rounded-full bg-accent-400 opacity-75" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-accent-500" />
        </span>
      );
    case 3:
      return (
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-warning-400/60 bg-warning-500/20">
          <X className="h-2.5 w-2.5 text-warning-300" aria-hidden="true" />
        </span>
      );
    default:
      return <span className="h-[18px] w-[18px] rounded-full border border-edge-strong bg-hero-drops-well" />;
  }
}

const STEP_TEXT: Record<StepState, string> = {
  0: 'text-hero-text-low',
  1: 'text-accent-300',
  2: 'text-success-300',
  3: 'text-warning-300',
};

function Rail({ steps }: { steps: [StepState, StepState, StepState] }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {steps.map((step, i) => (
        <li key={STEP_LABELS[i]} className="contents">
          <div className="flex flex-col items-center gap-1.5">
            <StepDot state={step} />
            <span className={cn('text-micro font-semibold uppercase tracking-wider', STEP_TEXT[step])}>
              {STEP_LABELS[i]}
            </span>
          </div>
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={cn(
                'mb-[18px] h-px min-w-3 flex-1 md:min-w-7',
                step === 2 && steps[i + 1] === 2 ? 'bg-success-500' : 'bg-hero-drops-edge',
              )}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function BuildStamp({ state }: { state: WakeState }) {
  const newer = state.phase === 'updating' && state.serverBuild !== null;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="whitespace-nowrap rounded-xs border border-hero-drops-edge bg-hero-drops-well px-2 py-1 font-mono text-xs text-hero-text-mid">
        {newer ? `${state.clientBuild} → ${state.serverBuild}` : state.clientBuild}
      </span>
      <span className="text-micro uppercase tracking-wider text-hero-text-low">
        {newer ? 'device → live' : state.phase === 'latest' ? 'live = device' : 'this device'}
      </span>
    </div>
  );
}

export function WakeStrip({ state, onRetry, onReload }: WakeStripProps) {
  const copy = wakeCopy(state);
  const action =
    state.phase === 'down' ? (
      <Button variant="secondary" onClick={onRetry} className="shrink-0">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Try again
      </Button>
    ) : state.phase === 'updating' && state.reloadRefused ? (
      <Button variant="primary" onClick={onReload} className="shrink-0">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Reload now
      </Button>
    ) : null;

  return (
    <AnimatePresence initial={false}>
      {copy && (
        <motion.div
          key="wake-strip"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: DUR.standard, ease: EASE_STANDARD }}
          className="overflow-hidden"
        >
          <section
            role="status"
            aria-live="polite"
            className={cn(
              'mb-6 flex flex-col gap-3 rounded-card border bg-hero-drops-deep/50 p-4 shadow-e1 backdrop-blur-sm md:flex-row md:items-center md:gap-5 md:px-5',
              EDGE[state.phase],
            )}
          >
            <div className="flex items-start gap-3 md:items-center md:gap-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-hero-drops-edge bg-hero-drops-well md:h-10 md:w-10">
                <PhaseIcon phase={state.phase} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-caption font-semibold uppercase tracking-wider', EYEBROW[state.phase])}>
                  {copy.eyebrow}
                </p>
                <p className="text-[15px] font-semibold leading-5 text-hero-text-hi">{copy.headline}</p>
                <p className="text-label text-hero-text-mid">{copy.detail}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-hero-drops-edge/70 pt-3 md:ml-auto md:shrink-0 md:gap-6 md:border-l md:border-t-0 md:pl-5 md:pt-0">
              <Rail steps={railSteps(state)} />
              {action ?? <BuildStamp state={state} />}
            </div>
          </section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
