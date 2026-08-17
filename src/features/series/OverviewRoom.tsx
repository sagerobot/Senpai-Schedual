import { ExternalLink as ExternalLinkIcon, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { AnimeMedia, EpisodeLog, LibraryEntry } from '../../types';
import type { SeriesEntry, SeriesGraph } from '../../series/labeling';
import type { VibesLookup } from '../../queries/vibes';
import { useShowDetailsQuery } from '../../queries/hooks';
import { SHOW_PARAM } from '../../routes/showParam';
import { pickWatchLinkEntry } from '../../lib/watchLinks';
import { cn } from '../../lib/utils';
import { useUserData } from '../../stores/userData';
import type { AtlasState } from './useAtlas';
import { showHref } from './rooms';
import { memberRollup } from './rollups';
import { alignment, gapReading, hasStarted, landmarks, memberSignal } from './insights';

/**
 * The Overview room: the lean-back landing. The journey rail replaces the old
 * season pills AND the Extras tab — films are diamond nodes in release order.
 * The one chart-shaped thing here is the Run teaser, a sanctioned doorknob
 * that exists to make the second tab visible from the first.
 */

interface OverviewRoomProps {
  graph: SeriesGraph;
  atlas: AtlasState;
  vibes: VibesLookup;
  logs: EpisodeLog[];
  library: LibraryEntry[];
  reveal: boolean;
  onOpenRun: () => void;
}

/** AI summary first, MAL/Kitsu synopsis as fallback, raw description last. */
function SeasonSynopsis({ media }: { media: AnimeMedia }) {
  const details = useShowDetailsQuery(media);
  if (details.isPending) {
    return <div className="mt-4 h-16 animate-pulse rounded-field bg-surface-2" aria-hidden="true" />;
  }
  const raw =
    details.data?.details.aiSummary ??
    details.data?.details.mal?.synopsis ??
    details.data?.details.kitsu?.synopsis ??
    details.data?.full?.description ??
    null;
  if (raw === null || raw.trim() === '') return null;
  const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return <p className="mt-4 text-sm leading-relaxed text-fg-secondary line-clamp-4">{text}</p>;
}

function year(entry: SeriesEntry): string {
  return entry.startDate?.year ? String(entry.startDate.year) : '—';
}

function isFuture(entry: SeriesEntry, media: AnimeMedia | undefined, now: Date): boolean {
  if (media?.status === 'NOT_YET_RELEASED') return true;
  if (!entry.startDate?.year) return false;
  return !hasStarted(entry.startDate, now);
}

function premiereLine(entry: SeriesEntry, now: Date): string {
  const d = entry.startDate;
  if (!d?.year) return 'Announced';
  if (!d.month) return `Premieres ${d.year}`;
  const date = new Date(d.year, d.month - 1, d.day ?? 1);
  const label = date.toLocaleDateString(undefined, { month: 'short', day: d.day ? 'numeric' : undefined, year: 'numeric' });
  const days = Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
  return days > 0 && days < 400 ? `Premieres ${label} · in ${days} day${days === 1 ? '' : 's'}` : `Premieres ${label}`;
}

const RAIL_PIPS = 6;

export function OverviewRoom({ graph, atlas, vibes, logs, library, reveal, onOpenRun }: OverviewRoomProps) {
  const now = useMemo(() => new Date(), []);
  const [searchParams] = useSearchParams();
  const customSite = useUserData((s) => s.uiPrefs.customSource?.name);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // A selection that no longer names a season (franchise re-resolved) falls through.
  const validSelected = selectedId !== null && atlas.seasons.some((e) => e.id === selectedId) ? selectedId : null;
  const featuredId = validSelected ?? atlas.target?.memberId ?? atlas.seasons.at(-1)?.id ?? null;
  const featured = atlas.seasons.find((e) => e.id === featuredId);
  const featuredMedia = featured !== undefined ? atlas.mediaById.get(featured.id) : undefined;
  const featuredRollup = featured !== undefined ? memberRollup(logs, featured.id) : null;
  const featuredEntry = featured !== undefined ? library.find((l) => l.showId === featured.id) : undefined;
  const featuredGap = gapReading(featuredEntry?.showScore ?? null, featuredRollup?.avgEpisodeScore ?? null);
  const watchLink = pickWatchLinkEntry(featuredMedia?.externalLinks, customSite);

  // The teaser's headline: the loudest night you are allowed to know about.
  const teaser = useMemo(() => {
    let loudest: { label: string; episode: number; comments: number } | null = null;
    const allScores: (number | null)[] = [];
    const allTones: ReturnType<typeof memberSignal>['tones'] = [];
    for (const entry of atlas.seasons) {
      const count = Math.max(atlas.airedByMember.get(entry.id) ?? 0, entry.episodes ?? 0);
      if (count === 0) continue;
      const signal = memberSignal(vibes.get, entry.id, count);
      const scores: (number | null)[] = Array.from({ length: count }, () => null);
      for (const log of logs) {
        if (log.showId === entry.id && log.episodeNumber <= count) scores[log.episodeNumber - 1] = log.score;
      }
      allScores.push(...scores);
      allTones.push(...signal.tones);
      const frontier = atlas.progress.get(entry.id)?.maxWatched ?? 0;
      for (const ep of landmarks(signal.comments)) {
        if (!reveal && ep > frontier) continue;
        const comments = signal.comments[ep - 1];
        if (comments !== null && (loudest === null || comments > loudest.comments)) {
          loudest = { label: entry.seasonLabel, episode: ep, comments };
        }
      }
    }
    return { loudest, alignment: alignment(allScores, allTones) };
  }, [atlas.seasons, atlas.airedByMember, atlas.progress, vibes, logs, reveal]);

  const futureEntries = graph.entries.filter((e) => isFuture(e, atlas.mediaById.get(e.id), now));

  return (
    <div className="mt-4 space-y-4">
      {/* Journey rail — a mixed selector-plus-links strip, deliberately not a tablist */}
      <div className="rounded-card border border-[var(--series-edge)] bg-[var(--series-bg)] p-3 shadow-e1">
        <div className="scrollbar-hide flex items-stretch gap-2.5 overflow-x-auto p-1" role="group" aria-label="Seasons and films">
          {graph.entries.map((entry) => {
            const media = atlas.mediaById.get(entry.id);
            if (entry.isAttachment) {
              const future = isFuture(entry, media, now);
              const seen = (atlas.progress.get(entry.id)?.watched.size ?? 0) > 0;
              return (
                <Link
                  key={entry.id}
                  to={showHref(searchParams, SHOW_PARAM, entry.id)}
                  preventScrollReset
                  aria-label={`${entry.title} (${entry.format || 'film'}${seen ? ', watched' : future ? ', upcoming' : ''})`}
                  className="flex min-h-11 w-16 shrink-0 flex-col items-center justify-center gap-1.5 rounded-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 rotate-45 items-center justify-center rounded-xs border',
                      future
                        ? 'border-dashed border-hero-text-low'
                        : 'border-[var(--series-ink)] bg-[var(--series-well)]',
                    )}
                  >
                    {seen && <span className="-rotate-45 text-micro text-[var(--series-ink)]">✓</span>}
                  </span>
                  <span className="line-clamp-2 max-w-16 text-center text-micro leading-tight text-hero-text-low">
                    {entry.seasonLabel}
                  </span>
                </Link>
              );
            }
            const progress = atlas.progress.get(entry.id);
            const aired = atlas.airedByMember.get(entry.id) ?? 0;
            const total = Math.max(entry.episodes ?? aired, aired, 1);
            const filled = Math.round(((progress?.watched.size ?? 0) / total) * RAIL_PIPS);
            const memberScore = library.find((l) => l.showId === entry.id)?.showScore ?? null;
            const selected = entry.id === featuredId;
            return (
              <button
                key={entry.id}
                aria-pressed={selected}
                onClick={() => setSelectedId(entry.id)}
                className={cn(
                  'flex min-h-11 min-w-40 shrink-0 items-center gap-2.5 rounded-inner border px-3 py-2 text-left transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  selected
                    ? 'border-[var(--series-ink)] bg-[var(--series-well)]'
                    : 'border-[var(--series-edge)] bg-[var(--series-well)] hover:border-[var(--series-ink)]/50',
                )}
              >
                {media?.coverImage?.large !== undefined && (
                  <img src={media.coverImage.large} alt="" className="h-9 w-[26px] shrink-0 rounded-xs object-cover" />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-xs font-semibold', selected ? 'text-hero-text-hi' : 'text-hero-text-mid')}>
                    {entry.seasonLabel}
                  </span>
                  <span className="mt-1.5 flex h-[5px] w-[4.5rem] gap-0.5" aria-hidden="true">
                    {Array.from({ length: RAIL_PIPS }, (_, i) => (
                      <span
                        key={i}
                        className="flex-1 rounded-full"
                        style={{ background: i < filled ? 'var(--series-ink)' : 'var(--series-track)' }}
                      />
                    ))}
                  </span>
                  <span className="mt-1 block text-micro text-hero-text-low">
                    {progress?.watched.size ?? 0}/{total}
                    {memberScore !== null && (
                      <>
                        {' · '}
                        <Star className="inline h-2.5 w-2.5 fill-warning-400 text-warning-400" aria-hidden="true" /> {memberScore}
                      </>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* The Run teaser — the sanctioned doorknob */}
      {vibes.size > 0 && (
        <button
          onClick={onOpenRun}
          className="flex w-full items-center gap-4 rounded-card border border-edge bg-surface-1 p-4 text-left shadow-e1 transition-colors hover:border-edge-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="min-w-0 flex-1">
            <p className="text-micro uppercase tracking-wider text-fg-muted">The Run</p>
            <p className="mt-1 text-sm text-fg-secondary">
              {teaser.loudest !== null ? (
                <>
                  {teaser.loudest.label} E{teaser.loudest.episode} is still the loudest night —{' '}
                  {teaser.loudest.comments >= 1000 ? `${(teaser.loudest.comments / 1000).toFixed(1)}k` : teaser.loudest.comments} comments.
                </>
              ) : (
                'Every episode, community and you, on one axis.'
              )}
              {teaser.alignment !== null && <> You and the crowd agree {teaser.alignment.pct}% of the way.</>}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-accent-400">Open The Run →</span>
        </button>
      )}

      {/* Featured season stage */}
      {featured !== undefined && (
        <section className="flex flex-col gap-5 rounded-card border border-edge bg-surface-1 p-5 shadow-e1 sm:flex-row">
          {featuredMedia?.coverImage?.large !== undefined && (
            <img src={featuredMedia.coverImage.large} alt="" className="h-56 w-40 shrink-0 rounded-field object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-fg">{featured.title}</h2>
            <p className="mt-0.5 text-xs text-fg-muted">
              {featured.format || 'TV'} · {year(featured)}
              {featured.episodes != null && ` · ${featured.episodes} episodes`}
              {featuredMedia?.averageScore != null && ` · ${featuredMedia.averageScore}% on AniList`}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-xs">
              <div className="rounded-field bg-surface-2 p-3">
                <p className="text-caption uppercase tracking-wider text-fg-faint">Your overall</p>
                <p className="mt-0.5 flex items-center gap-1 text-lg font-semibold text-fg tabular-nums">
                  <Star className="h-4 w-4 text-warning-400" aria-hidden="true" />
                  {featuredEntry?.showScore != null ? featuredEntry.showScore : '—'}
                </p>
              </div>
              <div className="rounded-field bg-surface-2 p-3">
                <p className="text-caption uppercase tracking-wider text-fg-faint">Episode avg</p>
                <p className="mt-0.5 text-lg font-semibold text-fg tabular-nums">
                  {featuredRollup?.avgEpisodeScore ?? '—'}
                  {featuredRollup !== null && featuredRollup.scored > 0 && (
                    <span className="ml-1 text-xs font-normal text-fg-faint">({featuredRollup.scored} rated)</span>
                  )}
                </p>
              </div>
            </div>
            {featuredGap !== null && (
              <p className={cn('mt-1.5 text-caption', featuredGap.gap > 0.2 ? 'text-success-300' : 'text-fg-faint')}>
                gap {featuredGap.gap > 0 ? '+' : ''}
                {featuredGap.gap} — {featuredGap.label}
              </p>
            )}

            {featuredMedia !== undefined && <SeasonSynopsis media={featuredMedia} />}

            <div className="mt-4 flex flex-wrap gap-2">
              {watchLink !== undefined && (
                <a
                  href={watchLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-control border border-edge px-4 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Watch on {watchLink.site}
                  <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
              <Link
                to={showHref(searchParams, SHOW_PARAM, featured.id)}
                preventScrollReset
                className="inline-flex h-11 items-center rounded-control border border-edge px-4 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Quick view &amp; bulk logging
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Next-stop radar */}
      {futureEntries.length > 0 && (
        <section className="flex items-center gap-4 rounded-card border border-edge bg-surface-1 p-4 shadow-e1">
          <span
            className="mx-1 h-7 w-7 shrink-0 rotate-45 rounded-xs border border-dashed border-accent-500 bg-surface-2"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">
              {futureEntries[0].seasonLabel} — the next stop is {futureEntries[0].format === 'MOVIE' ? 'a film' : 'a season'}
            </p>
            <p className="mt-0.5 text-caption text-fg-muted">{premiereLine(futureEntries[0], now)}</p>
          </div>
        </section>
      )}

      {/* Off the timeline */}
      {atlas.extras.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-fg-muted">Off the timeline</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {atlas.extras.map((entry) => (
              <Link
                key={entry.id}
                to={showHref(searchParams, SHOW_PARAM, entry.id)}
                preventScrollReset
                className="flex min-h-11 items-center justify-between gap-3 rounded-inner border border-edge bg-surface-1 px-4 py-2.5 transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg-secondary">{entry.title}</span>
                  <span className="text-xs text-fg-faint">
                    {entry.format || '—'} · {year(entry)}
                    {(atlas.progress.get(entry.id)?.watched.size ?? 0) > 0 && ' · watched ✓'}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-fg-faint">Open</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
