import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { AnimeMedia } from '../../types';
import type { VibesLookup } from '../../queries/vibes';
import { latestAiredEpisode } from '../../lib/aired';
import { selectLogsArray, useUserData } from '../../stores/userData';
import { cn } from '../../lib/utils';

/**
 * The series page's episode grid: navigation, not logging. Each cell opens
 * that episode's own view; the quick tap-to-log flow stays in the detail
 * modal's tracker. Cells wear their sentiment when the vibes file knows it —
 * tint plus a glyph, never color alone.
 */

// `quiet` is the thread-exists-but-empty state; the grid keeps a single grey
// treatment for it (the New/Zzz age split lives on the schedule cards, where
// a just-aired episode is actually news).
const TONE_GLYPH = { positive: '▲', mixed: '◆', negative: '▼', quiet: 'z' } as const;

interface EpisodeGridProps {
  media: AnimeMedia;
  vibes: VibesLookup;
  onOpenEpisode: (episode: number) => void;
}

export function EpisodeGrid({ media, vibes, onOpenEpisode }: EpisodeGridProps) {
  const logs = useUserData(selectLogsArray);
  const watched = useMemo(() => {
    const set = new Set<number>();
    for (const log of logs) if (log.showId === media.id) set.add(log.episodeNumber);
    return set;
  }, [logs, media.id]);

  const airedCount = latestAiredEpisode(media, Math.floor(Date.now() / 1000))?.episode ?? null;
  const total = Math.max(1, media.episodes ?? airedCount ?? 1);
  const episodes = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
      {episodes.map((episode) => {
        const entry = vibes.get(media.id, episode);
        const tone = entry?.status === 'found' ? entry.indicator : entry?.status === 'quiet' ? 'quiet' : null;
        const isWatched = watched.has(episode);
        return (
          <button
            key={episode}
            onClick={() => onOpenEpisode(episode)}
            aria-label={`Episode ${episode}${isWatched ? ', watched' : ''}${
              tone === 'quiet' ? ', quiet discussion' : tone ? `, ${tone} reception` : ''
            }`}
            className={cn(
              'relative flex h-11 items-center justify-center rounded-field border text-sm font-medium transition-colors',
              tone === 'positive' && 'border-sent-positive/40 bg-sent-positive/10 text-sent-positive-fg hover:bg-sent-positive/20',
              tone === 'mixed' && 'border-sent-mixed/40 bg-sent-mixed/10 text-sent-mixed-fg hover:bg-sent-mixed/20',
              tone === 'negative' && 'border-sent-negative/40 bg-sent-negative/10 text-sent-negative-fg hover:bg-sent-negative/20',
              tone === 'quiet' && 'border-sent-quiet/40 bg-sent-quiet/10 text-sent-quiet-fg hover:bg-sent-quiet/20',
              tone === null && 'border-edge text-fg-secondary hover:bg-surface-2 hover:text-fg',
            )}
          >
            {episode}
            {tone && (
              <span className="absolute right-0.5 top-0 text-micro leading-3 opacity-80" aria-hidden="true">
                {TONE_GLYPH[tone]}
              </span>
            )}
            {isWatched && (
              <Check className="absolute bottom-0.5 right-0.5 h-3 w-3 text-fg-muted" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
}
