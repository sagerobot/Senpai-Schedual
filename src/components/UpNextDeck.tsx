import { Info, Play, Star, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { LowScoreButtons } from './LowScoreButtons';
import { displayTitle } from '../lib/displayTitle';
import { UpNextCandidate, UpNextReasonKind } from '../lib/upNext';
import { cn } from '../lib/utils';
import { pickWatchLink } from '../lib/watchLinks';
import { useUserData } from '../stores/userData';
import { AnimeMedia } from '../types';

interface UpNextDeckProps {
  candidates: UpNextCandidate[];
  /** Arrives pre-wrapped with the host's undo toast — no toasting here. */
  onLog: (showId: number, episodeNumber: number, score: number | null) => void;
  onSkip: (showId: number) => void;
  onAnimeSelect: (anime: AnimeMedia) => void;
}

const QUICK_SCORES = [5, 6, 7, 8, 9, 10];

/** Reason chips share the vibe chips' glassy pill grammar; never color-only. */
const REASON_CHIP: Record<UpNextReasonKind, { chip: string; dot: string }> = {
  'binge-ready': { chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' },
  'finish-line': { chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' },
  urgency: { chip: 'border-amber-500/40 bg-amber-500/10 text-amber-300', dot: 'bg-amber-400' },
  momentum: { chip: 'border-accent-500/40 bg-accent-500/10 text-accent-300', dot: 'bg-accent-400' },
  affinity: { chip: 'border-pink-500/40 bg-pink-500/10 text-pink-300', dot: 'bg-pink-400' },
  backlog: { chip: 'border-gray-600/50 bg-gray-500/10 text-gray-300', dot: 'bg-gray-400' },
};

/**
 * The Up Next deck: one ranked pick at a time, "Not tonight" deals the next.
 * Deliberately the drop cards' visual grammar (same chips, rate row, and CTA
 * treatment) without being a drop card — drops stay special.
 *
 * Skips are session-level (see useUpNext); the deck is a queue, so the visible
 * card is always the deck's current best reason to press play.
 */
export function UpNextDeck({ candidates, onLog, onSkip, onAnimeSelect }: UpNextDeckProps) {
  const customSite = useUserData((s) => s.uiPrefs.customSource?.name);

  if (candidates.length === 0) return null;

  const current = candidates[0];
  const { anime, reason, nextEpisode, behindCount, airedCount, userAvgScore } = current;
  const title = displayTitle(anime);
  const cover = anime.coverImage.extraLarge ?? anime.coverImage.large;
  const watchLink = pickWatchLink(anime.externalLinks, customSite);
  const watchedCount = Math.max(0, airedCount - behindCount);
  const progressPct = airedCount > 0 ? Math.min(100, (watchedCount / airedCount) * 100) : 0;
  const isBinge = reason.kind === 'binge-ready';
  const chipTone = REASON_CHIP[reason.kind];

  const seasonMatch =
    anime.title.english?.match(/Season (\d+)/i) || anime.title.userPreferred?.match(/Season (\d+)/i);
  const seasonText = seasonMatch ? `Season ${seasonMatch[1]}` : 'Series';
  const totalEpisodes = anime.episodes ?? '?';

  const dotCount = Math.min(candidates.length, 5);
  const overflow = candidates.length - dotCount;

  return (
    <section aria-label="Up next for you" className="mb-12">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Up next for you</h2>
          <p className="mt-0.5 text-sm text-gray-400">One pick at a time · skips remember for tonight</p>
        </div>
        <div className="flex items-center gap-1.5 pb-1" aria-label={`${candidates.length} picks in the deck`}>
          {Array.from({ length: dotCount }, (_, i) => (
            <span
              key={i}
              className={cn('h-1.5 w-1.5 rounded-full', i === 0 ? 'bg-accent-400' : 'bg-[#262c42]')}
              aria-hidden="true"
            />
          ))}
          {overflow > 0 && <span className="text-[10px] text-gray-500">+{overflow}</span>}
        </div>
      </div>

      <div className="relative">
        {/* Deck edges: "there's more" without showing more. */}
        {candidates.length > 1 && (
          <div
            className="absolute inset-x-2.5 top-2 h-full rounded-2xl border border-[#1e2336] bg-[#0a0c16] opacity-60"
            aria-hidden="true"
          />
        )}
        {candidates.length > 2 && (
          <div
            className="absolute inset-x-6 top-4 h-full rounded-2xl border border-[#1e2336] bg-[#0a0c16] opacity-30"
            aria-hidden="true"
          />
        )}

        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={anime.id}
            initial={{ opacity: 0, x: 26 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -26 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="relative z-10 flex flex-col gap-5 rounded-2xl border border-[#1e2336] bg-[#0a0c16] p-5 shadow-[0_0_20px_rgba(168,85,247,0.12)] sm:flex-row"
          >
            <button
              type="button"
              onClick={() => onAnimeSelect(anime)}
              aria-label={`Open ${title}`}
              className="group relative h-44 w-[124px] shrink-0 self-center overflow-hidden rounded-xl sm:self-start"
            >
              <img
                src={cover}
                alt={`${title} cover`}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </button>

            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                    chipTone.chip,
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', chipTone.dot)} aria-hidden="true" />
                  {reason.text}
                </span>
                <span className="grow" />
                <span className="whitespace-nowrap rounded-full border border-gray-800 bg-[#0f121d] px-2 py-0.5 text-[11px] text-gray-400">
                  {seasonText} • {watchedCount}/{totalEpisodes} watched
                </span>
                {userAvgScore !== null && (
                  <span className="flex items-center gap-1 whitespace-nowrap rounded-full border border-accent-500/30 bg-[#1a0f2e] px-2 py-0.5 text-[11px] font-semibold text-accent-300 shadow-[0_0_10px_rgba(168,85,247,0.15)]">
                    <Star className="h-3 w-3 fill-accent-400 text-accent-400" aria-hidden="true" />
                    Your Avg {userAvgScore.toFixed(1)}
                  </span>
                )}
              </div>

              <h3 className="min-w-0">
                <button
                  type="button"
                  onClick={() => onAnimeSelect(anime)}
                  className="block max-w-full truncate text-left text-[19px] font-bold leading-tight text-white transition-colors hover:text-accent-400"
                >
                  {title}
                </button>
              </h3>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-gray-300">Next: Episode {nextEpisode}</span>
                <span className="flex items-center gap-1.5 text-[11px] text-accent-400">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-accent-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"
                    aria-hidden="true"
                  />
                  {behindCount === 1 ? '1 episode waiting' : `${behindCount} episodes waiting`}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-[#1e2336]">
                  <div className="h-full rounded-full bg-accent-600" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="whitespace-nowrap text-[11px] text-gray-400">
                  {watchedCount} / {airedCount}
                </span>
              </div>

              <div className="mt-1 flex items-center gap-2">
                <Zap className="h-4 w-4 fill-accent-500 text-accent-500" aria-hidden="true" />
                <span className="text-[13px] font-medium text-gray-200">Rate Episode {nextEpisode}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="group"
                  aria-label={`Rate episode ${nextEpisode}, 5 to 10`}
                  className="flex min-w-[230px] flex-1 gap-1.5"
                >
                  {QUICK_SCORES.map((s) => (
                    <motion.button
                      key={s}
                      type="button"
                      whileTap={{ scale: 0.88 }}
                      onClick={() => onLog(anime.id, nextEpisode, s)}
                      aria-label={`Rate episode ${nextEpisode} a ${s} and mark watched`}
                      className="h-10 flex-1 rounded-lg border border-[#1e2336] bg-[#0a0c16] text-[15px] font-medium text-gray-200 transition-all hover:border-accent-500 hover:bg-accent-600 hover:text-white hover:shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                    >
                      {s}
                    </motion.button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => onLog(anime.id, nextEpisode, null)}
                  aria-label={`Mark episode ${nextEpisode} watched without a score`}
                  className="relative flex items-center gap-1.5 rounded-full border border-[#1e2336] bg-[#0f121d] px-3 py-1 text-[11px] text-gray-400 transition-colors after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] hover:bg-[#1a1f35] hover:text-gray-200"
                >
                  Watched only <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <LowScoreButtons
                  episode={nextEpisode}
                  onSelect={(score) => onLog(anime.id, nextEpisode, score)}
                  triggerClassName="px-3 py-1 rounded-full border border-[#1e2336] bg-[#0f121d] text-[11px] text-gray-400 hover:bg-[#1a1f35] hover:text-gray-200 after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
                  buttonClassName="h-7 min-w-7 px-1.5 rounded-md border border-[#1e2336] bg-[#0f121d] text-[11px] text-gray-300 hover:bg-[#1a1f35] hover:text-white"
                />
              </div>

              <div className="mt-2 flex items-center gap-2.5">
                {watchLink ? (
                  <a
                    href={watchLink}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      'flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[14px] font-medium transition-all',
                      isBinge
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                        : 'border border-accent-600 bg-[#0a0c16] text-accent-400 shadow-[0_0_15px_rgba(147,51,234,0.2)] hover:bg-accent-600 hover:text-white hover:shadow-[0_0_20px_rgba(147,51,234,0.4)]',
                    )}
                  >
                    <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                    {isBinge ? 'Start the binge' : `Continue Episode ${nextEpisode}`}
                  </a>
                ) : (
                  <p className="flex h-11 flex-1 items-center justify-center rounded-xl bg-[#1e2336] text-[14px] font-medium text-gray-400">
                    No stream linked
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => onSkip(anime.id)}
                  className="whitespace-nowrap rounded-full border border-[#1e2336] bg-[#0f121d] px-4 py-2.5 text-[12px] font-medium text-gray-400 transition-colors hover:bg-[#1a1f35] hover:text-gray-200"
                >
                  Not tonight →
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
