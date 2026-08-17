import { ChevronDown, Loader2, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { displayTitle } from '../../lib/displayTitle';
import { cn } from '../../lib/utils';
import { useSearchQuery } from '../../queries/hooks';
import { mergeIntoSeries, splitFromSeries } from '../../series/overrides';
import { useSeriesGraph } from '../../series/useSeriesGraphs';
import { useUserData, type SeriesOverrides } from '../../stores/userData';
import type { AnimeMedia } from '../../types';

/**
 * The detail modal's "Advanced" disclosure: simulcast delay and series
 * split/merge, as real UI. Replaces the old raw-ID browser-dialog text buttons.
 *
 * Both kinds of correction apply immediately — offsets are a read-time
 * transform over the query cache, and the series resolver subscribes to the
 * overrides slice — so no copy here should ever ask the user to reload.
 */

/** "+30m", "+1h 30m", "+1 day", "-15m"; 0 reads as "on time". */
export function formatOffset(minutes: number): string {
  if (minutes === 0) return 'on time';
  const sign = minutes < 0 ? '-' : '+';
  let rest = Math.abs(minutes);
  const days = Math.floor(rest / 1440);
  rest -= days * 1440;
  const hours = Math.floor(rest / 60);
  const mins = rest - hours * 60;
  const parts: string[] = [];
  if (days > 0) parts.push(days === 1 ? '1 day' : `${days} days`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return sign + parts.join(' ');
}

/**
 * Pure inverses for the override actions the store doesn't provide directly
 * (splitShow/mergeShow only add). Exported for tests; the component applies
 * them via useUserData.getState().setOverrides at click time so an Undo always
 * operates on the overrides as they are then, not as they were captured.
 */
export function withoutSplit(overrides: SeriesOverrides, showId: number): SeriesOverrides {
  return { ...overrides, splits: overrides.splits.filter((id) => id !== showId) };
}

export function withMergeTarget(
  overrides: SeriesOverrides,
  showId: number,
  targetSeriesId: number | undefined,
): SeriesOverrides {
  const merges = { ...overrides.merges };
  if (targetSeriesId === undefined) delete merges[showId];
  else merges[showId] = targetSeriesId;
  return { ...overrides, merges };
}

const OFFSET_PRESETS = [
  { label: 'On time', minutes: 0 },
  { label: '+30m', minutes: 30 },
  { label: '+1h', minutes: 60 },
  { label: '+1 day', minutes: 1440 },
];

const SEARCH_DEBOUNCE_MS = 350;
const MAX_RESULTS = 8;

interface ShowAdvancedPanelProps {
  anime: AnimeMedia;
}

export function ShowAdvancedPanel({ anime }: ShowAdvancedPanelProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="border-t border-edge pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-11 w-full items-center gap-2 rounded-field px-1 text-left text-sm font-medium text-fg-faint transition-colors hover:text-fg-secondary"
      >
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', !open && '-rotate-90')}
          aria-hidden="true"
        />
        Advanced
      </button>
      {/* Body is mounted only while open, so the franchise fetch and the
          search machinery cost nothing when the disclosure stays closed. */}
      {open && (
        <div id={panelId}>
          <AdvancedPanelBody anime={anime} />
        </div>
      )}
    </div>
  );
}

function AdvancedPanelBody({ anime }: ShowAdvancedPanelProps) {
  const offset = useUserData((s) => s.offsets[anime.id] ?? 0);
  const setOffset = useUserData((s) => s.setOffset);
  const overrides = useUserData((s) => s.overrides);

  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const applyOffset = (minutes: number) => {
    const previous = offset;
    if (minutes === previous) return;
    setOffset(anime.id, minutes);
    toast(minutes === 0 ? 'Countdown reset to on time' : `Countdown shifted ${formatOffset(minutes)}`, {
      action: { label: 'Undo', onClick: () => useUserData.getState().setOffset(anime.id, previous) },
    });
  };

  const applyCustom = (e: FormEvent) => {
    e.preventDefault();
    const parsed = Math.round(Number(customValue));
    if (customValue.trim() === '' || !Number.isFinite(parsed)) return;
    applyOffset(parsed);
    setCustomValue('');
  };

  // Franchise context, so split/merge decisions are made against real names
  // instead of blind ids.
  const graph = useSeriesGraph(anime.id);
  const contextLine = graph.isPending
    ? 'Resolving franchise…'
    : graph.isError
      ? 'Franchise could not be resolved right now.'
      : graph.data && graph.data.entries.length > 1
        ? `Part of: ${graph.data.title} (${graph.data.entries.length} entries)`
        : 'Not grouped with any other entries.';

  const isSplit = overrides.splits.includes(anime.id);
  const mergedInto = overrides.merges[anime.id];

  const handleSplit = () => {
    splitFromSeries(anime.id);
    toast('Marked as a standalone series', {
      action: {
        label: 'Undo',
        onClick: () => {
          const store = useUserData.getState();
          store.setOverrides(withoutSplit(store.overrides, anime.id));
        },
      },
    });
  };

  const handleUnsplit = () => {
    const store = useUserData.getState();
    store.setOverrides(withoutSplit(store.overrides, anime.id));
    toast('Split removed — series regrouped', {
      action: { label: 'Undo', onClick: () => splitFromSeries(anime.id) },
    });
  };

  const handleUnmerge = () => {
    const store = useUserData.getState();
    const previous = store.overrides.merges[anime.id];
    if (previous === undefined) return;
    store.setOverrides(withMergeTarget(store.overrides, anime.id, undefined));
    toast('Merge removed', {
      action: { label: 'Undo', onClick: () => mergeIntoSeries(anime.id, previous) },
    });
  };

  // Merge picker: debounced title search, poster + title + year rows, then an
  // explicit confirm step. No raw-ID entry.
  const [mergeQuery, setMergeQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [pendingTarget, setPendingTarget] = useState<AnimeMedia | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(mergeQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [mergeQuery]);

  const search = useSearchQuery(debouncedQuery);
  const searching = debouncedQuery.trim().length > 0 && search.isPending;

  const results = useMemo(() => {
    const members = new Set(graph.data?.entries.map((entry) => entry.id) ?? []);
    members.add(anime.id);
    return (search.data ?? []).filter((m) => !members.has(m.id)).slice(0, MAX_RESULTS);
  }, [search.data, graph.data, anime.id]);

  const handleMergeConfirm = () => {
    const target = pendingTarget;
    if (target === null) return;
    const previous = useUserData.getState().overrides.merges[anime.id];
    mergeIntoSeries(anime.id, target.id);
    setPendingTarget(null);
    setMergeQuery('');
    toast(`Merged into ${displayTitle(target)}`, {
      action: {
        label: 'Undo',
        onClick: () => {
          const store = useUserData.getState();
          store.setOverrides(withMergeTarget(store.overrides, anime.id, previous));
        },
      },
    });
  };

  return (
    <div className="mt-1 space-y-5 rounded-inner border border-edge bg-surface-1 p-4">
      {/* ---- Simulcast delay ---- */}
      <section className="space-y-3">
        <div>
          <h4 className="text-sm font-medium text-fg-secondary">Simulcast delay</h4>
          <p className="mt-1 text-xs text-fg-faint">
            Airs later for you? Shift this show's countdown. Applies immediately, everywhere.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Simulcast delay presets">
          {OFFSET_PRESETS.map((preset) => {
            const active = offset === preset.minutes;
            return (
              <button
                key={preset.minutes}
                type="button"
                onClick={() => applyOffset(preset.minutes)}
                aria-pressed={active}
                className={cn(
                  'h-11 rounded-field border px-3.5 text-sm font-medium transition-colors',
                  active
                    ? 'border-accent-500/60 bg-accent-600/20 text-accent-300'
                    : 'border-edge bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg',
                )}
              >
                {preset.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            aria-expanded={customOpen}
            className={cn(
              'h-11 rounded-field border px-3.5 text-sm font-medium transition-colors',
              customOpen
                ? 'border-accent-500/60 bg-accent-600/20 text-accent-300'
                : 'border-edge bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg',
            )}
          >
            Custom&hellip;
          </button>
        </div>
        {customOpen && (
          <form onSubmit={applyCustom} className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              step={1}
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              placeholder="Minutes"
              aria-label="Custom delay in minutes"
              className="h-11 w-28 rounded-field border border-edge bg-surface-2 px-3 text-sm text-fg-secondary placeholder-fg-faint focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-ring/40"
            />
            <Button type="submit" variant="primary">
              Apply
            </Button>
          </form>
        )}
        <p className="text-xs text-fg-faint">
          Currently <span className="font-medium text-fg-secondary">{formatOffset(offset)}</span>.
        </p>
      </section>

      {/* ---- Series tools ---- */}
      <section className="space-y-3 border-t border-edge pt-4">
        <div>
          <h4 className="text-sm font-medium text-fg-secondary">Series grouping</h4>
          <p className="mt-1 text-xs text-fg-faint">{contextLine}</p>
        </div>

        {isSplit && (
          <div className="flex items-center justify-between gap-3 rounded-field border border-accent-500/30 bg-accent-600/10 px-3 py-1.5">
            <p className="text-xs text-accent-300">You marked this entry as standalone.</p>
            <Button variant="ghost" className="shrink-0" onClick={handleUnsplit}>
              Remove split
            </Button>
          </div>
        )}

        {mergedInto !== undefined && (
          <div className="flex items-center justify-between gap-3 rounded-field border border-accent-500/30 bg-accent-600/10 px-3 py-1.5">
            <p className="text-xs text-accent-300">You merged this entry into another series.</p>
            <Button variant="ghost" className="shrink-0" onClick={handleUnmerge}>
              Remove merge
            </Button>
          </div>
        )}

        {!isSplit && (
          <div className="rounded-field bg-surface-2 p-3">
            <p className="text-sm text-fg-secondary">Not part of this series?</p>
            <p className="mt-0.5 text-xs text-fg-faint">
              Treats this entry as its own standalone series everywhere, immediately.
            </p>
            <Button variant="secondary" className="mt-2" onClick={handleSplit}>
              Split into standalone series
            </Button>
          </div>
        )}

        <div className="space-y-2 rounded-field bg-surface-2 p-3">
          <p className="text-sm text-fg-secondary">Belongs to another series?</p>
          <p className="text-xs text-fg-faint">
            Search for the series to merge into &mdash; the change takes effect immediately.
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" aria-hidden="true" />
            <input
              type="text"
              value={mergeQuery}
              onChange={(e) => {
                setMergeQuery(e.target.value);
                setPendingTarget(null);
              }}
              placeholder="Search anime by title"
              aria-label="Search for a series to merge into"
              className="h-11 w-full rounded-field border border-edge bg-surface-1 pl-9 pr-3 text-sm text-fg-secondary placeholder-fg-faint focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-ring/40"
            />
          </div>

          {pendingTarget !== null ? (
            <div className="flex flex-wrap items-center gap-3 rounded-field border border-accent-500/40 bg-accent-600/10 p-2">
              <img
                src={pendingTarget.coverImage.large}
                alt=""
                className="h-12 w-9 shrink-0 rounded bg-surface-3 object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg-secondary">
                  Merge into {displayTitle(pendingTarget)}?
                </p>
                <p className="text-xs text-fg-faint">Groups this entry under that franchise everywhere.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="primary" onClick={handleMergeConfirm}>
                  Merge
                </Button>
                <Button variant="secondary" onClick={() => setPendingTarget(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : searching ? (
            <div className="flex min-h-11 items-center gap-2 px-2 text-xs text-fg-faint">
              <Loader2 className="h-4 w-4 animate-spin text-accent-400" aria-hidden="true" />
              Searching&hellip;
            </div>
          ) : search.isError ? (
            <p className="px-2 text-xs text-danger-300">Search failed &mdash; try again in a moment.</p>
          ) : debouncedQuery.trim().length > 0 && results.length === 0 ? (
            <p className="px-2 text-xs text-fg-faint">No other series found for that title.</p>
          ) : results.length > 0 ? (
            <ul className="space-y-1">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setPendingTarget(m)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-field px-2 py-1.5 text-left transition-colors hover:bg-surface-3"
                  >
                    <img
                      src={m.coverImage.large}
                      alt=""
                      className="h-12 w-9 shrink-0 rounded bg-surface-3 object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg-secondary">{displayTitle(m)}</span>
                      {m.startDate?.year != null && (
                        <span className="block text-xs text-fg-faint">{m.startDate.year}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );
}
