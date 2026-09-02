import { Bookmark, Lock, LockOpen, Play } from 'lucide-react';
import { useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { AnimeMedia } from '../../types';
import type { SeriesEntry, SeriesGraph } from '../../series/labeling';
import { StatusBadge } from '../../components/StatusBadge';
import { SHOW_PARAM } from '../../routes/showParam';
import { cn } from '../../lib/utils';
import { watchCta } from '../../lib/watchCta';
import type { AtlasState } from './useAtlas';
import type { SeriesRoom } from './rooms';
import { ROOM_LABELS, ROOM_ORDER, showHref } from './rooms';

/**
 * The Atlas shell: the part of the franchise page that never changes as you
 * move between rooms. Identity (slim art band), the two ratings that never
 * merge, the one Continue action, the room tabs, and the frontier lock.
 *
 * The art band is the only place franchise key art appears — the marquee died
 * in the pitch round, the band is what survived. Text over the art sits on the
 * theme-invariant scrim, so it is white in every theme.
 */

interface SeriesShellProps {
  graph: SeriesGraph;
  atlas: AtlasState;
  view: SeriesRoom;
  onViewChange: (view: SeriesRoom) => void;
  reveal: boolean;
  onToggleReveal: () => void;
}

function pickArt(atlas: AtlasState, graph: SeriesGraph): string | null {
  const candidates: (AnimeMedia | undefined)[] = [
    atlas.mediaById.get(graph.seriesId),
    atlas.target !== null ? atlas.mediaById.get(atlas.target.memberId) : undefined,
    ...graph.entries.map((e) => atlas.mediaById.get(e.id)),
  ];
  for (const media of candidates) {
    const art = media?.bannerImage ?? media?.trailer?.thumbnail ?? media?.coverImage?.extraLarge;
    if (art) return art;
  }
  return null;
}

/** Is anything on this page currently sealed — i.e. is there aired content past a watched line? */
function anySealed(atlas: AtlasState): boolean {
  return atlas.seasons.some(
    (e: SeriesEntry) => (atlas.progress.get(e.id)?.maxWatched ?? 0) < (atlas.airedByMember.get(e.id) ?? 0),
  );
}

/**
 * What the lock is hiding. Derived from the target member's watched line, with
 * an honest fallback for the zero-progress states (fresh franchise, or a roll
 * into a new season) — those are exactly when everything is sealed, so the
 * toggle must not vanish there.
 */
function frontierLabel(atlas: AtlasState): string {
  if (atlas.target !== null) {
    const member = atlas.seasons.find((e: SeriesEntry) => e.id === atlas.target!.memberId);
    const seen = atlas.progress.get(atlas.target.memberId)?.maxWatched ?? 0;
    if (member !== undefined && seen > 0) return `past ${member.seasonLabel} · E${seen}`;
  }
  return 'unwatched readings';
}

export function SeriesShell({ graph, atlas, view, onViewChange, reveal, onToggleReveal }: SeriesShellProps) {
  const [searchParams] = useSearchParams();
  const tablistRef = useRef<HTMLDivElement>(null);
  const art = pickArt(atlas, graph);
  const cover = atlas.mediaById.get(graph.seriesId)?.coverImage?.large ?? atlas.mediaById.get(atlas.seasons[0]?.id ?? 0)?.coverImage?.large;
  const targetMember = atlas.target !== null ? graph.entries.find((e) => e.id === atlas.target!.memberId) : undefined;
  const targetCta =
    atlas.target !== null && targetMember !== undefined
      ? watchCta({
          episode: atlas.target.episode,
          started: (atlas.progress.get(atlas.target.memberId)?.watched.size ?? 0) > 0,
          seasonLabel: targetMember.seasonLabel,
        })
      : '';
  const yearFrom = atlas.seasons[0]?.startDate?.year;
  const yearTo = atlas.seasons.at(-1)?.startDate?.year;
  const sealable = anySealed(atlas);

  // The ARIA tabs keyboard pattern: arrows move selection with a roving tabindex.
  const onTablistKeyDown = (e: React.KeyboardEvent) => {
    const index = ROOM_ORDER.indexOf(view);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (index + 1) % ROOM_ORDER.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + ROOM_ORDER.length) % ROOM_ORDER.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ROOM_ORDER.length - 1;
    if (next === null) return;
    e.preventDefault();
    onViewChange(ROOM_ORDER[next]);
    tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <header>
      {/* Slim art band — the marquee's survivor */}
      <div className="relative overflow-hidden rounded-t-card border border-b-0 border-edge bg-[var(--series-bg)]">
        {art !== null && (
          <img src={art} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-scrim/30" />
        <div className="absolute inset-0 bg-linear-to-t/srgb from-scrim via-scrim/45 to-transparent" />
        <div className="relative flex min-h-32 items-end gap-4 p-4 pt-10 md:p-5 md:pt-12">
          {cover !== undefined && (
            <img src={cover} alt="" className="h-24 w-[4.25rem] shrink-0 rounded-field object-cover shadow-e2 max-sm:hidden" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl leading-tight font-bold tracking-tight text-white md:text-3xl">{graph.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/75">
              <span>
                {atlas.seasons.length} {atlas.seasons.length === 1 ? 'season' : 'seasons'}
                {atlas.extras.length > 0 && ` · ${atlas.extras.length} extras`}
              </span>
              {atlas.totalEpisodes !== null && atlas.totalEpisodes > 0 && <span>{atlas.totalEpisodes} episodes</span>}
              {yearFrom !== undefined && yearFrom !== null && (
                <span>
                  {yearFrom}
                  {yearTo !== undefined && yearTo !== null && yearTo !== yearFrom && ` – ${yearTo}`}
                </span>
              )}
              <StatusBadge state={atlas.watchState} behindCount={atlas.behind} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 max-md:hidden">
            <div className="rounded-field bg-scrim/60 px-3 py-2 backdrop-blur-md">
              <p className="text-caption uppercase tracking-wider text-white/60">Your overall</p>
              <p className="text-base font-semibold text-white tabular-nums">
                <span className="text-warning-400">★</span> {atlas.overallMean ?? '—'}
              </p>
            </div>
            <div className="rounded-field bg-scrim/60 px-3 py-2 backdrop-blur-md">
              <p className="text-caption uppercase tracking-wider text-white/60">Episode avg</p>
              <p className="text-base font-semibold text-white tabular-nums">
                {atlas.franchise.avgEpisodeScore ?? '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Continue CTA row + room tabs */}
      <div className="rounded-b-card border border-t-0 border-edge bg-surface-1">
        <div className="flex flex-wrap items-center gap-3 border-b border-edge px-4 py-3 md:px-5">
          {atlas.target !== null && targetMember !== undefined ? (
            atlas.targetWatchUrl !== undefined ? (
              <a
                href={atlas.targetWatchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-control bg-gradient-to-b from-hero-grad-from to-hero-grad-to px-5 text-sm font-semibold text-white shadow-e2 transition-[filter] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                {targetCta}
              </a>
            ) : (
              <Link
                to={showHref(searchParams, SHOW_PARAM, atlas.target.memberId)}
                preventScrollReset
                className="inline-flex h-11 items-center gap-2 rounded-control bg-gradient-to-b from-hero-grad-from to-hero-grad-to px-5 text-sm font-semibold text-white shadow-e2 transition-[filter] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                {targetCta}
              </Link>
            )
          ) : (
            <p className="flex h-11 items-center gap-2 text-sm text-fg-muted">
              <Bookmark className="h-4 w-4" aria-hidden="true" />
              {atlas.franchise.watched > 0 ? 'All caught up.' : 'Nothing aired yet.'}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted md:hidden">
            <span>
              <span className="text-warning-400">★</span> {atlas.overallMean ?? '—'} overall
            </span>
            <span>{atlas.franchise.avgEpisodeScore ?? '—'} episode avg</span>
          </div>
        </div>

        <div
          ref={tablistRef}
          className="flex items-center gap-1 overflow-x-auto px-2 scrollbar-hide"
          role="tablist"
          aria-label="Series views"
          onKeyDown={onTablistKeyDown}
        >
          {ROOM_ORDER.map((room) => (
            <button
              key={room}
              role="tab"
              id={`series-tab-${room}`}
              aria-selected={view === room}
              aria-controls={`series-room-${room}`}
              tabIndex={view === room ? 0 : -1}
              onClick={() => onViewChange(room)}
              className={cn(
                'h-11 shrink-0 whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                view === room
                  ? 'border-accent-500 text-fg'
                  : 'border-transparent text-fg-muted hover:text-fg-secondary',
              )}
            >
              {ROOM_LABELS[room]}
            </button>
          ))}
          {(sealable || reveal) && (
            <button
              onClick={onToggleReveal}
              aria-pressed={reveal}
              className={cn(
                'ml-auto mr-2 flex h-9 shrink-0 items-center gap-1.5 rounded-control border px-3 text-caption font-medium transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                reveal
                  ? 'border-warning-400/40 bg-warning-400/10 text-warning-300'
                  : 'border-edge text-fg-muted hover:text-fg-secondary',
              )}
            >
              {reveal ? <LockOpen className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
              {reveal ? 'Revealing everything' : `Hiding ${frontierLabel(atlas)}`}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
