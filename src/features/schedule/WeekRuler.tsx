import { cn } from '../../lib/utils';
import type { DaySummary, PipKind } from './weekSummary';

interface WeekRulerProps {
  days: DaySummary[];
  /** Scrolls the day's section into view. Never fires for an empty column. */
  onJump: (day: string) => void;
}

/**
 * Pip colors ride the shipped watch-state vocabulary (src/lib/status.ts):
 * accent means "needs you", success means "clear", and grey is everything
 * airing that isn't yours. A stacking show is deliberately piling up, so it
 * gets the outline — claimed, but not asking for anything.
 */
const PIP_CLASSES: Record<PipKind, string> = {
  behind: 'bg-accent-400 shadow-glow-sm',
  mine: 'bg-success-500',
  // Fill as well as outline: a hairline border alone thins out to nothing on
  // the light themes' hero surface.
  stacking: 'border border-accent-500/70 bg-accent-500/15',
  other: 'bg-hero-drops-well-hover',
};

function describe(day: DaySummary): string {
  if (day.total === 0) return `${day.day} ${day.dayOfMonth}, nothing airing`;
  const parts = [`${day.total} episode${day.total === 1 ? '' : 's'}`];
  if (day.mine > 0) parts.push(`${day.mine} yours`);
  if (day.behind > 0) parts.push(`${day.behind} behind`);
  return `${day.day} ${day.dayOfMonth}, ${parts.join(', ')}`;
}

/**
 * The week at a glance, and the page's table of contents. Each column reports
 * how loaded a day is and how much of it is the user's, and jumps to that
 * day's section — the day headings below are ~600px apart, so this is the only
 * way to reach Monday without a scroll wheel.
 *
 * It describes the *visible* schedule, so it always agrees with the grid
 * underneath: a filter that empties a day empties its column too, and the
 * column stops being a jump target because there is no section to jump to.
 */
export function WeekRuler({ days, onJump }: WeekRulerProps) {
  const behindDays = days.filter(d => d.behind > 0);

  return (
    <nav aria-label="Jump to a day" className="w-full">
      <ul className="grid grid-cols-7 gap-px overflow-hidden rounded-inner border border-hero-drops-edge bg-hero-drops-edge">
        {days.map((day) => {
          const empty = day.total === 0;
          return (
            <li key={day.day} className="contents">
              <button
                type="button"
                disabled={empty}
                aria-current={day.isToday ? 'date' : undefined}
                aria-label={describe(day)}
                onClick={() => onJump(day.day)}
                className={cn(
                  'flex min-h-[68px] flex-col items-start gap-1 p-2 text-left transition-colors sm:min-h-[96px] sm:gap-1.5 sm:p-3',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  day.isToday ? 'bg-hero-drops-accent-well' : 'bg-hero-drops-deep',
                  empty
                    ? 'cursor-default opacity-55'
                    : 'hover:bg-hero-drops-well-hover motion-reduce:transition-none',
                )}
              >
                <span
                  className={cn(
                    'flex items-baseline gap-1.5 text-caption font-semibold uppercase tracking-wider',
                    day.isToday ? 'text-accent-400' : 'text-hero-text-low',
                  )}
                >
                  <span className="sm:hidden">{day.day.slice(0, 2)}</span>
                  <span className="hidden sm:inline">{day.day.slice(0, 3)}</span>
                  {/* A ~48px column on a phone can't hold the date too — the
                      day is what you navigate by, so the date is what goes. */}
                  <span
                    className={cn(
                      'hidden text-sm font-bold normal-case tracking-normal sm:inline',
                      day.isToday ? 'text-hero-text-hi' : 'text-hero-text-mid',
                    )}
                  >
                    {day.dayOfMonth}
                  </span>
                </span>

                <span
                  aria-hidden="true"
                  className={cn(
                    'text-sm tabular-nums sm:text-caption',
                    day.isToday ? 'text-accent-300' : 'text-hero-text-low',
                  )}
                >
                  {day.total === 0 ? '—' : day.total}
                  <span className="hidden sm:inline"> ep{day.total === 1 ? '' : 's'}</span>
                </span>

                {day.behind > 0 && (
                  <span
                    aria-hidden="true"
                    className="hidden text-micro font-semibold text-accent-300 sm:inline"
                  >
                    {day.behind} behind
                  </span>
                )}

                {/* Last and bottom-aligned, so every column's pip row lands on
                    the same line whether or not it carries a behind count.
                    Decoration for a screen reader — describe() already puts
                    these counts in the button's label. */}
                <span aria-hidden="true" className="mt-auto hidden flex-wrap items-center gap-[3px] sm:flex">
                  {day.pips.map((pip, i) => (
                    <span
                      key={i}
                      className={cn('h-[5px] w-[15px] rounded-[2px]', PIP_CLASSES[pip])}
                    />
                  ))}
                  {day.overflow > 0 && (
                    <span className="text-micro text-hero-text-low">+{day.overflow}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* What the phone columns had to drop, given back as one readable line
          rather than as color inside a 48px box. */}
      {behindDays.length > 0 && (
        <p className="mt-2 text-caption text-hero-text-mid sm:hidden">
          <span className="font-semibold text-accent-300">Behind:</span>{' '}
          {behindDays.map(d => `${d.day.slice(0, 3)} ${d.behind}`).join(' · ')}
        </p>
      )}

      <ul className="mt-2 hidden flex-wrap items-center gap-x-4 gap-y-1 text-micro text-hero-text-low sm:flex">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn('h-[5px] w-[15px] rounded-[2px]', PIP_CLASSES.behind)} />
          behind
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn('h-[5px] w-[15px] rounded-[2px]', PIP_CLASSES.mine)} />
          caught up
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn('h-[5px] w-[15px] rounded-[2px]', PIP_CLASSES.stacking)} />
          stacking
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn('h-[5px] w-[15px] rounded-[2px]', PIP_CLASSES.other)} />
          everything else airing
        </li>
      </ul>
    </nav>
  );
}
