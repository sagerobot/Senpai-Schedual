/**
 * The one place the "go watch it" button picks its verb.
 *
 * "Continue" only makes sense when there is something to continue from, so
 * the verb follows what the viewer has already done with the show:
 *
 * - nothing logged            → "Start Episode 1" / "Start Episode 1 (S2)"
 * - something logged          → "Continue · Ep 5" / "Continue · Ep 5 (S2)"
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
   * Season label in franchise contexts ("Season 2", "Final Season"). It is
   * abbreviated and parenthesised after the episode: "(S2)", "(Final)".
   */
  seasonLabel?: string;
  /** Tonight's episode is the only one waiting, so "Watch" rather than "Continue". */
  caughtUp?: boolean;
}

/** "Season 2" → "S2", "Part 2" → "Pt 2", "Final Season" → "Final"; anything else passes through. */
export function shortSeasonLabel(label: string): string {
  return label
    .replace(/\bFinal Season\b/gi, 'Final')
    .replace(/\bSeason (\d+)/gi, 'S$1')
    .replace(/\bPart (\d+)/gi, 'Pt $1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function watchCta(input: WatchCtaInput): string {
  const { episode, started, seasonLabel, caughtUp = false } = input;
  const suffix = seasonLabel === undefined ? '' : ` (${shortSeasonLabel(seasonLabel)})`;

  if (!started) return `Start Episode ${episode}${suffix}`;
  if (caughtUp && seasonLabel === undefined) return `Watch Episode ${episode}`;
  return `Continue · Ep ${episode}${suffix}`;
}
