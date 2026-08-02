import { Bookmark, Check, CheckCircle2, Clock, Info, Play, Star, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { LibraryStatusMenu } from '../../components/LibraryStatusMenu';
import { LowScoreButtons } from "../../components/LowScoreButtons";
import { VibeChip } from '../../components/VibeChip';
import { latestAiredEpisode } from '../../lib/aired';
import { displayTitle } from '../../lib/displayTitle';
import { WATCH_STATE_LABELS } from '../../lib/status';
import { cn } from '../../lib/utils';
import type { VibeEntry } from '../../lib/vibesFile';
import { pickWatchLink } from '../../lib/watchLinks';
import { useVibesIndex } from '../../queries/vibes';
import { useUserData } from '../../stores/userData';
import { AnimeMedia, EpisodeLog } from '../../types';

interface CheckInFeedProps {
  animeList: AnimeMedia[];
  favorites: number[];
  logs: EpisodeLog[];
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onAnimeSelect?: (anime: AnimeMedia) => void;
}

interface Drop {
  anime: AnimeMedia;
  episode: number;
  airedAt: number;
  maxWatched: number;
  userAvgScore: number | null;
}

/** The quick row; everything below 5 lives behind the LowScoreButtons expander. */
const QUICK_SCORES = [5, 6, 7, 8, 9, 10];

/**
 * Admission pins: showId -> the latest-aired episode a drop card is up for.
 * The drops memo only re-runs when logs/animeList/favorites change, and it
 * reads the clock when it does — so without pins, a card that crossed the
 * 24h line while sitting on screen vanishes on exactly the recompute that a
 * catch-up rating triggers, looking like the rating logged today's episode.
 * The window therefore only gates *admission*; an admitted card stays until
 * today's episode is logged or a newer episode replaces it. Module-level so
 * a route hop doesn't reset it; a reload does, which is fine.
 */
const admittedDrops = new Map<number, number>();

/** Test hook. */
export function resetAdmittedDrops() {
  admittedDrops.clear();
}

/**
 * "Today's Drops": watching shows whose latest episode aired within the last
 * 24 hours and hasn't been logged yet, drawn as the big cinematic banner card.
 * A card already on screen outlives the window (see admittedDrops), so rating
 * catch-up episodes advances it instead of dismissing it.
 */
export function CheckInFeed({ animeList, favorites, logs, onLog, onAnimeSelect }: CheckInFeedProps) {
  const vibes = useVibesIndex();

  const drops = useMemo(() => {
    const recent: Drop[] = [];
    const now = Math.floor(Date.now() / 1000);

    for (const anime of animeList) {
      if (!favorites.includes(anime.id)) continue;

      // latestAiredEpisode is stale-proof: it recognizes a passed airingAt as
      // "this episode aired" even when the 8-hourly bundle hasn't caught up,
      // which is exactly the window in which a drop matters most.
      const latest = latestAiredEpisode(anime, now);
      if (latest === null) continue;

      const episodeNum = latest.episode;
      const timeSinceAir = now - latest.airedAt;
      const inWindow = timeSinceAir >= 0 && timeSinceAir <= 24 * 3600;
      if (!inWindow && admittedDrops.get(anime.id) !== episodeNum) continue;

      const showLogs = logs.filter((l) => l.showId === anime.id);
      if (showLogs.some((l) => l.episodeNumber === episodeNum)) continue;

      admittedDrops.set(anime.id, episodeNum);
      const maxWatched = showLogs.length > 0 ? Math.max(...showLogs.map((l) => l.episodeNumber)) : 0;
      const ratedLogs = showLogs.filter((l) => l.score !== null && l.score !== undefined);
      const userAvgScore =
        ratedLogs.length > 0 ? ratedLogs.reduce((acc, l) => acc + (l.score ?? 0), 0) / ratedLogs.length : null;
      recent.push({ anime, episode: episodeNum, airedAt: latest.airedAt, maxWatched, userAvgScore });
    }
    return recent.sort((a, b) => b.airedAt - a.airedAt);
  }, [animeList, favorites, logs]);

  // This surface's onLog arrives raw from schedule/route.tsx, so the undo
  // toast lives here — same pattern as watching/route.tsx (which already
  // toasts before its onLog reaches the Catch-Up Queue).
  const handleLog = useCallback(
    (showId: number, episodeNumber: number, score: number | null) => {
      onLog(showId, episodeNumber, score);
      toast(`Logged episode ${episodeNumber}`, {
        action: { label: 'Undo', onClick: () => useUserData.getState().unlogEpisode(showId, episodeNumber) },
      });
    },
    [onLog],
  );

  if (drops.length === 0) return null;

  return (
    <div className="mb-12">
      <h2 className="mb-6 text-xl font-bold tracking-tight text-white flex items-center gap-3">
        <span className="relative flex h-4 w-4" aria-hidden="true">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-accent-500"></span>
        </span>
        Today's Drops
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <AnimatePresence>
          {drops.map((drop) => (
            <CheckInItem
              key={`${drop.anime.id}-${drop.episode}`}
              drop={drop}
              vibe={vibes.get(drop.anime.id, drop.episode)}
              onLog={handleLog}
              onAnimeSelect={onAnimeSelect}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Slides the old value up and the new one in from below whenever it changes —
 * the "logged, here's the next one" feedback for numbers that advance in place.
 */
function Ticker({ value }: { value: string | number }) {
  return (
    <span className="relative inline-flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: '105%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-105%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 38, mass: 0.8 }}
          className="inline-block whitespace-nowrap"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const CheckInItem = memo(function CheckInItem({
  drop,
  vibe,
  onLog,
  onAnimeSelect,
}: {
  drop: Drop;
  vibe: VibeEntry | undefined;
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onAnimeSelect?: (anime: AnimeMedia) => void;
}) {
  const { anime, maxWatched, userAvgScore, episode: todayEp } = drop;
  const title = displayTitle(anime);
  const hasBanner = !!(anime.bannerImage || anime.trailer?.thumbnail);
  const bgImage = anime.bannerImage || anime.trailer?.thumbnail || anime.coverImage.extraLarge || anime.coverImage.large;
  const studio = anime.studios?.nodes?.[0]?.name || 'Unknown Studio';

  const timeStr = new Date(drop.airedAt * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const customSite = useUserData((s) => s.uiPrefs.customSource?.name);
  const watchLink = pickWatchLink(anime.externalLinks, customSite);

  const isCaughtUp = maxWatched >= todayEp - 1;
  const nextEp = isCaughtUp ? todayEp : maxWatched + 1;
  const targetEp = nextEp;

  const handleRateAndWatch = (score: number | null) => {
    onLog(anime.id, targetEp, score);
  };

  const openShow = () => onAnimeSelect?.(anime);

  const seasonMatch = anime.title.english?.match(/Season (\d+)/i) || anime.title.userPreferred?.match(/Season (\d+)/i);
  const seasonText = seasonMatch ? `Season ${seasonMatch[1]}` : 'Series';
  const totalEpisodes = anime.episodes ?? '?';

  const genresStr = anime.genres.slice(0, 3).join(', ');
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
        'flex flex-col rounded-2xl bg-[#0a0c16] shadow-2xl h-full group border transition-all',
        isCaughtUp ? 'border-accent-500/40 shadow-[0_0_20px_rgba(168,85,247,0.15)]' : 'border-[#1e2336]',
      )}
    >
      <div className="relative w-full h-48 sm:h-52 bg-[#0a0c16] shrink-0 overflow-hidden rounded-t-2xl">
        <button
          type="button"
          onClick={openShow}
          aria-label={`Open ${title}`}
          className="absolute inset-0 flex items-center justify-center"
        >
          {hasBanner ? (
            <img
              src={bgImage}
              alt={`${title} key art`}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <>
              <span className="absolute inset-0">
                <img src={bgImage} alt="" className="w-full h-full object-cover opacity-40 blur-xl scale-110" />
              </span>
              <img
                src={bgImage}
                alt={`${title} cover`}
                className="relative h-full object-contain py-2 transition-transform duration-500 group-hover:scale-105"
              />
            </>
          )}
          <span
            className={cn(
              'absolute inset-0 pointer-events-none transition-colors',
              isCaughtUp ? 'bg-accent-500/10' : 'bg-black/20',
            )}
            aria-hidden="true"
          />
          <span
            className="absolute -inset-1 top-0 bg-gradient-to-t from-[#0a0c16] via-[#0a0c16]/60 to-transparent pointer-events-none"
            aria-hidden="true"
          />
        </button>

        <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-1.5">
          {isCaughtUp ? (
            <div className="flex items-center gap-1.5 bg-[#0a0c16]/80 backdrop-blur-md border border-accent-500/30 text-purple-100 text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-lg">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent-400" aria-hidden="true" />
              {WATCH_STATE_LABELS['caught-up']}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-[#0a0c16]/80 backdrop-blur-md border border-gray-600/50 text-gray-300 text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-lg">
              <Clock className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
              {WATCH_STATE_LABELS.behind}
            </div>
          )}

          <VibeChip vibe={vibe} showTitle={title} onOpen={openShow} variant="glass" className="text-[11px] py-1" />
        </div>

        <LibraryStatusMenu
          showId={anime.id}
          align="end"
          renderTrigger={({ inLibrary }) => (
            <button
              className={cn(
                'absolute top-3 right-3 z-20 w-8 h-8 flex items-center justify-center backdrop-blur-md border rounded-full transition-colors',
                inLibrary
                  ? 'bg-accent-600/90 border-accent-500/50 text-white'
                  : 'bg-[#0a0c16]/80 border-gray-600/50 text-gray-300 hover:text-white',
              )}
            >
              <Bookmark className="w-4 h-4" fill={inLibrary ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
          )}
        />
      </div>

      <div className="p-4 sm:p-5 flex flex-col flex-1 z-10">
        <div className="flex justify-between items-start mb-1 gap-2">
          <h3 className="min-w-0 flex-1">
            <button
              type="button"
              onClick={openShow}
              className="block max-w-full text-left text-[17px] sm:text-[19px] font-bold text-white leading-tight line-clamp-1 hover:text-accent-400 transition-colors"
            >
              {title}
            </button>
          </h3>
          <div className="flex gap-1.5 mt-1 flex-col items-end sm:flex-row sm:items-center">
            <div className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0 border border-gray-800 bg-[#0f121d] px-2 py-0.5 rounded-full">
              {seasonText} • <Ticker value={maxWatched} />/{totalEpisodes} watched
            </div>
            {userAvgScore !== null && (
              <div className="text-[11px] font-semibold text-accent-300 whitespace-nowrap flex-shrink-0 border border-accent-500/30 bg-[#1a0f2e] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-[0_0_10px_rgba(168,85,247,0.15)]">
                <Star className="w-3 h-3 fill-accent-400 text-accent-400" aria-hidden="true" />
                Your Avg {userAvgScore.toFixed(1)}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center mb-1 gap-2">
          <div className="text-[13px] text-gray-300 line-clamp-1">Episode {todayEp}</div>
          <div className="flex items-center gap-1.5 text-[11px] sm:text-[12px] text-accent-400 flex-shrink-0">
            <span
              className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-accent-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"
              aria-hidden="true"
            />
            {isCaughtUp ? 'New episode today' : `Episode ${todayEp} aired today`}
          </div>
        </div>

        <div className="text-[10px] sm:text-[11px] text-gray-500 mb-5 line-clamp-1">{infoLine}</div>

        <div className="border border-[#1e2336] rounded-xl p-4 bg-[#080a14] flex flex-col items-center mb-5 relative">
          <div
            className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-500/20 to-transparent"
            aria-hidden="true"
          />

          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-accent-500 fill-accent-500" aria-hidden="true" />
            <span className="text-[14px] text-gray-200 font-medium">
              <Ticker value={isCaughtUp ? "Rate today's episode" : `Rate Episode ${nextEp}`} />
            </span>
          </div>

          <div
            role="group"
            aria-label={`Rate episode ${targetEp}, 5 to 10`}
            className="flex gap-2 w-full justify-between mb-4 px-1"
          >
            {QUICK_SCORES.map((s) => (
              <motion.button
                key={s}
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={() => handleRateAndWatch(s)}
                aria-label={`Rate episode ${targetEp} a ${s} and mark watched`}
                className="flex-1 h-11 sm:h-[46px] bg-[#0a0c16] text-gray-200 border border-[#1e2336] rounded-lg text-[16px] sm:text-[18px] font-medium hover:bg-accent-600 hover:border-accent-500 hover:text-white hover:shadow-[0_0_15px_rgba(168,85,247,0.5)] transition-all"
              >
                {s}
              </motion.button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => handleRateAndWatch(null)}
              aria-label={`Mark episode ${targetEp} watched without a score`}
              className="relative flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#1e2336] bg-[#0f121d] text-[10px] sm:text-[11px] text-gray-400 hover:bg-[#1a1f35] hover:text-gray-200 transition-colors after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
            >
              Mark watched only <Info className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <LowScoreButtons
              episode={targetEp}
              onSelect={(score) => handleRateAndWatch(score)}
              triggerClassName="px-3 py-1 rounded-full border border-[#1e2336] bg-[#0f121d] text-[10px] sm:text-[11px] text-gray-400 hover:bg-[#1a1f35] hover:text-gray-200 after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
              buttonClassName="h-7 min-w-7 px-1.5 rounded-md border border-[#1e2336] bg-[#0f121d] text-[11px] text-gray-300 hover:bg-[#1a1f35] hover:text-white"
            />
          </div>

          <div className="text-[10px] sm:text-[11px] text-gray-500">Tap a score to rate + mark watched</div>
        </div>

        <div className="mt-auto">
          <div className="relative w-full h-[52px] mt-1">
            <AnimatePresence initial={false}>
              {isCaughtUp ? (
                <motion.div
                  key="caught-up"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="absolute inset-0"
                >
                  <div className="absolute top-2.5 left-4 right-4 h-[3px] bg-accent-600 rounded-full" aria-hidden="true" />
                  <div className="absolute inset-0 flex justify-between items-start">
                    <div className="flex flex-col items-center w-24 -ml-4">
                      <div className="w-5 h-5 rounded-full bg-accent-600 flex items-center justify-center z-10 ring-[3px] ring-[#0a0c16]">
                        <Check className="w-3 h-3 text-white stroke-[3]" aria-hidden="true" />
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1.5 text-center leading-tight">
                        Caught up through
                        <br />
                        Ep. {Math.max(0, todayEp - 1)}
                      </div>
                    </div>

                    <div className="flex flex-col items-center w-20 -mr-2">
                      <div className="w-5 h-5 rounded-full border-2 border-accent-500 bg-[#0a0c16] flex items-center justify-center z-10 ring-[3px] ring-[#0a0c16]">
                        <Star className="w-2.5 h-2.5 text-accent-400 fill-current" aria-hidden="true" />
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1.5 text-center leading-tight">Today: Ep. {todayEp}</div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="behind"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="absolute inset-0"
                >
                  <div className="absolute top-2.5 left-4 right-4 flex items-center" aria-hidden="true">
                    <div className="h-[3px] bg-accent-600 rounded-full w-[45%]" />
                    <div className="h-[3px] border-t-2 border-dashed border-gray-700 flex-1 ml-1" />
                  </div>

                  <div className="absolute inset-0 flex justify-between items-start">
                    <div className="flex flex-col items-center w-24 -ml-4">
                      <div className="w-5 h-5 rounded-full bg-accent-600 flex items-center justify-center z-10 ring-[3px] ring-[#0a0c16]">
                        <Check className="w-3 h-3 text-white stroke-[3]" aria-hidden="true" />
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1.5 text-center leading-tight">
                        Watched through
                        <br />
                        Ep. <Ticker value={maxWatched} />
                      </div>
                    </div>

                    <div className="flex flex-col items-center w-20 absolute left-[45%] -translate-x-1/2">
                      <div className="w-5 h-5 rounded-full border-2 border-accent-500 bg-[#0a0c16] flex items-center justify-center z-10 ring-[3px] ring-[#0a0c16]">
                        <div className="w-2 h-2 rounded-full bg-accent-400" aria-hidden="true" />
                      </div>
                      <div className="text-[10px] text-gray-300 mt-1.5 text-center leading-tight font-medium">
                        Next: Ep. <Ticker value={nextEp} />
                      </div>
                    </div>

                    <div className="flex flex-col items-center w-20 -mr-2">
                      <div className="w-5 h-5 rounded-full border-2 border-gray-600 bg-[#0a0c16] flex items-center justify-center z-10 ring-[3px] ring-[#0a0c16]">
                        <Star className="w-2.5 h-2.5 text-gray-500 fill-current" aria-hidden="true" />
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1.5 text-center leading-tight">Today: Ep. {todayEp}</div>
                    </div>
                  </div>

                  <div className="absolute top-[16px] left-[72.5%] transform -translate-x-1/2 -translate-y-1/2 border border-[#1e2336] bg-[#0a0c16] rounded-full px-2 py-0.5 text-[9px] text-gray-400 whitespace-nowrap z-10 shadow-sm">
                    <Ticker value={todayEp - nextEp} /> episodes to today
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {watchLink ? (
            <a
              href={watchLink}
              target="_blank"
              rel="noreferrer"
              className="w-full h-11 sm:h-12 flex items-center justify-center gap-2 rounded-xl font-medium text-[14px] sm:text-[15px] transition-all mt-6 bg-[#0a0c16] border border-accent-600 text-accent-400 hover:bg-accent-600 hover:text-white shadow-[0_0_15px_rgba(147,51,234,0.2)] hover:shadow-[0_0_20px_rgba(147,51,234,0.4)]"
            >
              <Play className="w-4 h-4 fill-current" aria-hidden="true" />
              <Ticker value={isCaughtUp ? `Watch Episode ${todayEp}` : `Continue Episode ${nextEp}`} />
            </a>
          ) : (
            <p className="w-full h-11 sm:h-12 flex items-center justify-center gap-2 rounded-xl font-medium text-[14px] sm:text-[15px] mt-6 bg-[#1e2336] text-gray-400">
              No stream linked
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
});
