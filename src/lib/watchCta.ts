/**
 * The one place the "go watch it" button picks its verb.
 *
 * "Continue" only makes sense when there is something to continue from, so
 * the verb follows what the viewer has already done with the show:
 *
 * - nothing logged            → "Start Episode 1" / "Start Season 2"
 * - something logged          → "Continue with Episode 5" / "Continue Season 2 — Ep 5"
 * - caught up, tonight's drop → "Watch Episode 9"
 *
 * "Started" is about the show, not the episode: a viewer who logged episode 3
 * and never episode 1 has still begun, so they get "Continue". Callers hand in
 * the episode number they already computed (drops use tonight's episode, the
 * deck uses next unwatched); this never recomputes it.
 */
export interface WatchCtaInput {
  /** The episode the button opens. */
  episode: number;
  /** Any episode of this show logged. */
  started: boolean;
  /**
   * Season label in franchise contexts ("Season 2", "Final Season"). With a
   * label, a fresh season reads "Start Season 2" — the season is what's new.
   */
  seasonLabel?: string;
  /** Tonight's episode is the only one waiting, so "Watch" rather than "Continue". */
  caughtUp?: boolean;
}

export type WatchCtaForm = 'long' | 'short';

export function watchCta(input: WatchCtaInput, form: WatchCtaForm = 'long'): string {
  const { episode, started, seasonLabel, caughtUp = false } = input;
  const ep = form === 'long' ? `Episode ${episode}` : `Ep ${episode}`;

  if (!started) {
    if (seasonLabel === undefined) return `Start ${ep}`;
    return episode === 1 ? `Start ${seasonLabel}` : `Start ${seasonLabel} — Ep ${episode}`;
  }
  if (seasonLabel !== undefined) return `Continue ${seasonLabel} — Ep ${episode}`;
  if (caughtUp) return `Watch ${ep}`;
  return form === 'long' ? `Continue with ${ep}` : `Continue · ${ep}`;
}
