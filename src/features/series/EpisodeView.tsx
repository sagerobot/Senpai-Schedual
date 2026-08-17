import * as Dialog from '@radix-ui/react-dialog';
import { Check, ExternalLink, Loader2, MessageCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import type { AnimeMedia } from '../../types';
import type { SeriesEntry } from '../../series/labeling';
import { asOfLabel, useCommunityPulse } from '../show/useCommunityPulse';
import { VibeFlagButton } from '../show/VibeFlagButton';
import { useVibesIndex } from '../../queries/vibes';
import { isJustAired } from '../../lib/vibesFile';
import { logKey, useUserData } from '../../stores/userData';
import { cn } from '../../lib/utils';

/**
 * One episode as its own place, hosted on the series page's `?ep=` param the
 * same way the show modal lives on `?show=` — Back closes it, links share it.
 *
 * The sentiment card is the centerpiece, and this is the first surface that
 * renders the per-dimension aspects the backfill captures.
 */

const ASPECT_LABELS = [
  ['animation', 'Animation'],
  ['story', 'Story'],
  ['pacing', 'Pacing'],
  ['characters', 'Characters'],
  ['sound', 'Sound'],
] as const;

const TONE_STYLE = {
  positive: 'border-sent-positive/40 bg-sent-positive/10 text-sent-positive-fg',
  mixed: 'border-sent-mixed/40 bg-sent-mixed/10 text-sent-mixed-fg',
  negative: 'border-sent-negative/40 bg-sent-negative/10 text-sent-negative-fg',
} as const;

const TONE_GLYPH = { positive: '▲', mixed: '◆', negative: '▼' } as const;

interface EpisodeViewProps {
  seriesTitle: string;
  member: SeriesEntry;
  media: AnimeMedia | undefined;
  episode: number;
  onClose: () => void;
}

export function EpisodeView({ seriesTitle, member, media, episode, onClose }: EpisodeViewProps) {
  const vibes = useVibesIndex();
  const stored = vibes.get(member.id, episode);
  const { pulse, state, load, remembered, quiet } = useCommunityPulse(member.title, episode, member.id, stored);
  const asOfLine = remembered !== null ? asOfLabel(remembered) : null;
  const aspects = stored?.status === 'found' ? stored.aspects : undefined;

  const isWatched = useUserData((s) => s.logs[logKey(member.id, episode)] !== undefined);
  const score = useUserData((s) => s.logs[logKey(member.id, episode)]?.score ?? null);
  const logEpisode = useUserData((s) => s.logEpisode);
  const unlogEpisode = useUserData((s) => s.unlogEpisode);

  const toggleWatched = () => {
    if (isWatched) {
      unlogEpisode(member.id, episode);
      toast('Episode unlogged', {
        action: { label: 'Undo', onClick: () => useUserData.getState().logEpisode(member.id, episode, score) },
      });
    } else {
      logEpisode(member.id, episode);
      toast('Episode logged', {
        action: { label: 'Undo', onClick: () => useUserData.getState().unlogEpisode(member.id, episode) },
      });
    }
  };

  const rate = (value: number) => {
    const previous = score;
    const next = previous === value ? null : value;
    logEpisode(member.id, episode, next);
    toast(next === null ? 'Rating cleared' : `Rated ${next}/10`, {
      action: { label: 'Undo', onClick: () => useUserData.getState().logEpisode(member.id, episode, previous) },
    });
  };

  const preDiscussionEra = (member.startDate?.year ?? 9999) < 2013;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] p-4 md:p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-card border border-edge bg-surface-1 text-fg-secondary shadow-e3">
            <div className="flex items-start justify-between gap-4 border-b border-edge p-5">
              <div className="min-w-0">
                <p className="truncate text-xs text-fg-faint">
                  {seriesTitle}
                  {member.seasonLabel !== seriesTitle && ` · ${member.seasonLabel}`}
                </p>
                <Dialog.Title className="text-lg font-bold tracking-tight text-fg">
                  Episode {episode}
                </Dialog.Title>
              </div>
              <Dialog.Close className="shrink-0 rounded-field p-1.5 text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg">
                <X className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Close</span>
              </Dialog.Close>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {/* Personal: watched + rating */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={toggleWatched}
                  className={cn(
                    'flex h-11 items-center gap-2 rounded-field border px-4 text-sm font-medium transition-colors',
                    isWatched
                      ? 'border-accent-500/40 bg-accent-600/15 text-accent-300 hover:bg-accent-600/25'
                      : 'border-edge text-fg-secondary hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {isWatched ? 'Watched' : 'Mark watched'}
                </button>
                <div className="flex items-center gap-1" role="group" aria-label="Rate this episode">
                  {[...Array(10)].map((_, i) => {
                    const value = i + 1;
                    return (
                      <button
                        key={value}
                        onClick={() => rate(value)}
                        aria-label={`Rate ${value} out of 10`}
                        aria-pressed={score === value}
                        className={cn(
                          'h-11 w-6 rounded text-xs font-medium transition-colors',
                          score !== null && value <= score
                            ? 'bg-warning-400/20 text-warning-300'
                            : 'text-fg-faint hover:bg-surface-2 hover:text-fg-secondary',
                        )}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Community sentiment */}
              {state === 'ok' && pulse ? (
                <div
                  className={cn(
                    'rounded-inner border p-4',
                    pulse.indicator === 'positive' && 'border-sent-positive/30 bg-sent-positive/10',
                    pulse.indicator === 'negative' && 'border-sent-negative/30 bg-sent-negative/10',
                    pulse.indicator === 'mixed' && 'border-sent-mixed/30 bg-sent-mixed/10',
                  )}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                        TONE_STYLE[pulse.indicator],
                      )}
                    >
                      {TONE_GLYPH[pulse.indicator]} {pulse.indicator === 'positive' ? 'Positive' : pulse.indicator === 'negative' ? 'Negative' : 'Mixed'}
                    </span>
                    {(pulse.upvotes > 0 || pulse.comments > 0) && (
                      <span className="text-xs text-fg-muted">
                        ↑ {pulse.upvotes} · 💬 {pulse.comments}
                      </span>
                    )}
                  </div>

                  <p className="text-sm leading-relaxed text-fg-secondary">{pulse.summary}</p>
                  {asOfLine && <p className="mt-1.5 text-caption text-fg-faint">Early read, {asOfLine}.</p>}

                  {aspects && Object.keys(aspects).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {ASPECT_LABELS.map(([key, label]) => {
                        const tone = aspects[key];
                        if (tone === undefined) return null;
                        return (
                          <span
                            key={key}
                            className={cn('rounded-full border px-2.5 py-1 text-caption font-medium', TONE_STYLE[tone])}
                          >
                            {label} {TONE_GLYPH[tone]}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {(pulse.goods.length > 0 || pulse.bads.length > 0) && (
                    <div className="mt-3 grid grid-cols-1 gap-3 border-t border-edge-strong/50 pt-3 sm:grid-cols-2">
                      {pulse.goods.length > 0 && (
                        <div>
                          <span className="text-caption font-semibold uppercase tracking-wider text-sent-positive-fg">
                            Highlights
                          </span>
                          <ul className="mt-1 space-y-1">
                            {pulse.goods.map((good, i) => (
                              <li key={i} className="flex items-start text-xs text-fg-secondary">
                                <span className="mr-1.5 text-sent-positive">•</span>
                                <span>{good}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {pulse.bads.length > 0 && (
                        <div>
                          <span className="text-caption font-semibold uppercase tracking-wider text-sent-negative-fg">
                            Critiques
                          </span>
                          <ul className="mt-1 space-y-1">
                            {pulse.bads.map((bad, i) => (
                              <li key={i} className="flex items-start text-xs text-fg-secondary">
                                <span className="mr-1.5 text-sent-negative">•</span>
                                <span>{bad}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-edge-strong/50 pt-2">
                    <a
                      href={pulse.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-11 items-center gap-1.5 text-xs font-medium text-fg-secondary transition-colors hover:text-fg"
                    >
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      Read the thread
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                  <VibeFlagButton showId={member.id} episode={episode} />
                </div>
              ) : state === 'loading' ? (
                <div className="flex items-center justify-center gap-2 rounded-inner border border-edge bg-surface-0 p-5 text-sm text-fg-muted">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Reading the community vibe…
                </div>
              ) : state === 'quiet' && quiet !== null ? (
                isJustAired(quiet) ? (
                  <div className="rounded-inner border border-sent-new/30 bg-sent-new/10 p-5 text-center text-sm text-sent-new-fg">
                    Just released — the{' '}
                    <a href={quiet.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      discussion thread
                    </a>{' '}
                    is still filling up. Check back soon.
                  </div>
                ) : (
                  <div className="rounded-inner border border-sent-quiet/30 bg-surface-0 p-5 text-center text-sm text-fg-muted">
                    The{' '}
                    <a href={quiet.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 text-fg-secondary">
                      discussion thread
                    </a>{' '}
                    is quiet — only {quiet.comments} comment{quiet.comments === 1 ? '' : 's'}, not enough for a
                    sentiment read.
                  </div>
                )
              ) : state === 'not_found' ? (
                <div className="rounded-inner border border-edge bg-surface-0 p-5 text-center text-sm text-fg-muted">
                  r/anime never had a discussion thread for this episode.
                </div>
              ) : state === 'resting' ? (
                <div className="rounded-inner border border-edge bg-surface-0 p-5 text-center text-sm text-fg-muted">
                  AI features are resting — try again tomorrow.
                </div>
              ) : state === 'no_key' ? (
                <div className="rounded-inner border border-edge bg-surface-0 p-5 text-center text-sm text-fg-muted">
                  AI features are off in this deployment.
                </div>
              ) : state === 'error' ? (
                <div className="flex flex-col items-center gap-3 rounded-inner border border-danger-500/30 bg-danger-500/10 p-5 text-center">
                  <p className="text-sm text-danger-300">Could not check the community vibe.</p>
                  <button
                    onClick={load}
                    className="flex h-11 items-center rounded-field border border-edge px-4 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    Try again
                  </button>
                </div>
              ) : preDiscussionEra ? (
                <div className="rounded-inner border border-edge bg-surface-0 p-5 text-center text-sm text-fg-muted">
                  This aired before r/anime ran episode threads.
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-inner border border-edge bg-surface-0 p-5 text-center">
                  <p className="text-sm text-fg-muted">No remembered reading for this episode yet.</p>
                  <button
                    onClick={load}
                    className="flex h-11 items-center rounded-field bg-accent-600 px-4 text-sm font-semibold text-fg-inverse transition-colors hover:bg-accent-500"
                  >
                    Check the community vibe
                  </button>
                </div>
              )}

              {media?.coverImage?.large && (
                <p className="text-caption text-fg-faint">
                  {member.title} · {member.format || 'TV'}
                </p>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
