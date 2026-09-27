import { ArrowRight, CalendarClock } from 'lucide-react';
import { useRef, type KeyboardEvent, type Ref } from 'react';
import { Button } from '../../components/ui/Button';
import { displayTitle } from '../../lib/displayTitle';
import type { PickerShow } from '../../lib/onboarding';
import { WATCH_STATE_LABELS } from '../../lib/status';
import { cn } from '../../lib/utils';
import { StepFooter, StepHeader } from './StepChrome';

/** Past this many episodes a strip of chips stops being a strip; a number field takes over. */
const STRIP_MAX = 30;

interface CatchUpStepProps {
  index: number;
  total: number;
  titleRef: Ref<HTMLHeadingElement>;
  /** Picks with at least one episode out, in the order they were picked. */
  shows: PickerShow[];
  /** Picks with nothing out yet — nothing to ask, just reassurance. */
  waiting: PickerShow[];
  through: Readonly<Record<number, number>>;
  onThrough: (showId: number, episode: number) => void;
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
}

/**
 * "Where are you up to?" — the owner's "C2" look: tap the last episode you've
 * seen. Everything up to it is marked watched; None means not started. It is
 * what makes mid-season onboarding honest: without it a show seven episodes
 * in would open as "7 behind" on every surface.
 */
export function CatchUpStep({
  index,
  total,
  titleRef,
  shows,
  waiting,
  through,
  onThrough,
  onBack,
  onNext,
  nextLabel,
}: CatchUpStepProps) {
  return (
    <>
      <StepHeader
        index={index}
        total={total}
        titleRef={titleRef}
        title="Where are you up to?"
        description="Tap the last episode you've seen. Everything up to it gets marked watched."
      />

      <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
        <ul className="flex flex-col gap-3">
          {shows.map((show) => (
            <CatchUpRow
              key={show.anime.id}
              show={show}
              value={through[show.anime.id] ?? show.aired}
              onChange={(n) => onThrough(show.anime.id, n)}
            />
          ))}
        </ul>
        {waiting.length > 0 && (
          <p className="flex items-start gap-2.5 px-1 pt-2 text-label text-fg-muted">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-warning-300" aria-hidden="true" />
            {waiting.length === 1
              ? `${displayTitle(waiting[0].anime)} hasn't started yet. It lands on your schedule when Episode 1 airs.`
              : `${waiting.length} of your picks haven't started yet. They land on your schedule when Episode 1 airs.`}
          </p>
        )}
      </div>

      <StepFooter
        left={
          <span className="hidden text-caption text-fg-muted sm:block">
            You can change any of this later from a show's page.
          </span>
        }
      >
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" onClick={onNext}>
          {nextLabel}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </StepFooter>
    </>
  );
}

function CatchUpRow({ show, value, onChange }: { show: PickerShow; value: number; onChange: (n: number) => void }) {
  const title = displayTitle(show.anime);
  const { aired } = show;
  const result =
    value >= aired
      ? { text: WATCH_STATE_LABELS['caught-up'], tone: 'text-success-300' }
      : value === 0
        ? { text: `${WATCH_STATE_LABELS['not-started']} · ${aired} waiting`, tone: 'text-fg-muted' }
        : { text: `Through Ep ${value} · ${aired - value} waiting`, tone: 'text-accent-300' };

  return (
    <li className="flex flex-col gap-3 rounded-inner border border-edge bg-surface-2 p-4">
      <div className="flex items-center gap-3.5">
        <img
          src={show.anime.coverImage.large}
          alt=""
          loading="lazy"
          className="h-[54px] w-10 shrink-0 rounded-field object-cover"
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-semibold leading-snug text-fg sm:text-base">{title}</p>
          <p className="text-label text-fg-muted">
            {aired === 1 ? '1 episode out' : `${aired} episodes out`}
            <span aria-hidden="true"> · </span>
            <span className={cn('font-semibold', result.tone)}>{result.text}</span>
          </p>
        </div>
      </div>
      {aired <= STRIP_MAX ? (
        <EpisodeStrip title={title} aired={aired} value={value} onChange={onChange} />
      ) : (
        <EpisodeField title={title} aired={aired} value={value} onChange={onChange} />
      )}
    </li>
  );
}

/**
 * A radio group of episodes, 0 ("None") to the latest aired. Roving tabindex:
 * one tab stop, arrows move — the standard radio-group keyboard contract.
 */
function EpisodeStrip({
  title,
  aired,
  value,
  onChange,
}: {
  title: string;
  aired: number;
  value: number;
  onChange: (n: number) => void;
}) {
  const group = useRef<HTMLDivElement>(null);
  const current = Math.min(value, aired);

  const move = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), aired);
    onChange(clamped);
    group.current?.querySelector<HTMLButtonElement>(`[data-ep="${clamped}"]`)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const step: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (e.key in step) move(current + step[e.key]);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(aired);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={`Last episode of ${title} you've watched`}
      onKeyDown={onKeyDown}
      className="flex flex-wrap gap-1"
    >
      {Array.from({ length: aired + 1 }, (_, ep) => {
        const checked = ep === current;
        return (
          <button
            key={ep}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={ep === 0 ? 'None — not started' : `Through episode ${ep}`}
            data-ep={ep}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(ep)}
            className={cn(
              'h-11 min-w-11 rounded-field border text-label font-semibold tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2',
              ep === 0 ? 'px-3' : 'px-2',
              ep === 0
                ? checked
                  ? 'border-accent-500 bg-surface-3 text-fg'
                  : 'border-edge bg-surface-1 text-fg-muted hover:border-accent-500 hover:text-fg'
                : ep < current
                  ? 'border-accent-700 bg-accent-700 text-fg-inverse'
                  : checked
                    ? 'border-accent-300 bg-accent-500 text-fg-inverse shadow-glow'
                    : 'border-edge bg-surface-1 text-fg-muted hover:border-accent-500 hover:text-fg',
            )}
          >
            {ep === 0 ? 'None' : ep}
          </button>
        );
      })}
    </div>
  );
}

/** For long-runners: a number, with "Caught up" one tap away. */
function EpisodeField({
  title,
  aired,
  value,
  onChange,
}: {
  title: string;
  aired: number;
  value: number;
  onChange: (n: number) => void;
}) {
  const id = `through-${title.replace(/\W+/g, '-')}`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={id} className="text-label text-fg-muted">
        Watched through episode
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={aired}
        value={Math.min(value, aired)}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(Math.max(Math.floor(n), 0), aired));
        }}
        className="h-11 w-24 rounded-control border border-edge bg-surface-3 px-3 text-base tabular-nums text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <span className="text-label text-fg-faint">of {aired}</span>
      <Button variant="secondary" size="md" className="h-11" onClick={() => onChange(aired)}>
        Caught up
      </Button>
    </div>
  );
}
