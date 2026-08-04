import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { postEnvelope } from '../../api/aiEnvelope';
import { vibePayload, type VibeEntry, type VibeFoundEntry, type VibeQuietEntry } from '../../lib/vibesFile';

/** Mirrors the server's vibeOutputSchema (server/schemas.ts). */
const VibeCheckSchema = z.object({
  summary: z.string(),
  goods: z.array(z.string()),
  bads: z.array(z.string()),
  indicator: z.enum(['positive', 'mixed', 'negative']),
  upvotes: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  url: z.string(),
});

export type VibeCheck = z.infer<typeof VibeCheckSchema>;

export type PulseState = 'idle' | 'loading' | 'ok' | 'quiet' | 'not_found' | 'no_key' | 'resting' | 'error';

/** How long ago, in words, relative to a reference point. */
function gapLabel(fromMs: number, toMs: number): string {
  const minutes = Math.max(0, Math.round((toMs - fromMs) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/**
 * When an unsettled reading was taken, in words — "as of 3h after airing".
 *
 * `null` for a settled entry, which needs no caveat: it is the final reading and
 * will never change. An unsettled one is deliberately partial (the thread was
 * still filling up), and saying so is the honest way to show it early.
 */
export function asOfLabel(entry: VibeEntry, now = Date.now()): string | null {
  if (entry.settled) return null;
  const asOf = Date.parse(entry.asOf);
  if (Number.isNaN(asOf)) return null;
  if (entry.airedAt > 0 && asOf >= entry.airedAt * 1000) {
    return `as of ${gapLabel(entry.airedAt * 1000, asOf)} after airing`;
  }
  return `read ${gapLabel(asOf, now)} ago`;
}

/**
 * The community vibe for one episode, remembered first and fetched second.
 *
 * A `stored` entry — from the vibes file the server relays — wins outright and
 * renders with no click and no Gemini call: `found` displays immediately,
 * `not_found` reports `'not_found'` so the caller can say so plainly instead of
 * offering a search that has already been run and come back empty.
 *
 * Failing that, nothing fires on mount or on episode change; the grounded search
 * only happens when the caller invokes `load()`. Changing the target show or
 * episode resets to `idle` and clears any loaded pulse; a sequence counter
 * guarantees a stale in-flight response can never overwrite a newer one.
 */
export function useCommunityPulse(
  title: string,
  episodeNumber: number,
  showId: number,
  stored?: VibeEntry,
) {
  const [pulse, setPulse] = useState<VibeCheck | null>(null);
  const [state, setState] = useState<PulseState>('idle');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | undefined>(undefined);
  const seqRef = useRef(0);

  useEffect(() => {
    seqRef.current += 1; // invalidate any in-flight request for the old target
    setPulse(null);
    setState('idle');
    setRetryAfterSeconds(undefined);
  }, [title, episodeNumber, showId]);

  const load = useCallback(() => {
    const seq = ++seqRef.current;
    setPulse(null);
    setState('loading');
    setRetryAfterSeconds(undefined);

    void postEnvelope('/api/community-vibe', { showId, episodeNumber, title }, VibeCheckSchema).then(
      (result) => {
        if (seq !== seqRef.current) return; // a newer load or target change superseded this one

        if (result.kind === 'ok') {
          setPulse(result.data);
          setState('ok');
        } else if (result.kind === 'resting') {
          setRetryAfterSeconds(result.retryAfterSeconds);
          setState('resting');
        } else {
          setState(result.kind);
        }
      },
    );
  }, [title, episodeNumber, showId]);

  // The remembered reading is derived, not state: the vibes file usually lands
  // after the modal has already mounted, and a `stored` entry that arrives late
  // must still replace the idle prompt without a second render pass.
  const remembered: VibeFoundEntry | null = stored?.status === 'found' ? stored : null;
  // A quiet entry means the thread was verified and holds too few comments for
  // a sentiment read — offering a paid search would re-run a question with a
  // known answer, so it displays as its own state instead of the idle prompt.
  const quiet: VibeQuietEntry | null = stored?.status === 'quiet' ? stored : null;
  const settledMiss = stored?.status === 'not_found' && stored.settled;

  const displayState: PulseState =
    remembered !== null ? 'ok' : quiet !== null ? 'quiet' : settledMiss ? 'not_found' : state;

  return {
    pulse: remembered !== null ? vibePayload(remembered) : pulse,
    state: displayState,
    load,
    retryAfterSeconds,
    /** Set when the displayed pulse came from the vibes file rather than a fetch. */
    remembered,
    /** Set when the thread exists but is too quiet to read a sentiment from. */
    quiet,
  };
}
