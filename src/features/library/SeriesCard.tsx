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
      className="flex flex-col overflow-hidden rounded-xl bg-[#1c1c1f] border border-gray-800 transition-all hover:border-gray-700"
    >
      <div
        className="flex p-4 gap-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-lg font-bold text-white mb-1">{series.title}</h3>

          <div className="flex items-center gap-3 text-sm text-gray-400">
            {avgScore != null && (
              <div className="flex items-center gap-1 text-yellow-400 font-medium">
                <Star className="h-3.5 w-3.5 fill-current" />
                {avgScore.toFixed(1)}
              </div>
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
          </div>

          {totalAired > 0 && (
            <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-800">
              <div
                className={cn(
                  "h-full transition-all duration-500",
                  derivedStatus === 'completed' ? "bg-emerald-500" : "bg-accent-500"
                )}
                style={{ width: `${Math.min(100, progressPercent)}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center">
          <button
            className="p-2 text-gray-500 hover:text-white transition-colors"
            aria-label={expanded ? 'Collapse seasons' : 'Expand seasons'}
          >
            {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-gray-800 bg-[#2a2a2d]/30"
          >
            <div className="flex flex-col divide-y divide-gray-800/50 p-2">
              {displaySeasons.map((season) => {
                const l = libraryMap.get(season.id);
                return (
                  <div key={season.id} className="flex items-center justify-between py-2 px-2 hover:bg-gray-800/50 rounded-lg">
                    <div className="flex flex-col min-w-0 pr-4">
                      <span
                        className="truncate text-sm font-medium text-gray-200 cursor-pointer hover:underline hover:text-accent-400"
                        onClick={(e) => { e.stopPropagation(); onAnimeSelect?.(season.id); }}
                      >
                        {season.seasonLabel}
                      </span>
                      <span className="text-xs text-gray-500 truncate">{season.title}</span>
                    </div>

                    <div className="flex items-center gap-3 text-sm whitespace-nowrap">
                      {l ? (
                        <>
                          <span className="text-gray-400 w-16 text-right">{logs.filter(log => log.showId === l.showId).length} / {season.episodes || '?'}</span>
                          <select
                            value={l.status}
                            aria-label={`Status for ${season.seasonLabel}`}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setSeasonStatus(l, e.target.value as LibraryStatus)}
                            className="h-8 rounded-md border border-edge bg-surface-3 px-2 text-xs font-medium text-gray-200 focus:border-accent-500 focus:outline-none"
                          >
                            {LIBRARY_STATUS_ORDER.map((s) => (
                              <option key={s} value={s}>{LIBRARY_STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                          <span className="w-8 text-right text-yellow-400">{l.showScore || '-'}</span>
                          <LibraryStatusMenu
                            showId={season.id}
                            align="end"
                            renderTrigger={({ inLibrary }) => (
                              <button className="flex h-8 w-8 items-center justify-center rounded-md text-accent-400 hover:bg-accent-500/10 hover:text-accent-300 transition-colors">
                                <Bookmark className="h-4 w-4" fill={inLibrary ? "currentColor" : "none"} />
                              </button>
                            )}
                          />
                        </>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); addSeasonToLibrary(season.id); }}
                          className="flex items-center gap-1 text-xs font-medium text-accent-400 hover:text-accent-300 bg-accent-500/10 hover:bg-accent-500/20 px-2 py-1 rounded-md transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add to List
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {nextAvailable && derivedStatus === 'completed' && (
              <div className="p-3 m-2 mt-0 bg-accent-500/10 border border-accent-500/20 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-accent-300">Next season available!</p>
                  <p className="text-xs text-accent-400/70">{nextAvailable.seasonLabel}</p>
                </div>
                <button
                  onClick={() => addSeasonToLibrary(nextAvailable!.id)}
                  className="px-3 py-1.5 bg-accent-600 text-white text-xs font-medium rounded-md hover:bg-accent-500 transition-colors"
                >
                  Add to Library
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
