/**
 * Largest font size in [min, max] (whole pixels) for which `fits` holds.
 *
 * `fits` is assumed monotone — if a size fits, every smaller size fits — so a
 * binary search settles in ~4 probes for the ranges card titles use. When even
 * `min` overflows, `min` is returned: the caller shows the whole name at the
 * floor size rather than clipping it. Never truncate a title.
 */
export function fitFontSize(min: number, max: number, fits: (px: number) => boolean): number {
  if (max <= min) return min;
  if (fits(max)) return max;
  let lo = min;
  let hi = max - 1;
  let best = min;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}
