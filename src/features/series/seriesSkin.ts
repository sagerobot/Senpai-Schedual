import type { CSSProperties } from 'react';

/**
 * The series hero's per-show tint (docs/design-language.md §12). The
 * hero-series tokens are neutral bases; the shell mixes the franchise's
 * `coverImage.color` into the grounds at fixed ratios and exposes the result
 * as `--series-*` variables its subtree consumes. Ink is never tinted — a
 * saturated cover color mixed into the light ink tier can fall out of AA.
 *
 * The mix ratios are part of the namespace contract and live only here.
 */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function seriesSkin(color: string | null | undefined): CSSProperties {
  const tint = typeof color === 'string' && HEX_COLOR.test(color) ? color : null;
  const mix = (token: string, keep: number) =>
    tint === null ? `var(${token})` : `color-mix(in oklab, var(${token}) ${keep}%, ${tint})`;
  return {
    '--series-bg': mix('--color-hero-series-bg', 86),
    '--series-well': mix('--color-hero-series-well', 88),
    '--series-edge': mix('--color-hero-series-edge', 80),
    '--series-track': mix('--color-hero-series-track', 88),
    '--series-ink': 'var(--color-hero-series-ink)',
  } as CSSProperties;
}
