import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { VibesLookup } from '../../queries/vibes';
import { SHOW_PARAM } from '../../routes/showParam';
import { cn } from '../../lib/utils';
import type { AtlasState } from './useAtlas';
import { showHref } from './rooms';
import { EpisodeGrid } from './EpisodeGrid';

/**
 * The Episodes room: the sentiment-tinted grid, one season at a time. Each
 * cell opens `?ep=` — the permalink deep-links here from any room. The
 * grid-plus-ledger hybrid is the room's phase-3 depth; today it is the grid,
 * relocated, so nothing the old page could do is lost.
 */

interface EpisodesRoomProps {
  atlas: AtlasState;
  vibes: VibesLookup;
  reveal: boolean;
  onOpenEpisode: (memberId: number, episode: number) => void;
}

export function EpisodesRoom({ atlas, vibes, reveal, onOpenEpisode }: EpisodesRoomProps) {
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<number | 'extras' | null>(null);
  // A selection that no longer names a season (franchise re-resolved, Back
  // across franchises) falls through to the continue target instead of
  // short-circuiting every panel into a blank page.
  const valid =
    selectedId === 'extras'
      ? atlas.extras.length > 0
      : selectedId !== null && atlas.seasons.some((e) => e.id === selectedId);
  const effectiveId = (valid ? selectedId : null) ?? atlas.target?.memberId ?? atlas.seasons.at(-1)?.id ?? 'extras';
  const selected = typeof effectiveId === 'number' ? atlas.seasons.find((e) => e.id === effectiveId) : undefined;
  const selectedMedia = selected !== undefined ? atlas.mediaById.get(selected.id) : undefined;

  return (
    <div className="mt-4">
      <div role="group" aria-label="Seasons" className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {atlas.seasons.map((entry) => (
          <button
            key={entry.id}
            aria-pressed={effectiveId === entry.id}
            onClick={() => setSelectedId(entry.id)}
            className={cn(
              'h-11 shrink-0 whitespace-nowrap rounded-field border px-4 text-sm font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              effectiveId === entry.id
                ? 'border-accent-500/40 bg-accent-600/15 text-accent-300'
                : 'border-edge text-fg-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            {entry.seasonLabel}
          </button>
        ))}
        {atlas.extras.length > 0 && (
          <button
            aria-pressed={effectiveId === 'extras'}
            onClick={() => setSelectedId('extras')}
            className={cn(
              'h-11 shrink-0 whitespace-nowrap rounded-field border px-4 text-sm font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              effectiveId === 'extras'
                ? 'border-accent-500/40 bg-accent-600/15 text-accent-300'
                : 'border-edge text-fg-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            Extras
          </button>
        )}
      </div>

      {selected !== undefined && selectedMedia !== undefined && (
        <section aria-label={selected.seasonLabel} className="mt-2">
          <EpisodeGrid
            media={selectedMedia}
            vibes={vibes}
            sealAfter={reveal ? undefined : atlas.progress.get(selected.id)?.maxWatched ?? 0}
            onOpenEpisode={(episode) => onOpenEpisode(selected.id, episode)}
          />
        </section>
      )}
      {selected !== undefined && selectedMedia === undefined && (
        <p className="mt-4 rounded-inner border border-edge bg-surface-0 p-5 text-center text-sm text-fg-muted">
          Still fetching this season's episode data…
        </p>
      )}

      {effectiveId === 'extras' && atlas.extras.length > 0 && (
        <section aria-label="Extras" className="mt-2 space-y-2">
          {atlas.extras.map((entry) => (
            <Link
              key={entry.id}
              to={showHref(searchParams, SHOW_PARAM, entry.id)}
              preventScrollReset
              className="flex min-h-11 items-center justify-between gap-3 rounded-field border border-edge bg-surface-1 px-4 py-2.5 transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-fg-secondary">{entry.title}</span>
                <span className="text-xs text-fg-faint">
                  {entry.format || '—'} · {entry.startDate?.year ?? '—'}
                </span>
              </span>
              <span className="shrink-0 text-xs text-fg-faint">Open</span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
