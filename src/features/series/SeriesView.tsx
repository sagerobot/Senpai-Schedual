import { CalendarDays, Star, Tv } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { AnimeMedia, EpisodeLog, LibraryEntry } from '../../types';
import type { SeriesEntry, SeriesGraph } from '../../series/labeling';
import { useShowDetailsQuery } from '../../queries/hooks';
import { useVibesIndex } from '../../queries/vibes';
import { SHOW_PARAM } from '../../routes/showParam';
import { cn } from '../../lib/utils';
import { EpisodeGrid } from './EpisodeGrid';
import { franchiseRollup, memberRollup } from './rollups';

/**
 * The franchise page: one show as a destination, its seasons as tabs.
 *
 * Ratings are shown at two levels and never merged — the episode average and
 * the owner-given overall sit side by side, because the gap between them is a
 * real signal (a show can be greater than the sum of its parts).
 *
 * Episode-level interaction stays in the detail modal (`?show=`), which the
 * "Episodes & details" button opens without leaving this page.
 */

interface SeriesViewProps {
  graph: SeriesGraph;
  media: AnimeMedia[];
  logs: EpisodeLog[];
  library: LibraryEntry[];
  onOpenEpisode: (memberId: number, episode: number) => void;
}

function year(entry: SeriesEntry): string {
  return entry.startDate?.year ? String(entry.startDate.year) : '—';
}

/** AI summary first, MAL/Kitsu synopsis as fallback, raw description last. */
function SeasonSynopsis({ media }: { media: AnimeMedia }) {
  const details = useShowDetailsQuery(media);
  if (details.isPending) {
    return <div className="mt-4 h-16 animate-pulse rounded-lg bg-surface-2" aria-hidden="true" />;
  }
  const raw =
    details.data?.details.aiSummary ??
    details.data?.details.mal?.synopsis ??
    details.data?.details.kitsu?.synopsis ??
    details.data?.full?.description ??
    null;
  if (raw === null || raw.trim() === '') return null;
  const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return <p className="mt-4 text-sm leading-relaxed text-gray-300 line-clamp-4">{text}</p>;
}

export function SeriesView({ graph, media, logs, library, onOpenEpisode }: SeriesViewProps) {
  const vibes = useVibesIndex();
  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);
  const seasons = useMemo(() => graph.entries.filter((e) => !e.isAttachment), [graph.entries]);
  const extras = useMemo(() => graph.entries.filter((e) => e.isAttachment), [graph.entries]);

  // Most people land here thinking about the newest season.
  const [selectedId, setSelectedId] = useState<number | 'extras'>(seasons.at(-1)?.id ?? 'extras');

  const franchise = useMemo(
    () => franchiseRollup(logs, graph.entries.map((e) => e.id)),
    [logs, graph.entries],
  );

  const selected = typeof selectedId === 'number' ? seasons.find((e) => e.id === selectedId) : undefined;
  const selectedMedia = selected ? mediaById.get(selected.id) : undefined;
  const selectedRollup = selected ? memberRollup(logs, selected.id) : null;
  const selectedEntry = selected ? library.find((l) => l.showId === selected.id) : undefined;

  const totalEpisodes = seasons.reduce<number | null>(
    (acc, e) => (e.episodes == null || acc === null ? null : acc + e.episodes),
    0,
  );

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">{graph.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
          <span className="flex items-center gap-1.5">
            <Tv className="h-4 w-4" aria-hidden="true" />
            {seasons.length} {seasons.length === 1 ? 'season' : 'seasons'}
            {extras.length > 0 && ` + ${extras.length} extras`}
          </span>
          {totalEpisodes !== null && totalEpisodes > 0 && <span>{totalEpisodes} episodes</span>}
          {seasons.length > 0 && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {year(seasons[0])}
              {seasons.length > 1 && ` – ${year(seasons[seasons.length - 1])}`}
            </span>
          )}
        </p>

        {franchise.watched > 0 && (
          <p className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-surface-2 px-3 py-1.5 text-gray-300">
              {franchise.watched} episodes watched
            </span>
            <span className="rounded-full bg-surface-2 px-3 py-1.5 text-gray-300">
              {franchise.seasonsStarted}/{graph.entries.length} entries started
            </span>
            {franchise.avgEpisodeScore !== null && (
              <span className="rounded-full bg-surface-2 px-3 py-1.5 text-gray-300">
                Your episode average: {franchise.avgEpisodeScore}
              </span>
            )}
          </p>
        )}
      </header>

      {/* Season tabs */}
      <div role="tablist" aria-label="Seasons" className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {seasons.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            aria-selected={selectedId === entry.id}
            onClick={() => setSelectedId(entry.id)}
            className={cn(
              'h-11 shrink-0 whitespace-nowrap rounded-lg border px-4 text-sm font-medium transition-colors',
              selectedId === entry.id
                ? 'border-accent-500/40 bg-accent-600/15 text-accent-300'
                : 'border-edge text-gray-400 hover:bg-surface-2 hover:text-white',
            )}
          >
            {entry.seasonLabel}
          </button>
        ))}
        {extras.length > 0 && (
          <button
            role="tab"
            aria-selected={selectedId === 'extras'}
            onClick={() => setSelectedId('extras')}
            className={cn(
              'h-11 shrink-0 whitespace-nowrap rounded-lg border px-4 text-sm font-medium transition-colors',
              selectedId === 'extras'
                ? 'border-accent-500/40 bg-accent-600/15 text-accent-300'
                : 'border-edge text-gray-400 hover:bg-surface-2 hover:text-white',
            )}
          >
            Extras
          </button>
        )}
      </div>

      {/* Selected season */}
      {selected && (
        <section
          role="tabpanel"
          aria-label={selected.seasonLabel}
          className="mt-3 flex flex-col gap-5 rounded-xl border border-edge bg-surface-0 p-5 sm:flex-row"
        >
          {selectedMedia?.coverImage?.large && (
            <img
              src={selectedMedia.coverImage.large}
              alt=""
              className="h-56 w-40 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-white">{selected.title}</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              {selected.format || 'TV'} · {year(selected)}
              {selected.episodes != null && ` · ${selected.episodes} episodes`}
              {selectedMedia?.averageScore != null && ` · ${selectedMedia.averageScore}% on AniList`}
            </p>

            {/* The two ratings, side by side, never merged. */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-xs">
              <div className="rounded-lg bg-surface-2 p-3">
                <p className="text-[11px] uppercase tracking-wider text-gray-500">Your overall</p>
                <p className="mt-0.5 flex items-center gap-1 text-lg font-semibold text-white">
                  <Star className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  {selectedEntry?.showScore != null ? selectedEntry.showScore : '—'}
                </p>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <p className="text-[11px] uppercase tracking-wider text-gray-500">Episode avg</p>
                <p className="mt-0.5 text-lg font-semibold text-white">
                  {selectedRollup?.avgEpisodeScore ?? '—'}
                  {selectedRollup !== null && selectedRollup.scored > 0 && (
                    <span className="ml-1 text-xs font-normal text-gray-500">({selectedRollup.scored} rated)</span>
                  )}
                </p>
              </div>
            </div>

            {selectedRollup !== null && selected.episodes != null && selected.episodes > 0 && (
              <p className="mt-3 text-xs text-gray-400">
                {selectedRollup.watched}/{selected.episodes} episodes watched
              </p>
            )}

            {selectedMedia && <SeasonSynopsis media={selectedMedia} />}

            <Link
              to={`?${SHOW_PARAM}=${selected.id}`}
              preventScrollReset
              className="mt-4 inline-flex h-11 items-center rounded-lg border border-edge px-4 text-sm font-medium text-gray-300 transition-colors hover:bg-surface-2 hover:text-white"
            >
              Quick view &amp; bulk logging
            </Link>
          </div>
        </section>
      )}

      {/* Episodes: each cell is a door to that episode's own view. */}
      {selected && selectedMedia && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">Episodes</h2>
          <EpisodeGrid
            media={selectedMedia}
            vibes={vibes}
            onOpenEpisode={(episode) => onOpenEpisode(selected.id, episode)}
          />
        </section>
      )}

      {/* Extras */}
      {selectedId === 'extras' && extras.length > 0 && (
        <section role="tabpanel" aria-label="Extras" className="mt-3 space-y-2">
          {extras.map((entry) => (
            <Link
              key={entry.id}
              to={`?${SHOW_PARAM}=${entry.id}`}
              preventScrollReset
              className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-edge bg-surface-0 px-4 py-2.5 transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-200">{entry.title}</span>
                <span className="text-xs text-gray-500">
                  {entry.format || '—'} · {year(entry)}
                </span>
              </span>
              <span className="shrink-0 text-xs text-gray-500">Open</span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
