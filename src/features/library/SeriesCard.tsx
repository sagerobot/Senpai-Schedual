import React, { useState } from 'react';
import { Star, ChevronDown, ChevronUp, Plus, Bookmark } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { SeriesGraph, SeriesEntry } from '../../series/labeling';
import { EpisodeLog, LibraryEntry, LibraryStatus } from '../../types';
import { LIBRARY_STATUS_LABELS, LIBRARY_STATUS_ORDER } from '../../lib/status';
import { LibraryStatusMenu } from '../../components/LibraryStatusMenu';
import { useUserData } from '../../stores/userData';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';

interface SeriesCardProps {
  key?: React.Key;
  series: SeriesGraph;
  libraryEntries: LibraryEntry[];
  logs: EpisodeLog[];
  onAnimeSelect?: (id: number) => void;
}

/** Add a season as Planning, with Undo. Shared by the row button and the banner. */
function addSeasonToLibrary(id: number) {
  useUserData.getState().addToLibrary(id, 'plan_to_watch');
  toast('Added to Library — Planning', {
    action: { label: 'Undo', onClick: () => useUserData.getState().removeFromLibrary(id) },
  });
}

function setSeasonStatus(entry: LibraryEntry, next: LibraryStatus) {
  if (next === entry.status) return;
  const previous = entry.status;
  useUserData.getState().setStatus(entry.showId, next);
  toast(`Moved to ${LIBRARY_STATUS_LABELS[next]}`, {
    action: { label: 'Undo', onClick: () => useUserData.getState().setStatus(entry.showId, previous) },
  });
}

export function SeriesCard({ series, libraryEntries, logs, onAnimeSelect }: SeriesCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Filter out attachments unless they are in the library
  const displaySeasons = series.entries.filter(e => {
    const inLibrary = libraryEntries.some(l => l.showId === e.id);
    return !e.isAttachment || inLibrary;
  });

  const libraryMap = new Map(libraryEntries.map(l => [l.showId, l]));

  let totalWatched = 0;
  let totalAired = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let isWatching = false;
  let isCompleted = true;
  let latestUpdated = 0;
  let derivedStatus: LibraryStatus = 'plan_to_watch';

  displaySeasons.forEach(season => {
    const l = libraryMap.get(season.id);
    if (l) {
      const epCount = logs.filter(log => log.showId === l.showId).length;
      totalWatched += epCount;
      totalAired += season.episodes || epCount;
      if (l.showScore) {
        scoreSum += l.showScore;
        scoreCount++;
      }
      if (l.status === 'watching') isWatching = true;
      if (l.status !== 'completed') isCompleted = false;
      if (l.updatedAt && l.updatedAt > latestUpdated) {
        latestUpdated = l.updatedAt;
        if (!isWatching) derivedStatus = l.status;
      }
    } else {
      isCompleted = false;
    }
  });

  if (isWatching) derivedStatus = 'watching';
  else if (isCompleted && displaySeasons.length > 0) derivedStatus = 'completed';

  const avgScore = scoreCount > 0 ? scoreSum / scoreCount : null;
  const progressPercent = totalAired > 0 ? (totalWatched / totalAired) * 100 : 0;

  // Next available un-added season
  let nextAvailable: SeriesEntry | null = null;
  for (const s of displaySeasons) {
    if (!libraryMap.has(s.id)) {
      nextAvailable = s;
      break;
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col overflow-hidden rounded-inner bg-surface-1 border border-edge transition-all hover:border-edge-strong"
    >
      {/* One control for the whole header row: a real disclosure button. The
          chevron is decoration inside it, not a second target that double-fires. */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-4 p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex-1 min-w-0">
          <span className="mb-1 block truncate text-lg font-bold text-fg">{series.title}</span>

          <span className="flex items-center gap-3 text-sm text-fg-muted">
            {avgScore != null && (
              <span className="flex items-center gap-1 text-warning-400 font-medium">
                <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                {avgScore.toFixed(1)}
              </span>
            )}
            <span>{LIBRARY_STATUS_LABELS[derivedStatus]}</span>
            <span>•</span>
            <span>{displaySeasons.length} {displaySeasons.length === 1 ? 'Season' : 'Seasons'}</span>
            {totalAired > 0 && (
              <>
                <span>•</span>
                <span>{totalWatched} / {totalAired} Eps</span>
              </>
            )}
          </span>

          {totalAired > 0 && (
            <span className="mt-3 block h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-2">
              <span
                className={cn(
                  "block h-full transition-all duration-500",
                  derivedStatus === 'completed' ? "bg-success-500" : "bg-accent-500"
                )}
                style={{ width: `${Math.min(100, progressPercent)}%` }}
              />
            </span>
          )}
        </span>

        <span className="flex shrink-0 items-center p-2 text-fg-muted">
          {expanded ? <ChevronUp className="h-5 w-5" aria-hidden="true" /> : <ChevronDown className="h-5 w-5" aria-hidden="true" />}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-edge bg-surface-3/30"
          >
            <div className="flex flex-col divide-y divide-edge/50 p-2">
              {displaySeasons.map((season) => {
                const l = libraryMap.get(season.id);
                return (
                  <div key={season.id} className="flex items-center justify-between py-2 px-2 hover:bg-surface-3/50 rounded-field">
                    <div className="flex flex-col min-w-0 pr-4">
                      <button
                        type="button"
                        onClick={() => onAnimeSelect?.(season.id)}
                        aria-label={`Open ${season.title}`}
                        className="truncate text-left text-sm font-medium text-fg-secondary hover:underline hover:text-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {season.seasonLabel}
                      </button>
                      <span className="text-xs text-fg-muted truncate">{season.title}</span>
                    </div>

                    <div className="flex items-center gap-3 text-sm whitespace-nowrap">
                      {l ? (
                        <>
                          <span className="text-fg-muted w-16 text-right">{logs.filter(log => log.showId === l.showId).length} / {season.episodes || '?'}</span>
                          <Select
                            value={l.status}
                            aria-label={`Status for ${season.seasonLabel}`}
                            onChange={(e) => setSeasonStatus(l, e.target.value as LibraryStatus)}
                            className="shrink-0"
                          >
                            {LIBRARY_STATUS_ORDER.map((s) => (
                              <option key={s} value={s}>{LIBRARY_STATUS_LABELS[s]}</option>
                            ))}
                          </Select>
                          <span className="w-8 text-right text-warning-400">{l.showScore || '-'}</span>
                          <LibraryStatusMenu
                            showId={season.id}
                            align="end"
                            renderTrigger={({ inLibrary }) => (
                              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-xs text-accent-400 hover:bg-accent-500/10 hover:text-accent-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                <Bookmark className="h-4 w-4" fill={inLibrary ? "currentColor" : "none"} aria-hidden="true" />
                              </button>
                            )}
                          />
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addSeasonToLibrary(season.id)}
                          className="flex h-11 items-center gap-1 text-xs font-medium text-accent-400 hover:text-accent-300 bg-accent-500/10 hover:bg-accent-500/20 px-3 rounded-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add to List
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {nextAvailable && derivedStatus === 'completed' && (
              <div className="p-3 m-2 mt-0 bg-accent-500/10 border border-accent-500/20 rounded-field flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-accent-300">Next season available!</p>
                  <p className="text-xs text-accent-400/70">{nextAvailable.seasonLabel}</p>
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => addSeasonToLibrary(nextAvailable!.id)}
                  className="shrink-0"
                >
                  Add to Library
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
