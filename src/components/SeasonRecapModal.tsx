import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimeMedia, EpisodeLog } from '../types';
import { X, Trophy, Clock, TrendingUp } from 'lucide-react';

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
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] p-4 md:p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <div className="relative flex max-h-[85vh] flex-col overflow-hidden rounded-2xl bg-[#1c1c1f] text-gray-200 shadow-2xl border border-purple-500/30">
            
            <div className="bg-purple-900/50 p-6 pt-10 text-center relative">
              <Dialog.Close className="absolute right-4 top-4 rounded-lg bg-black/20 p-1.5 text-white hover:bg-black/40 transition-colors">
                <X className="h-4 w-4" />
              </Dialog.Close>
              <h2 className="text-3xl font-bold tracking-tight text-white mb-1">Season Recap</h2>
              <p className="text-purple-200 text-sm">Your anime journey this season</p>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
              {/* Highlight Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-[#2a2a2d] p-4 border border-gray-800 flex flex-col items-center text-center">
                  <div className="rounded-full bg-yellow-500/20 p-3 mb-2">
                    <Trophy className="h-6 w-6 text-yellow-500" />
                  </div>
                  <span className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Seasonal MVP</span>
                  <span className="font-semibold text-white line-clamp-1">{recapData.mvp?.title.english || recapData.mvp?.title.userPreferred || 'None'}</span>
                  {recapData.highestScore > 0 && <span className="text-yellow-400 text-sm mt-1">{recapData.highestScore.toFixed(1)} avg</span>}
                </div>
                
                <div className="rounded-xl bg-[#2a2a2d] p-4 border border-gray-800 flex flex-col items-center text-center">
                  <div className="rounded-full bg-purple-500/20 p-3 mb-2">
                    <Clock className="h-6 w-6 text-purple-400" />
                  </div>
                  <span className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Time Watched</span>
                  <span className="font-semibold text-white text-2xl">{recapData.totalHours.toFixed(1)}h</span>
                </div>
              </div>

              {recapData.biggestJump.show && (
                <div className="rounded-xl bg-purple-900/20 p-4 border border-purple-500/30 flex items-center gap-4">
                  <div className="rounded-full bg-purple-500/20 p-2 shrink-0">
                    <TrendingUp className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-xs text-purple-300 font-semibold mb-0.5">Biggest Score Jump (+{recapData.biggestJump.jump})</div>
                    <div className="text-sm text-white font-medium">{recapData.biggestJump.show.title.english || recapData.biggestJump.show.title.userPreferred}</div>
                  </div>
                </div>
              )}

              {/* Sparklines */}
              {recapData.showStats.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2">Episode Scores</h3>
                  {recapData.showStats.slice(0, 5).map(stat => (
                    <div key={stat.anime.id} className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-300 font-medium truncate pr-2">{stat.anime.title.english || stat.anime.title.userPreferred}</span>
                        <span className="text-gray-500 shrink-0">{stat.avgScore.toFixed(1)}</span>
                      </div>
                      <div className="flex h-6 items-end gap-0.5 opacity-80 hover:opacity-100 transition-opacity">
                        {stat.scoredLogs.map(l => (
                          <div 
                            key={l.episodeNumber}
                            className="w-full bg-purple-500 rounded-t-sm transition-all hover:bg-purple-400"
                            style={{ height: `${(l.score! / 10) * 100}%` }}
                            title={`Ep ${l.episodeNumber}: ${l.score}/10`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
