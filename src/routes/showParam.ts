import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * The show detail modal lives in a search param rather than component state, so
 * every open show has a shareable URL and Back closes (or steps back through)
 * the modal. RootLayout hosts the modal; any view opens one through `useOpenShow`.
 */
export const SHOW_PARAM = 'show';

/** Positive integers only — anything else is not an AniList media id. */
export function parseShowId(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

/**
 * Returns a callback that opens a show's detail modal by pushing `?show=<id>`
 * onto the current location, preserving every other search param (`q`, filters)
 * so closing returns the view exactly as it was.
 */
export function useOpenShow(): (show: { id: number }) => void {
  const [, setSearchParams] = useSearchParams();
  return useCallback(
    (show: { id: number }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(SHOW_PARAM, String(show.id));
          return next;
        },
        { preventScrollReset: true },
      );
    },
    [setSearchParams],
  );
}
