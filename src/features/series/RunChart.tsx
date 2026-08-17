import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Tone } from './insights';

/**
 * The Run: the whole franchise on one x-axis. Three stacked lanes share it —
 * thread engagement (area), your episode scores (line), community sentiment
 * (glyph band) — which is how two measures of different scale coexist without
 * a dual y-axis. Films are diamond ticks between seasons.
 *
 * Sentiment is never color-only: every tinted band cell carries its glyph.
 * Sealed slots (past your frontier, reveal off) keep the engagement shape but
 * drop the sentiment, the glyph, and the tooltip's reading — a soft outline
 * that says "there is a night here you haven't had yet".
 */

export interface RunEpisodeSlot {
  kind: 'episode';
  memberId: number;
  episode: number;
  seasonKey: string;
  tone: Tone | null;
  comments: number | null;
  score: number | null;
  summary: string | null;
  sealed: boolean;
  heresy: boolean;
  landmark: boolean;
}

export interface RunFilmSlot {
  kind: 'film';
  label: string;
  future: boolean;
}

export type RunSlot = RunEpisodeSlot | RunFilmSlot;

export interface RunSeasonSpan {
  key: string;
  label: string;
  /** Worth-It Horizon episode within this season, when computable. */
  worthIt: number | null;
}

interface RunChartProps {
  slots: RunSlot[];
  seasons: RunSeasonSpan[];
  onOpenEpisode: (memberId: number, episode: number) => void;
}

const ML = 34;
const MR = 12;
const H = 240;
const ENG_BASE = 56;
const ENG_TOP = 10;
const BAND_Y = 188;
const BAND_H = 20;

const TONE_GLYPH: Record<Tone, string> = { positive: '▲', mixed: '◆', negative: '▼' };
const TONE_FILL: Record<Tone, string> = {
  positive: 'var(--color-sent-positive)',
  mixed: 'var(--color-sent-mixed)',
  negative: 'var(--color-sent-negative)',
};
const TONE_INK: Record<Tone, string> = {
  positive: 'var(--color-sent-positive-fg)',
  mixed: 'var(--color-sent-mixed-fg)',
  negative: 'var(--color-sent-negative-fg)',
};
const TONE_WORD: Record<Tone, string> = { positive: 'Positive', mixed: 'Mixed', negative: 'Negative' };

const scoreY = (v: number) => 178 - v * 11.2;

function formatComments(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

export function RunChart({ slots, seasons, onOpenEpisode }: RunChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const slotW = 13;
  const W = ML + MR + slots.length * slotW;
  const x = (i: number) => ML + (i + 0.5) * slotW;

  // Land on the newest episodes, not 2019: when the axis overflows, open
  // scrolled to the right end — that is where the frontier lives.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (el !== null) el.scrollLeft = el.scrollWidth;
  }, [slots.length]);

  const engMax = useMemo(() => {
    let max = 0;
    for (const s of slots) if (s.kind === 'episode' && s.comments !== null && s.comments > max) max = s.comments;
    return max;
  }, [slots]);
  const engY = (v: number) => (engMax === 0 ? ENG_BASE : ENG_BASE - (v / engMax) * (ENG_BASE - ENG_TOP));

  // Per-season geometry: index ranges, engagement areas, score polylines.
  const geometry = useMemo(() => {
    const bySeason = new Map<string, number[]>();
    slots.forEach((s, i) => {
      if (s.kind !== 'episode') return;
      const list = bySeason.get(s.seasonKey) ?? [];
      list.push(i);
      bySeason.set(s.seasonKey, list);
    });

    return seasons
      .filter((season) => bySeason.has(season.key))
      .map((season) => {
        const idx = bySeason.get(season.key)!;
        const engPts: string[] = [];
        for (const i of idx) {
          const s = slots[i] as RunEpisodeSlot;
          if (s.comments !== null) engPts.push(`${x(i)},${engY(s.comments)}`);
        }
        const engPath =
          engPts.length > 1
            ? `M${x(idx[0])},${ENG_BASE} L${engPts.join(' L')} L${x(idx[idx.length - 1])},${ENG_BASE} Z`
            : null;

        const scoreSegs: string[][] = [];
        let current: string[] = [];
        for (const i of idx) {
          const s = slots[i] as RunEpisodeSlot;
          if (s.score !== null) current.push(`${x(i)},${scoreY(s.score)}`);
          else if (current.length > 0) {
            scoreSegs.push(current);
            current = [];
          }
        }
        if (current.length > 0) scoreSegs.push(current);

        const worthItSlot =
          season.worthIt === null
            ? null
            : idx.find((i) => (slots[i] as RunEpisodeSlot).episode === season.worthIt) ?? null;

        return { season, idx, engPath, scoreSegs, worthItSlot, center: (x(idx[0]) + x(idx[idx.length - 1])) / 2 };
      });
  }, [slots, seasons, engMax]); // eslint-disable-line react-hooks/exhaustive-deps -- x/engY derive from slots/engMax

  const hovered = hover !== null ? slots[hover] : null;

  // Index from pointer coordinates — clicks and taps must not depend on a
  // hover state that touch input never populates.
  const slotAt = (clientX: number, el: SVGSVGElement): number | null => {
    const i = Math.floor((clientX - el.getBoundingClientRect().left - ML) / slotW);
    return i >= 0 && i < slots.length ? i : null;
  };

  // Keyboard path: arrows walk the episode slots, Enter/Space opens one.
  const step = (from: number | null, dir: 1 | -1): number | null => {
    let i = from === null ? (dir === 1 ? 0 : slots.length - 1) : from + dir;
    while (i >= 0 && i < slots.length) {
      if (slots[i].kind === 'episode') return i;
      i += dir;
    }
    return from;
  };

  return (
    <div ref={wrapRef} className="relative overflow-x-auto" onPointerLeave={() => setHover(null)}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        tabIndex={0}
        aria-label="The Run: thread engagement, your scores, and community sentiment for every episode. Use arrow keys to browse episodes, Enter to open one."
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ fontFamily: 'var(--font-sans)' }}
        onPointerMove={(e) => setHover(slotAt(e.clientX, e.currentTarget))}
        onClick={(e) => {
          const i = slotAt(e.clientX, e.currentTarget);
          const s = i !== null ? slots[i] : null;
          if (s?.kind === 'episode' && !s.sealed) onOpenEpisode(s.memberId, s.episode);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            setHover(step(hover, e.key === 'ArrowRight' ? 1 : -1));
          } else if (e.key === 'Enter' || e.key === ' ') {
            if (hovered?.kind === 'episode' && !hovered.sealed) {
              e.preventDefault();
              onOpenEpisode(hovered.memberId, hovered.episode);
            }
          }
        }}
        onBlur={() => setHover(null)}
      >
        {/* score gridlines — the one labeled y-scale */}
        {[10, 5].map((v) => (
          <g key={v}>
            <line x1={ML} y1={scoreY(v)} x2={W - MR} y2={scoreY(v)} style={{ stroke: 'var(--color-edge)' }} strokeDasharray="2 4" />
            <text x={ML - 7} y={scoreY(v) + 3} textAnchor="end" fontSize={9} style={{ fill: 'var(--color-fg-faint)' }}>
              {v}
            </text>
          </g>
        ))}

        {/* season boundaries */}
        {slots.map((s, i) =>
          s.kind === 'film' || (i > 0 && s.kind === 'episode' && slots[i - 1].kind === 'episode' && (slots[i - 1] as RunEpisodeSlot).seasonKey !== s.seasonKey) ? (
            <line key={`b${i}`} x1={x(i) - slotW / 2} y1={8} x2={x(i) - slotW / 2} y2={212} style={{ stroke: 'var(--color-edge-strong)' }} opacity={0.5} />
          ) : null,
        )}

        {/* engagement areas */}
        {geometry.map((g) =>
          g.engPath !== null ? <path key={`e${g.season.key}`} d={g.engPath} style={{ fill: 'var(--color-fg-muted)' }} opacity={0.16} /> : null,
        )}

        {/* worth-it markers */}
        {geometry.map((g) =>
          g.worthItSlot !== null ? (
            <g key={`w${g.season.key}`}>
              <line x1={x(g.worthItSlot)} y1={62} x2={x(g.worthItSlot)} y2={210} style={{ stroke: 'var(--color-sent-positive-fg)' }} strokeDasharray="3 3" opacity={0.55} />
              <text x={x(g.worthItSlot) + 4} y={72} fontSize={9} style={{ fill: 'var(--color-sent-positive-fg)' }}>
                consensus settles · E{g.season.worthIt}
              </text>
            </g>
          ) : null,
        )}

        {/* landmark stars */}
        {slots.map((s, i) =>
          s.kind === 'episode' && s.landmark && s.comments !== null ? (
            <g key={`l${i}`}>
              <circle cx={x(i)} cy={engY(s.comments)} r={3} style={{ fill: 'var(--color-warning-400)' }} />
              <text x={x(i)} y={Math.max(10, engY(s.comments) - 6)} textAnchor="middle" fontSize={9} style={{ fill: 'var(--color-warning-300)' }}>
                ✦ E{s.episode} · {formatComments(s.comments)}
              </text>
            </g>
          ) : null,
        )}

        {/* your score lines */}
        {geometry.map((g) =>
          g.scoreSegs.map((seg, j) =>
            seg.length > 1 ? (
              <polyline key={`s${g.season.key}-${j}`} points={seg.join(' ')} fill="none" style={{ stroke: 'var(--color-accent-400)' }} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <circle key={`s${g.season.key}-${j}`} cx={Number(seg[0].split(',')[0])} cy={Number(seg[0].split(',')[1])} r={2.2} style={{ fill: 'var(--color-accent-400)' }} />
            ),
          ),
        )}

        {/* heresy dots: your loudest disagreements, ringed in surface */}
        {slots.map((s, i) =>
          s.kind === 'episode' && s.heresy && s.score !== null ? (
            <g key={`h${i}`}>
              <circle cx={x(i)} cy={scoreY(s.score)} r={6.5} style={{ fill: 'var(--color-surface-1)' }} />
              <circle cx={x(i)} cy={scoreY(s.score)} r={4.5} style={{ fill: 'var(--color-accent-300)' }} />
            </g>
          ) : null,
        )}

        {/* sentiment band + film diamonds */}
        {slots.map((s, i) => {
          if (s.kind === 'film') {
            const fy = BAND_Y + BAND_H / 2;
            return (
              <g key={`f${i}`}>
                <rect
                  x={x(i) - 5}
                  y={fy - 5}
                  width={10}
                  height={10}
                  rx={2}
                  transform={`rotate(45 ${x(i)} ${fy})`}
                  fill="none"
                  style={{ stroke: s.future ? 'var(--color-accent-500)' : 'var(--color-fg-faint)' }}
                  strokeDasharray={s.future ? '2 2' : undefined}
                />
                <text x={x(i)} y={234} textAnchor="middle" fontSize={8} style={{ fill: 'var(--color-fg-faint)' }}>
                  {s.label}
                </text>
              </g>
            );
          }
          if (s.sealed || s.tone === null) {
            return (
              <rect
                key={`c${i}`}
                x={x(i) - slotW / 2 + 0.75}
                y={BAND_Y}
                width={slotW - 1.5}
                height={BAND_H}
                rx={2.5}
                style={{ fill: s.sealed ? 'transparent' : 'var(--color-surface-2)', stroke: 'var(--color-edge)' }}
                strokeDasharray={s.sealed ? '2 2' : undefined}
              />
            );
          }
          return (
            <g key={`c${i}`}>
              <rect x={x(i) - slotW / 2 + 0.75} y={BAND_Y} width={slotW - 1.5} height={BAND_H} rx={2.5} style={{ fill: TONE_FILL[s.tone] }} opacity={0.45} />
              <text x={x(i)} y={BAND_Y + 14} textAnchor="middle" fontSize={7} style={{ fill: TONE_INK[s.tone] }}>
                {TONE_GLYPH[s.tone]}
              </text>
            </g>
          );
        })}

        {/* season labels */}
        {geometry.map((g) => (
          <text key={`t${g.season.key}`} x={g.center} y={224} textAnchor="middle" fontSize={9.5} style={{ fill: 'var(--color-fg-faint)' }}>
            {g.season.label}
          </text>
        ))}

        {/* hover crosshair */}
        {hover !== null && hovered?.kind === 'episode' && (
          <line x1={x(hover)} y1={8} x2={x(hover)} y2={212} style={{ stroke: 'var(--color-fg-faint)' }} strokeDasharray="2 3" opacity={0.6} />
        )}
      </svg>

      {/* tooltip — HTML, positioned over the plot */}
      {hover !== null && hovered?.kind === 'episode' && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-56 rounded-inner border border-edge-strong bg-surface-2 p-3 shadow-e2"
          style={{ left: Math.max(0, Math.min(x(hover) + 10, W - 240)) }}
        >
          <p className="text-label font-semibold text-fg">
            {seasons.find((se) => se.key === hovered.seasonKey)?.label ?? ''} · Ep {hovered.episode}
          </p>
          {hovered.sealed ? (
            <p className="mt-1 text-caption text-fg-muted">Sealed until you log it — the reading is waiting.</p>
          ) : (
            <>
              <p className="mt-1 text-caption text-fg-secondary">
                {hovered.score !== null && <>You {hovered.score} · </>}
                {hovered.tone !== null ? (
                  <span style={{ color: TONE_INK[hovered.tone] }}>
                    {TONE_GLYPH[hovered.tone]} {TONE_WORD[hovered.tone]}
                  </span>
                ) : (
                  <span className="text-fg-muted">no community reading</span>
                )}
                {hovered.comments !== null && <span className="text-fg-faint"> · 💬 {formatComments(hovered.comments)}</span>}
              </p>
              {hovered.summary !== null && <p className="mt-1 text-caption italic text-fg-muted">“{hovered.summary}”</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
