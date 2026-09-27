import { ArrowRight, Clock, Loader2, Search, X } from 'lucide-react';
import { useMemo, useState, type Ref } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import {
  pickerMeta,
  pickerSections,
  type PickerSection,
  type PickerSectionId,
  type PickerShow,
} from '../../lib/onboarding';
import { useCurrentSchedule, useSeasonQuery } from '../../queries/hooks';
import { daysUntilNextSeason, nextSeason, seasonLabel } from '../../routes/season';
import { useUserData } from '../../stores/userData';
import { ShowTile } from './ShowTile';
import { StepFooter, StepHeader } from './StepChrome';

/** Tiles per section before "Show more"; each press adds another page. */
const PAGE = 24;
/** Next season's line-up joins the picker this close to the boundary. */
const NEXT_SEASON_WINDOW_DAYS = 28;

const GRID = 'grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-6';

const startsFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long' });
const monthDayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function formatMeta(show: PickerShow, fallbackLabel: string): { text: string; tone: 'muted' | 'time' } {
  const meta = pickerMeta(show);
  switch (meta.kind) {
    case 'aired':
      return { text: meta.count === 1 ? '1 episode out' : `${meta.count} episodes out`, tone: 'muted' };
    case 'starts':
      return { text: `Starts ${startsFmt.format(new Date(meta.airingAt * 1000))}`, tone: 'time' };
    case 'startDate': {
      // Month is 1-based from AniList; year is irrelevant to the month name.
      const date = new Date(2000, meta.month - 1, meta.day ?? 1);
      return {
        text: meta.day === null ? `Starts in ${monthFmt.format(date)}` : `Starts ${monthDayFmt.format(date)}`,
        tone: 'time',
      };
    }
    case 'unannounced':
      return { text: fallbackLabel, tone: 'muted' };
  }
}

interface PickStepProps {
  index: number;
  total: number;
  titleRef: Ref<HTMLHeadingElement>;
  picks: ReadonlyMap<number, PickerShow>;
  onToggle: (show: PickerShow) => void;
  onBack: (() => void) | null;
  onNext: () => void;
  nextLabel: string;
}

export function PickStep({ index, total, titleRef, picks, onToggle, onBack, onNext, nextLabel }: PickStepProps) {
  // One clock per visit: sections must not reshuffle under the pointer.
  const [now] = useState(() => new Date());
  const nowSec = Math.floor(now.getTime() / 1000);
  const [term, setTerm] = useState('');
  const [shown, setShown] = useState<Record<PickerSectionId, number>>({ airing: PAGE, premiering: PAGE, next: PAGE });

  const schedule = useCurrentSchedule();
  const scheduleList = schedule.data ?? schedule.partialData ?? null;

  const daysLeft = daysUntilNextSeason(now);
  const upcoming = nextSeason(now);
  const upcomingLabel = seasonLabel(upcoming);
  const wantsNext = daysLeft <= NEXT_SEASON_WINDOW_DAYS;
  const nextQuery = useSeasonQuery(upcoming.year, upcoming.season, { enabled: wantsNext });

  const library = useUserData((s) => s.library);

  const sections = useMemo(
    () =>
      pickerSections({
        schedule: scheduleList ?? [],
        nextSeason: wantsNext ? (nextQuery.data ?? []) : [],
        library,
        nowSec,
        term,
      }),
    [scheduleList, wantsNext, nextQuery.data, library, nowSec, term],
  );

  const pickedCount = picks.size;
  const searching = term.trim() !== '';
  const nothingShown = sections.every((s) => s.shows.length === 0);
  const scheduleLoading = scheduleList === null && schedule.isPending;
  const scheduleFailed = scheduleList === null && schedule.isError;
  const nextLoading = wantsNext && nextQuery.isPending;

  const headings: Record<PickerSectionId, { title: string; note: string }> = {
    airing: { title: 'Airing now', note: 'most talked-about first' },
    premiering: { title: 'Premiering soon', note: 'nothing out yet' },
    // "Fall 2026" → "Coming this Fall"
    next: { title: `Coming this ${upcomingLabel.split(' ')[0]}`, note: '' },
  };

  const renderSection = (section: PickerSection) => {
    const heading = headings[section.id];
    const limit = shown[section.id];
    const visible = section.shows.slice(0, limit);
    const remaining = section.shows.length - visible.length;
    const isNext = section.id === 'next';
    if (section.shows.length === 0 && !(isNext && nextLoading && !searching)) return null;

    return (
      <section key={section.id} aria-labelledby={`onboarding-${section.id}`} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 id={`onboarding-${section.id}`} className="text-lg font-bold text-fg">
            {heading.title}
          </h3>
          {isNext ? (
            <span className="flex items-center gap-1.5 rounded-full bg-warning-500/10 px-2.5 py-0.5 text-caption font-semibold text-warning-300">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {daysLeft <= 1 ? `${upcomingLabel} starts tomorrow` : `${upcomingLabel} starts in ${daysLeft} days`}
            </span>
          ) : (
            <span className="text-label font-normal text-fg-muted">
              {section.shows.length} {section.shows.length === 1 ? 'show' : 'shows'} · {heading.note}
            </span>
          )}
        </div>
        {isNext && nextLoading && section.shows.length === 0 ? (
          <TileSkeletons count={6} />
        ) : (
          <div className={GRID}>
            {visible.map((show) => {
              const meta = formatMeta(show, upcomingLabel);
              return (
                <ShowTile
                  key={show.anime.id}
                  show={show}
                  picked={picks.has(show.anime.id)}
                  onToggle={() => onToggle(show)}
                  meta={meta.text}
                  metaTone={meta.tone}
                />
              );
            })}
          </div>
        )}
        {remaining > 0 && (
          <Button
            variant="secondary"
            onClick={() => setShown((s) => ({ ...s, [section.id]: s[section.id] + PAGE * 2 }))}
            className="w-full"
          >
            Show {remaining} more
          </Button>
        )}
      </section>
    );
  };

  return (
    <>
      <StepHeader
        index={index}
        total={total}
        titleRef={titleRef}
        title="What are you watching?"
        description="Pick anything you follow or want to start. Next you'll say how far in you are."
        aside={
          <label className="flex h-11 w-full shrink-0 items-center gap-2 rounded-control border border-edge bg-surface-3 px-3 focus-within:ring-2 focus-within:ring-ring sm:w-64">
            <Search className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <input
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Filter by title"
              aria-label="Filter shows by title"
              className="h-full min-w-0 flex-1 bg-transparent text-base text-fg placeholder:text-fg-faint focus:outline-none sm:text-sm"
            />
            {searching && (
              <button
                type="button"
                onClick={() => setTerm('')}
                aria-label="Clear filter"
                className="-mr-2 flex h-11 w-9 shrink-0 items-center justify-center text-fg-muted hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </label>
        }
      />

      <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
        {scheduleFailed ? (
          <ErrorState
            title="Couldn't load this season's shows"
            detail={schedule.error instanceof Error ? schedule.error.message : null}
            onRetry={() => void schedule.refetch()}
            className="min-h-[30vh]"
          />
        ) : scheduleLoading ? (
          <section aria-busy="true" aria-label="Loading this season's shows" className="flex flex-col gap-4">
            <Skeleton className="h-6 w-40" />
            <TileSkeletons count={12} />
          </section>
        ) : (
          <>
            {schedule.isStreaming && (
              <p className="flex items-center gap-2 self-start rounded-full border border-edge bg-surface-2 px-3 py-1 text-caption text-fg-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Loading more shows…
              </p>
            )}
            {sections.map(renderSection)}
            {wantsNext && nextQuery.isError && !searching && (
              <p className="flex flex-wrap items-center gap-3 text-sm text-fg-muted">
                Couldn't load {upcomingLabel}'s line-up.
                <Button variant="ghost" size="md" onClick={() => void nextQuery.refetch()}>
                  Try again
                </Button>
              </p>
            )}
            {nothingShown && !nextLoading && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <p className="font-medium text-fg-secondary">
                  {searching ? `No shows this season match “${term.trim()}”` : 'Nothing is airing right now'}
                </p>
                <p className="max-w-sm text-sm text-fg-muted">
                  Looking for something older? Search finds any show once you're set up.
                </p>
                {searching && (
                  <Button variant="secondary" onClick={() => setTerm('')}>
                    Clear filter
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <StepFooter
        left={
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-fg" aria-live="polite">
              {pickedCount === 0 ? 'Nothing picked yet' : `${pickedCount} ${pickedCount === 1 ? 'show' : 'shows'} picked`}
            </span>
            <span className="hidden text-caption text-fg-muted sm:block">Each one goes on your Watching list</span>
          </div>
        }
      >
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
        )}
        <Button variant={pickedCount === 0 ? 'secondary' : 'primary'} onClick={onNext}>
          {pickedCount === 0 ? 'Skip' : nextLabel}
          {pickedCount > 0 && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </StepFooter>
    </>
  );
}

function TileSkeletons({ count }: { count: number }) {
  return (
    <div className={GRID}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="aspect-[3/4] w-full rounded-inner" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
