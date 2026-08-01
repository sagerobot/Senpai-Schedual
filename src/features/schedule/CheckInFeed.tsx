import React, { useMemo, useState, memo } from 'react';
import { AnimeMedia, EpisodeLog } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Star, Play, Check, Bookmark, ChevronDown, CheckCircle2, Info, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { displayTitle } from '../../lib/displayTitle';

interface CheckInFeedProps {
  animeList: AnimeMedia[];
  favorites: number[];
  logs: EpisodeLog[];
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onToggleFavorite: (id: number) => void;
  onAnimeSelect?: (anime: AnimeMedia) => void;
}

export function CheckInFeed({ animeList, favorites, logs, onLog, onToggleFavorite, onAnimeSelect }: CheckInFeedProps) {
  const drops = useMemo(() => {
    const recent: { anime: AnimeMedia; episode: number; airedAt: number; score: number | null, maxWatched: number, userAvgScore: number | null }[] = [];
    const now = Math.floor(Date.now() / 1000);
    
    for (const anime of animeList) {
      if (!favorites.includes(anime.id)) continue;
      
      if (anime.nextAiringEpisode && anime.nextAiringEpisode.episode > 1) {
        // Estimate previous episode air time (assume 7 days)
        const prevAirTime = anime.nextAiringEpisode.airingAt - 7 * 24 * 3600;
        const timeSinceAir = now - prevAirTime;
        
        // If it aired within the last 24 hours
        if (timeSinceAir >= 0 && timeSinceAir <= 24 * 3600) {
          const episodeNum = anime.nextAiringEpisode.episode - 1;
          const showLogs = logs.filter(l => l.showId === anime.id);
          const log = showLogs.find(l => l.episodeNumber === episodeNum);
          if (!log) {
            const maxWatched = showLogs.length > 0 ? Math.max(...showLogs.map(l => l.episodeNumber)) : 0;
            const ratedLogs = showLogs.filter(l => l.score !== null && l.score !== undefined);
            const userAvgScore = ratedLogs.length > 0 ? ratedLogs.reduce((acc, l) => acc + (l.score ?? 0), 0) / ratedLogs.length : null;
            recent.push({ anime, episode: episodeNum, airedAt: prevAirTime, score: null, maxWatched, userAvgScore });
          }
        }
      }
    }
    return recent.sort((a, b) => b.airedAt - a.airedAt);
  }, [animeList, favorites, logs]);

  if (drops.length === 0) return null;

  return (
    <div className="mb-12">
      <h2 className="mb-6 text-xl font-bold tracking-tight text-white flex items-center gap-3">
        <span className="relative flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-purple-500"></span>
        </span>
        Today's Drops
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <AnimatePresence>
          {drops.map((drop) => (
            <CheckInItem
              key={`${drop.anime.id}-${drop.episode}`}
              drop={drop}
              onLog={onLog}
              onToggleFavorite={onToggleFavorite}
              onAnimeSelect={onAnimeSelect}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

const CheckInItem = memo(function CheckInItem({ drop, onLog, onToggleFavorite, onAnimeSelect }: {
  drop: any;
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onToggleFavorite: (id: number) => void;
  onAnimeSelect?: (anime: AnimeMedia) => void;
}) {
  const anime = drop.anime;
  const hasBanner = !!(anime.bannerImage || anime.trailer?.thumbnail);
  const bgImage = anime.bannerImage || anime.trailer?.thumbnail || anime.coverImage.extraLarge || anime.coverImage.large;
  const studio = anime.studios?.nodes?.[0]?.name || "Unknown Studio";
  
  const date = new Date(drop.airedAt * 1000);
  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  
  const watchLink = anime.externalLinks?.find((l: any) => 
    ['Crunchyroll', 'Netflix', 'Hulu', 'Amazon Prime Video', 'HIDIVE', 'Disney Plus', 'Bilibili TV', 'CustomSource'].includes(l.site)
  )?.url || anime.externalLinks?.[0]?.url;

  const maxWatched = drop.maxWatched || 0;
  const userAvgScore = drop.userAvgScore;
  const todayEp = drop.episode;
  
  const isCaughtUp = maxWatched >= todayEp - 1;
  const nextEp = isCaughtUp ? todayEp : maxWatched + 1;
  const targetEp = nextEp;
  const [showDropdown, setShowDropdown] = useState(false);

  const handleRateAndWatch = (s: number | null) => {
    onLog(anime.id, targetEp, s);
  };

  const seasonMatch = anime.title.english?.match(/Season (\d+)/i) || anime.title.userPreferred?.match(/Season (\d+)/i);
  const seasonText = seasonMatch ? `Season ${seasonMatch[1]}` : "Series";
  const totalEpisodes = anime.episodes || '?';

  const genresStr = anime.genres?.slice(0, 3).join(', ');
  const formatStr = anime.format ? anime.format.replace('_', ' ') : '';
  const ratingStr = anime.averageScore ? `Global ${(anime.averageScore / 10).toFixed(1)}` : '';
  const infoLine = [genresStr, formatStr, 'Today', timeStr, studio, ratingStr].filter(Boolean).join(' • ');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        "flex flex-col rounded-2xl bg-[#0a0c16] shadow-2xl h-full group border transition-all",
        isCaughtUp 
          ? "border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.15)]" 
          : "border-[#1e2336]"
      )}
    >
      <div 
        className="relative w-full h-48 sm:h-52 bg-[#0a0c16] shrink-0 cursor-pointer overflow-hidden rounded-t-2xl flex items-center justify-center"
        onClick={() => onAnimeSelect?.(anime)}
      >
        {hasBanner ? (
          <img 
            src={bgImage} 
            alt="" 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <>
            <div className="absolute inset-0">
              <img 
                src={bgImage} 
                className="w-full h-full object-cover opacity-40 blur-xl scale-110" 
              />
            </div>
            <img 
              src={bgImage}
              alt=""
              className="relative h-full object-contain py-2 transition-transform duration-500 group-hover:scale-105"
            />
          </>
        )}
        <div className={cn(
          "absolute inset-0 pointer-events-none transition-colors",
          isCaughtUp ? "bg-purple-500/10" : "bg-black/20"
        )} />
        <div className="absolute -inset-1 top-0 bg-gradient-to-t from-[#0a0c16] via-[#0a0c16]/60 to-transparent pointer-events-none" />
        
        <div className="absolute top-3 left-3 z-20">
          {isCaughtUp ? (
            <div className="flex items-center gap-1.5 bg-[#0a0c16]/80 backdrop-blur-md border border-purple-500/30 text-purple-100 text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-lg">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
              Caught up
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-[#0a0c16]/80 backdrop-blur-md border border-gray-600/50 text-gray-300 text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-lg">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              {!seasonMatch && (anime.episodes || 0) > 50 ? "Your place is saved" : "Behind"}
            </div>
          )}
        </div>

        <button 
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(anime.id); }} 
          className="absolute top-3 right-3 z-20 w-8 h-8 flex items-center justify-center bg-[#0a0c16]/80 backdrop-blur-md border border-gray-600/50 text-gray-300 hover:text-white rounded-full transition-colors"
        >
          <Bookmark className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 sm:p-5 flex flex-col flex-1 z-10">
        <div className="flex justify-between items-start mb-1 gap-2">
          <h3 
            className="text-[17px] sm:text-[19px] font-bold text-white leading-tight line-clamp-1 cursor-pointer hover:text-purple-400 transition-colors"
            onClick={() => onAnimeSelect?.(anime)}
          >
            {displayTitle(anime)}
          </h3>
          <div className="flex gap-1.5 mt-1 flex-col items-end sm:flex-row sm:items-center">
            <div className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0 border border-gray-800 bg-[#0f121d] px-2 py-0.5 rounded-full">
              {seasonText} • {maxWatched}/{totalEpisodes} watched
            </div>
            {userAvgScore && (
              <div className="text-[11px] font-semibold text-purple-300 whitespace-nowrap flex-shrink-0 border border-purple-500/30 bg-[#1a0f2e] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-[0_0_10px_rgba(168,85,247,0.15)]">
                <Star className="w-3 h-3 fill-purple-400 text-purple-400" />
                Your Avg {userAvgScore.toFixed(1)}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center mb-1 gap-2">
          <div className="text-[13px] text-gray-300 line-clamp-1">
            Episode {todayEp}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] sm:text-[12px] text-purple-400 flex-shrink-0">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
            {isCaughtUp ? "New episode today" : `Episode ${todayEp} aired today`}
          </div>
        </div>

        <div className="text-[10px] sm:text-[11px] text-gray-500 mb-5 line-clamp-1">
          {infoLine}
        </div>

        <div className="border border-[#1e2336] rounded-xl p-4 bg-[#080a14] flex flex-col items-center mb-5 relative">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/20 to-transparent" />
          
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-purple-500 fill-purple-500" />
            <span className="text-[14px] text-gray-200 font-medium">
              {isCaughtUp ? "Rate today's episode" : `Rate Episode ${nextEp}`}
            </span>
          </div>
          
          <div className="flex gap-2 w-full justify-between mb-4 px-1">
            {[5, 6, 7, 8, 9, 10].map(s => (
              <button
                key={s}
                onClick={() => handleRateAndWatch(s)}
                className="flex-1 h-[42px] sm:h-[46px] bg-[#0a0c16] text-gray-200 border border-[#1e2336] rounded-lg text-[16px] sm:text-[18px] font-medium hover:bg-purple-600 hover:border-purple-500 hover:text-white hover:shadow-[0_0_15px_rgba(168,85,247,0.5)] transition-all"
              >
                {s}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-2 mb-2">
            <button 
              onClick={() => handleRateAndWatch(null)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#1e2336] bg-[#0f121d] text-[10px] sm:text-[11px] text-gray-400 hover:bg-[#1a1f35] hover:text-gray-200 transition-colors"
            >
              Mark watched only <Info className="w-3.5 h-3.5" />
            </button>
            <div className="relative">
              <button 
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-1 px-3 py-1 rounded-full border border-[#1e2336] bg-[#0f121d] text-[10px] sm:text-[11px] text-gray-400 hover:bg-[#1a1f35] hover:text-gray-200 transition-colors"
              >
                0-4 <ChevronDown className="w-3 h-3" />
              </button>
              {showDropdown && (
                <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 flex flex-col bg-[#0a0c16] border border-[#1e2336] rounded-lg shadow-xl overflow-hidden min-w-[48px] z-50">
                  {[4, 3, 2, 1, 0].map(s => (
                    <button
                      key={s}
                      onClick={() => { handleRateAndWatch(s); setShowDropdown(false); }}
                      className="px-3 py-1.5 text-[11px] text-gray-300 hover:bg-[#1a1f35] hover:text-white transition-colors border-b border-[#1e2336] last:border-0"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="text-[10px] sm:text-[11px] text-gray-500">
            Tap a score to rate + mark watched
          </div>
        </div>

        <div className="mt-auto">
          {isCaughtUp ? (
            <div className="relative w-full h-[52px] mt-1">
              <div className="absolute top-2.5 left-4 right-4 h-[3px] bg-purple-600 rounded-full" />
              <div className="absolute inset-0 flex justify-between items-start">
                <div className="flex flex-col items-center w-24 -ml-4">
                  <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center z-10 ring-[3px] ring-[#0a0c16]">
                    <Check className="w-3 h-3 text-white stroke-[3]" />
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1.5 text-center leading-tight">
                    Caught up through<br />Ep. {Math.max(0, todayEp - 1)}
                  </div>
                </div>
                
                <div className="flex flex-col items-center w-20 -mr-2">
                  <div className="w-5 h-5 rounded-full border-2 border-purple-500 bg-[#0a0c16] flex items-center justify-center z-10 ring-[3px] ring-[#0a0c16]">
                    <Star className="w-2.5 h-2.5 text-purple-400 fill-current" />
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1.5 text-center leading-tight">
                    Today: Ep. {todayEp}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative w-full h-[52px] mt-1">
              <div className="absolute top-2.5 left-4 right-4 flex items-center">
                <div className="h-[3px] bg-purple-600 rounded-full w-[45%]" />
                <div className="h-[3px] border-t-2 border-dashed border-gray-700 flex-1 ml-1" />
              </div>

              <div className="absolute inset-0 flex justify-between items-start">
                <div className="flex flex-col items-center w-24 -ml-4">
                  <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center z-10 ring-[3px] ring-[#0a0c16]">
                    <Check className="w-3 h-3 text-white stroke-[3]" />
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1.5 text-center leading-tight">
                    Watched through<br />Ep. {maxWatched}
                  </div>
                </div>
                
                <div className="flex flex-col items-center w-20 absolute left-[45%] -translate-x-1/2">
                  <div className="w-5 h-5 rounded-full border-2 border-purple-500 bg-[#0a0c16] flex items-center justify-center z-10 ring-[3px] ring-[#0a0c16]">
                    <div className="w-2 h-2 rounded-full bg-purple-400" />
                  </div>
                  <div className="text-[10px] text-gray-300 mt-1.5 text-center leading-tight font-medium">
                    Next: Ep. {nextEp}
                  </div>
                </div>

                <div className="flex flex-col items-center w-20 -mr-2">
                  <div className="w-5 h-5 rounded-full border-2 border-gray-600 bg-[#0a0c16] flex items-center justify-center z-10 ring-[3px] ring-[#0a0c16]">
                    <Star className="w-2.5 h-2.5 text-gray-500 fill-current" />
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1.5 text-center leading-tight">
                    Today: Ep. {todayEp}
                  </div>
                </div>
              </div>

              <div className="absolute top-[16px] left-[72.5%] transform -translate-x-1/2 -translate-y-1/2 border border-[#1e2336] bg-[#0a0c16] rounded-full px-2 py-0.5 text-[9px] text-gray-400 whitespace-nowrap z-10 shadow-sm">
                {todayEp - nextEp} episodes to today
              </div>
            </div>
          )}
          
          <a 
            href={watchLink || "#"}
            target={watchLink ? "_blank" : undefined}
            rel="noreferrer"
            className={cn(
              "w-full h-11 sm:h-12 flex items-center justify-center gap-2 rounded-xl font-medium text-[14px] sm:text-[15px] transition-all mt-6",
              watchLink 
                ? "bg-[#0a0c16] border border-[#9333ea] text-purple-400 hover:bg-[#9333ea] hover:text-white shadow-[0_0_15px_rgba(147,51,234,0.2)] hover:shadow-[0_0_20px_rgba(147,51,234,0.4)]" 
                : "bg-[#1e2336] text-gray-400 cursor-not-allowed"
            )}
          >
            <Play className="w-4 h-4 fill-current" />
            {isCaughtUp ? `Watch Episode ${todayEp}` : `Continue Episode ${nextEp}`}
          </a>
        </div>
      </div>
    </motion.div>
  );
});
