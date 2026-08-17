import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimeMedia, EpisodeLog } from '../../types';
import { Trophy, Clock, TrendingUp } from 'lucide-react';
import { DialogShell } from '../../components/ui/DialogShell';
import { Tooltip } from '../../components/ui/Tooltip';
import { displayTitle } from '../../lib/displayTitle';

interface SeasonRecapModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: EpisodeLog[];
  animeList: AnimeMedia[];
  favorites: number[];
}

export function SeasonRecapModal({ isOpen, onClose, logs, animeList, favorites }: SeasonRecapModalProps) {
  const recapData = React.useMemo(() => {
    const watchedLogs = logs.filter(l => favorites.includes(l.showId));
    const totalWatched = watchedLogs.length;
    const totalHours = (totalWatched * 24) / 60; // Approx 24 mins per ep

    const showStats = favorites.map(id => {
      const anime = animeList.find(a => a.id === id);
      if (!anime) return null;
      const showLogs = watchedLogs.filter(l => l.showId === id).sort((a, b) => a.episodeNumber - b.episodeNumber);
      const scoredLogs = showLogs.filter(l => l.score != null);
      const avgScore = scoredLogs.length > 0 ? scoredLogs.reduce((s, l) => s + l.score!, 0) / scoredLogs.length : 0;
      
      let maxJump = 0;
      for (let i = 1; i < scoredLogs.length; i++) {
        const jump = scoredLogs[i].score! - scoredLogs[i-1].score!;
        if (jump > maxJump) maxJump = jump;
      }

      return { anime, avgScore, maxJump, scoredLogs };
    }).filter((s): s is NonNullable<typeof s> => s !== null && s.scoredLogs.length > 0);

    let mvp: AnimeMedia | null = null;
    let highestScore = -1;
    let biggestJump: { show: AnimeMedia | null; jump: number } = { show: null, jump: 0 };

    for (const stat of showStats) {
      if (stat.avgScore > highestScore) {
        highestScore = stat.avgScore;
        mvp = stat.anime;
      }
      if (stat.maxJump > biggestJump.jump) {
        biggestJump = { show: stat.anime, jump: stat.maxJump };
      }
    }

    return { totalHours, mvp, highestScore, biggestJump, showStats };
  }, [logs, animeList, favorites]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogShell maxWidth="max-w-lg" panelClassName="border-accent-500/30">
        <div className="bg-accent-700/40 p-6 pt-10 text-center">
          <Dialog.Title className="text-3xl font-bold tracking-tight text-fg mb-1">Season Recap</Dialog.Title>
          <Dialog.Description className="text-accent-300 text-sm">Your anime journey this season</Dialog.Description>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
              {/* Highlight Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-inner bg-surface-3 p-4 border border-edge flex flex-col items-center text-center">
                  <div className="rounded-full bg-warning-500/20 p-3 mb-2">
                    <Trophy className="h-6 w-6 text-warning-500" />
                  </div>
                  <span className="text-xs text-fg-muted uppercase font-bold tracking-wider mb-1">Seasonal MVP</span>
                  <span className="font-semibold text-fg line-clamp-1">{recapData.mvp ? displayTitle(recapData.mvp) : 'None'}</span>
                  {recapData.highestScore > 0 && <span className="text-warning-400 text-sm mt-1">{recapData.highestScore.toFixed(1)} avg</span>}
                </div>

                <div className="rounded-inner bg-surface-3 p-4 border border-edge flex flex-col items-center text-center">
                  <div className="rounded-full bg-accent-500/20 p-3 mb-2">
                    <Clock className="h-6 w-6 text-accent-400" />
                  </div>
                  <span className="text-xs text-fg-muted uppercase font-bold tracking-wider mb-1">Time Watched</span>
                  <span className="font-semibold text-fg text-2xl">{recapData.totalHours.toFixed(1)}h</span>
                </div>
              </div>

              {recapData.biggestJump.show && (
                <div className="rounded-inner bg-accent-700/15 p-4 border border-accent-500/30 flex items-center gap-4">
                  <div className="rounded-full bg-accent-500/20 p-2 shrink-0">
                    <TrendingUp className="h-5 w-5 text-accent-400" />
                  </div>
                  <div>
                    <div className="text-xs text-accent-300 font-semibold mb-0.5">Biggest Score Jump (+{recapData.biggestJump.jump})</div>
                    <div className="text-sm text-fg font-medium">{displayTitle(recapData.biggestJump.show)}</div>
                  </div>
                </div>
              )}

              {/* Sparklines */}
              {recapData.showStats.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-fg-secondary uppercase tracking-wider mb-2">Episode Scores</h3>
                  {recapData.showStats.slice(0, 5).map(stat => (
                    <div key={stat.anime.id} className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-fg-secondary font-medium truncate pr-2">{displayTitle(stat.anime)}</span>
                        <span className="text-fg-faint shrink-0">{stat.avgScore.toFixed(1)}</span>
                      </div>
                      <div className="flex h-6 items-end gap-0.5 opacity-80 hover:opacity-100 transition-opacity">
                        {stat.scoredLogs.map(l => (
                          <Tooltip
                            key={l.episodeNumber}
                            label={`Ep ${l.episodeNumber}: ${l.score}/10`}
                            className="h-full w-full items-end"
                          >
                            <div
                              className="w-full bg-accent-500 rounded-t-sm transition-colors hover:bg-accent-400"
                              style={{ height: `${(l.score! / 10) * 100}%` }}
                            />
                          </Tooltip>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
        </div>
      </DialogShell>
    </Dialog.Root>
  );
}
