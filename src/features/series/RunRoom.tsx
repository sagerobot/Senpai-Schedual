import { Star } from 'lucide-react';
import { useMemo } from 'react';
import type { EpisodeLog, LibraryEntry } from '../../types';
import type { SeriesEntry, SeriesGraph } from '../../series/labeling';
import type { VibesLookup } from '../../queries/vibes';
import { SENTIMENT } from '../../components/VibeChip';
import { seasonFullyAired } from '../../lib/aired';
import { cn } from '../../lib/utils';
import type { AtlasState } from './useAtlas';
import { memberRollup } from './rollups';
import { RunChart, type RunSeasonSpan, type RunSlot } from './RunChart';
import {
  ASPECT_LABELS,
  ASPECT_ORDER,
  ENDING_VERDICT_LABELS,
  alignment,
  aspectRollup,
  endingVerdict,
  gapReading,
  hasStarted,
  heresies,
  landmarks,
  memberSignal,
  worthItHorizon,
  type EndingVerdict,
  type Tone,
} from './insights';

/**
 * The Run room: the franchise as a story told in data. One shared x-axis up
 * top, season report cards under it, the five aspects' evolution below.
 *
 * The frontier is page state: with the reveal toggle off, everything past
 * your watched line keeps its engagement shape but loses its sentiment, its
 * landmarks, and its tooltip reading. Season-level aggregates (ending
 * verdicts, aspect roll-ups) are spoiler-safe by design and always render.
 */

interface RunRoomProps {
  graph: SeriesGraph;
  atlas: AtlasState;
  vibes: VibesLookup;
  logs: EpisodeLog[];
  library: LibraryEntry[];
  reveal: boolean;
  onOpenEpisode: (memberId: number, episode: number) => void;
}

/** Above this many episode slots the chart shows only the trailing window. */
const MAX_CHART_EPISODES = 240;

const TONE_GLYPH: Record<Tone, string> = { positive: '▲', mixed: '◆', negative: '▼' };

/** The one sentiment-chip recipe, shared with VibeChip — never a fourth copy. */
const TONE_PILL: Record<Tone, string> = {
  positive: SENTIMENT.positive.flat,
  mixed: SENTIMENT.mixed.flat,
  negative: SENTIMENT.negative.flat,
};

const VERDICT_TONE: Record<EndingVerdict, Tone> = { sticks: 'positive', divisive: 'negative', fades: 'mixed' };

interface SeasonComputed {
  entry: SeriesEntry;
  episodeCount: number;
  tones: (Tone | null)[];
  comments: (number | null)[];
  scores: (number | null)[];
  frontier: number;
  worthIt: number | null;
  landmarkEps: Set<number>;
  heresyEps: Set<number>;
  foundCount: number;
  verdict: EndingVerdict | null;
  aspects: ReturnType<typeof aspectRollup>;
}

export function RunRoom({ graph, atlas, vibes, logs, library, reveal, onOpenEpisode }: RunRoomProps) {
  const computed = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    const nowDate = new Date();
    const seasons: SeasonComputed[] = [];
    for (const entry of atlas.seasons) {
      const aired = atlas.airedByMember.get(entry.id) ?? 0;
      const frontier = atlas.progress.get(entry.id)?.maxWatched ?? 0;
      const episodeCount = Math.max(aired, entry.episodes ?? 0, frontier);
      if (episodeCount === 0) continue;
      const media = atlas.mediaById.get(entry.id);
      // A landing verdict only once the run has actually landed.
      const ended =
        media !== undefined ? seasonFullyAired(media, nowSec) : entry.episodes != null && aired >= entry.episodes;
      const signal = memberSignal(vibes.get, entry.id, episodeCount);
      const scores: (number | null)[] = Array.from({ length: episodeCount }, () => null);
      for (const log of logs) {
        if (log.showId === entry.id && log.episodeNumber <= episodeCount) scores[log.episodeNumber - 1] = log.score;
      }
      const entries = Array.from({ length: episodeCount }, (_, i) => vibes.get(entry.id, i + 1));
      seasons.push({
        entry,
        episodeCount,
        tones: signal.tones,
        comments: signal.comments,
        scores,
        frontier,
        worthIt: worthItHorizon(signal.tones),
        landmarkEps: new Set(landmarks(signal.comments)),
        heresyEps: new Set(heresies(scores, signal.tones).map((h) => h.episode)),
        foundCount: signal.tones.filter((t) => t !== null).length,
        verdict: ended ? endingVerdict(signal.tones) : null,
        aspects: aspectRollup(entries),
      });
    }

    const allScores = seasons.flatMap((s) => s.scores);
    const allTones = seasons.flatMap((s) => s.tones);
    const totalFound = seasons.reduce((a, s) => a + s.foundCount, 0);

    // Long-runner guard: the chart shows the trailing window, never a
    // 13000px axis. When even the newest season alone exceeds the budget, the
    // window opens inside it (its trailing episodes) rather than leaking whole.
    let chartSeasons = seasons;
    const startEps = new Map<number, number>();
    const totalEpisodes = seasons.reduce((a, s) => a + s.episodeCount, 0);
    if (totalEpisodes > MAX_CHART_EPISODES) {
      let budget = MAX_CHART_EPISODES;
      const tail: SeasonComputed[] = [];
      for (let i = seasons.length - 1; i >= 0; i--) {
        if (budget - seasons[i].episodeCount < 0) break;
        budget -= seasons[i].episodeCount;
        tail.unshift(seasons[i]);
      }
      if (tail.length === 0) {
        const last = seasons[seasons.length - 1];
        startEps.set(last.entry.id, last.episodeCount - MAX_CHART_EPISODES + 1);
        tail.push(last);
      }
      chartSeasons = tail;
    }

    const chartSeasonIds = new Set(chartSeasons.map((s) => s.entry.id));
    const slots: RunSlot[] = [];
    const spans: RunSeasonSpan[] = [];
    for (const entry of graph.entries) {
      if (entry.isAttachment) {
        if (slots.length > 0) {
          const media = atlas.mediaById.get(entry.id);
          const started = media?.status === 'NOT_YET_RELEASED' ? false : hasStarted(entry.startDate, nowDate);
          slots.push({ kind: 'film', label: entry.seasonLabel.slice(0, 16), future: !started });
        }
        continue;
      }
      const season = chartSeasons.find((s) => s.entry.id === entry.id);
      if (season === undefined || !chartSeasonIds.has(entry.id)) continue;
      spans.push({
        key: String(entry.id),
        label: `${entry.seasonLabel}${entry.startDate?.year ? ` · ${entry.startDate.year}` : ''}`,
        worthIt: season.worthIt,
      });
      for (let ep = startEps.get(entry.id) ?? 1; ep <= season.episodeCount; ep++) {
        const sealed = !reveal && ep > season.frontier;
        const entryAt = vibes.get(entry.id, ep);
        slots.push({
          kind: 'episode',
          memberId: entry.id,
          episode: ep,
          seasonKey: String(entry.id),
          tone: sealed ? null : season.tones[ep - 1],
          comments: season.comments[ep - 1],
          score: season.scores[ep - 1],
          summary: !sealed && entryAt?.status === 'found' ? entryAt.summary.slice(0, 110) : null,
          sealed,
          heresy: season.heresyEps.has(ep),
          landmark: season.landmarkEps.has(ep) && (reveal || ep <= season.frontier),
        });
      }
    }

    const shownEpisodes = slots.filter((s) => s.kind === 'episode').length;
    return {
      seasons,
      slots,
      spans,
      totalEpisodes,
      shownEpisodes,
      totalFound,
      align: alignment(allScores, allTones),
    };
  }, [graph.entries, atlas, vibes, logs, reveal]);

  const anyAspects = computed.seasons.some((s) => Object.keys(s.aspects).length > 0);

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-card border border-edge bg-surface-1 p-4 shadow-e1 md:p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-base font-semibold text-fg">The Run</h2>
          <p className="text-caption text-fg-muted">every episode, community and you, one axis</p>
          <div className="ml-auto flex items-center gap-3 text-caption text-fg-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3.5 rounded bg-accent-400" aria-hidden="true" /> your score
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3.5 rounded bg-fg-muted/20" aria-hidden="true" /> engagement
            </span>
            <span>▲◆▼ community</span>
            {computed.align !== null && (
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-fg-secondary">
                You &amp; the crowd: <span className="font-semibold text-fg">{computed.align.pct}% aligned</span>
              </span>
            )}
          </div>
        </div>

        {computed.totalFound === 0 ? (
          <p className="mt-4 rounded-inner border border-edge bg-surface-0 p-5 text-center text-sm text-fg-muted">
            No community corpus for this franchise — r/anime episode threads barely exist before ~2013. The Run rests;
            your own scores and dates live on in Episodes.
          </p>
        ) : (
          <>
            {computed.shownEpisodes < computed.totalEpisodes && (
              <p className="mt-2 text-caption text-fg-faint max-md:hidden">
                Long runner: the chart shows the last {computed.shownEpisodes} of {computed.totalEpisodes} episodes —
                earlier stretches fold once arcs land.
              </p>
            )}
            <div className="mt-3 max-md:hidden">
              <RunChart slots={computed.slots} seasons={computed.spans} onOpenEpisode={onOpenEpisode} />
            </div>
            {/* Mobile: the Run folds into per-season bands — a 63-episode axis is never pinch-zoomed */}
            <div className="mt-3 space-y-3 md:hidden">
              {computed.seasons.map((s) => (
                <div key={s.entry.id}>
                  <p className="mb-1 flex items-baseline justify-between text-caption text-fg-muted">
                    <span className="font-semibold text-fg-secondary">{s.entry.seasonLabel}</span>
                    {s.worthIt !== null && <span className="text-sent-positive-fg">settles · E{s.worthIt}</span>}
                  </p>
                  <div className="flex flex-wrap gap-px" aria-label={`${s.entry.seasonLabel} sentiment by episode`}>
                    {s.tones.map((tone, i) => {
                      const sealed = !reveal && i + 1 > s.frontier;
                      return (
                        <span
                          key={i}
                          className={cn(
                            'flex h-4 w-3.5 items-center justify-center rounded-[3px] text-micro leading-none',
                            sealed
                              ? 'border border-dashed border-edge'
                              : tone === 'positive'
                                ? 'bg-sent-positive/45 text-sent-positive-fg'
                                : tone === 'mixed'
                                  ? 'bg-sent-mixed/45 text-sent-mixed-fg'
                                  : tone === 'negative'
                                    ? 'bg-sent-negative/45 text-sent-negative-fg'
                                    : 'bg-surface-2',
                          )}
                        >
                          {!sealed && tone !== null ? TONE_GLYPH[tone] : ''}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Season report cards */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {computed.seasons.map((s) => {
          const rollup = memberRollup(logs, s.entry.id);
          const overall = library.find((l) => l.showId === s.entry.id)?.showScore ?? null;
          const gap = gapReading(overall, rollup.avgEpisodeScore);
          return (
            <article key={s.entry.id} className="rounded-card border border-edge bg-surface-1 p-4 shadow-e1">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="truncate text-sm font-semibold text-fg">{s.entry.seasonLabel}</h3>
                <span className="shrink-0 text-caption text-fg-faint">{s.entry.startDate?.year ?? '—'}</span>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <div className="rounded-field bg-surface-2 px-2.5 py-2">
                  <p className="text-micro uppercase tracking-wider text-fg-faint">Overall</p>
                  <p className="mt-0.5 flex items-center gap-1 text-base font-semibold text-fg tabular-nums">
                    <Star className="h-3.5 w-3.5 text-warning-400" aria-hidden="true" />
                    {overall ?? '—'}
                  </p>
                </div>
                <div className="rounded-field bg-surface-2 px-2.5 py-2">
                  <p className="text-micro uppercase tracking-wider text-fg-faint">Ep avg</p>
                  <p className="mt-0.5 text-base font-semibold text-fg tabular-nums">{rollup.avgEpisodeScore ?? '—'}</p>
                </div>
              </div>
              <p className={cn('mt-1.5 text-caption', gap !== null && gap.gap > 0.2 ? 'text-success-300' : 'text-fg-faint')}>
                {gap !== null ? (
                  <>
                    gap {gap.gap > 0 ? '+' : ''}
                    {gap.gap} — {gap.label}
                  </>
                ) : (
                  'rate episodes to see your gap'
                )}
              </p>
              {s.verdict !== null && (
                <span
                  className={cn(
                    'mt-2.5 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-caption font-semibold',
                    TONE_PILL[VERDICT_TONE[s.verdict]],
                  )}
                >
                  {TONE_GLYPH[VERDICT_TONE[s.verdict]]} {ENDING_VERDICT_LABELS[s.verdict]}
                </span>
              )}
              {Object.keys(s.aspects).length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {ASPECT_ORDER.map((key) => {
                    const tone = s.aspects[key];
                    if (tone === undefined) return null;
                    return (
                      <span
                        key={key}
                        className={cn('rounded-full border px-2 py-0.5 text-micro font-medium', TONE_PILL[tone])}
                      >
                        {ASPECT_LABELS[key]} {TONE_GLYPH[tone]}
                      </span>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </section>

      {/* Aspect evolution lane */}
      {anyAspects && computed.seasons.length > 1 && (
        <section className="rounded-card border border-edge bg-surface-1 p-4 shadow-e1 md:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-muted">How the five aspects moved</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="text-caption">
              <thead>
                <tr>
                  <th className="pr-4 text-left font-normal text-fg-faint" scope="col">
                    <span className="sr-only">Aspect</span>
                  </th>
                  {computed.seasons.map((s) => (
                    <th key={s.entry.id} scope="col" className="min-w-16 px-1.5 pb-1 text-center font-normal text-fg-faint">
                      {s.entry.startDate?.year ?? s.entry.seasonLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ASPECT_ORDER.filter((key) => computed.seasons.some((s) => s.aspects[key] !== undefined)).map((key) => (
                  <tr key={key}>
                    <th scope="row" className="pr-4 text-left font-normal text-fg-muted">
                      {ASPECT_LABELS[key]}
                    </th>
                    {computed.seasons.map((s) => {
                      const tone = s.aspects[key];
                      return (
                        <td key={s.entry.id} className="px-1.5 py-0.5 text-center">
                          {tone !== undefined ? (
                            <span className={cn('inline-flex w-full justify-center rounded-full border px-2 py-0.5', TONE_PILL[tone])}>
                              {TONE_GLYPH[tone]}
                              <span className="sr-only"> {tone}</span>
                            </span>
                          ) : (
                            <span className="text-fg-faint">·</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
