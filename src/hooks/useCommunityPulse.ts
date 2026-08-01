import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { postEnvelope } from '../api/aiEnvelope';

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

export type PulseState = 'idle' | 'loading' | 'ok' | 'no_key' | 'resting' | 'error';

/**
 * Click-to-load community vibe. Nothing fires on mount or on episode change —
 * the grounded-search call only happens when the caller invokes `load()`.
 * Changing the target show/episode resets to `idle` and clears any loaded
 * pulse; a sequence counter guarantees a stale in-flight response can never
 * overwrite a newer one.
 */
export function useCommunityPulse(title: string, episodeNumber: number, showId: number) {
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

  return { pulse, state, load, retryAfterSeconds };
}
