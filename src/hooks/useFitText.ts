import { useLayoutEffect, useState, type RefObject } from 'react';
import { fitFontSize } from '../lib/fitText';

/**
 * Shrinks an element's font until its content fits the element's own box.
 *
 * The hook probes sizes by writing `style.fontSize` on `box` and comparing
 * its `scrollHeight` to the slot height,
 * then settles on the largest size that fits. It re-measures when the text
 * changes, when the web font finishes loading (the fallback face is narrower,
 * so a first measure can be a size too generous), and whenever `content` — an
 * inline wrapper around the text — changes size, which covers a column-width
 * change at a breakpoint without watching the window.
 *
 * `overflows` is true only when even `min` cannot hold the text: the caller
 * should let the slot grow rather than clip — a name is never truncated.
 *
 * Environments without layout (happy-dom) report 0 for both measurements, so
 * every size "fits" and the max is used — tests see stable markup.
 */
export function useFitText(
  box: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  text: string,
  min: number,
  max: number,
  /** The slot height in px. Measured against directly, so a caller that lets
   * the box grow on overflow cannot oscillate between "fits" and "grows". */
  slotPx: number,
): { fontSize: number; overflows: boolean } {
  const [fit, setFit] = useState({ fontSize: max, overflows: false });

  useLayoutEffect(() => {
    const el = box.current;
    const inner = content.current;
    if (!el) return;

    const measure = () => {
      const prev = el.style.fontSize;
      const next = fitFontSize(min, max, (px) => {
        el.style.fontSize = `${px}px`;
        return el.scrollHeight <= slotPx;
      });
      el.style.fontSize = `${next}px`;
      const overflows = el.scrollHeight > slotPx;
      el.style.fontSize = prev;
      setFit((f) => (f.fontSize === next && f.overflows === overflows ? f : { fontSize: next, overflows }));
    };

    measure();
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    if (typeof ResizeObserver === 'undefined' || !inner) return;
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [box, content, text, min, max, slotPx]);

  return fit;
}
