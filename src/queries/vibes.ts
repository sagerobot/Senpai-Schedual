import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { z } from 'zod';
import { parseVibesFile, vibeKey, type VibeEntry } from '../lib/vibesFile';
import { queryKeys } from './keys';

/**
 * The remembered r/anime episode sentiments, fetched once per session.
 *
 * `GET /api/vibes` relays a file the hourly routine writes, so this is one
 * same-origin request that answers "how was episode N" for every show at once —
 * which is what lets a card render a sentiment chip and the detail modal paint a
 * vibe card with no click and no Gemini call.
 *
 * Missing is a normal state. No vibes file configured, a server that cannot
 * reach it, a malformed payload — all of them resolve to an empty index, and an
 * empty index means the app behaves exactly as it did before any of this
 * existed: no chips, and a vibe check when the user asks for one.
 *
 * Not persisted to localStorage (see keys.ts): the server holds this in memory
 * and serves it hot, and it is the largest payload the app fetches.
 */

const VIBES_ENDPOINT = '/api/vibes';

/** Shorter than the server's 10s upstream timeout: chips are never worth a wait. */
const REQUEST_TIMEOUT_MS = 8_000;

const TEN_MINUTES = 10 * 60 * 1000;

const responseSchema = z.object({ status: z.literal('ok'), vibes: z.unknown() });

export type VibesIndex = Map<string, VibeEntry>;

const EMPTY_INDEX: VibesIndex = new Map();

async function fetchVibesIndex(): Promise<VibesIndex> {
  let payload: unknown;
  try {
    const response = await fetch(VIBES_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // 404 { status: "unavailable" } is the configured-off answer, not a failure.
    if (!response.ok) return EMPTY_INDEX;
    payload = await response.json();
  } catch {
    return EMPTY_INDEX;
  }

  const envelope = responseSchema.safeParse(payload);
  if (!envelope.success) return EMPTY_INDEX;

  const file = parseVibesFile(envelope.data.vibes);
  if (file === null) {
    console.warn('[vibes] file failed validation; sentiment chips are off this session.');
    return EMPTY_INDEX;
  }

  return new Map(Object.entries(file.entries));
}

export interface VibesLookup {
  /** The remembered reading for one episode, or `undefined`. */
  get(showId: number, episode: number): VibeEntry | undefined;
  size: number;
}

/**
 * Lookup for the remembered sentiments. The returned object is stable while the
 * underlying index is, so it is safe as a `useMemo` dependency in the containers
 * that map it over a list of cards.
 */
export function useVibesIndex(): VibesLookup {
  const { data } = useQuery({
    queryKey: queryKeys.vibes(),
    queryFn: fetchVibesIndex,
    staleTime: TEN_MINUTES,
    gcTime: TEN_MINUTES,
    // Never a reason to interrupt anything: the app is fully usable without it.
    retry: false,
    refetchOnWindowFocus: false,
  });

  const index = data ?? EMPTY_INDEX;

  return useMemo(
    () => ({
      get: (showId: number, episode: number) => index.get(vibeKey(showId, episode)),
      size: index.size,
    }),
    [index],
  );
}
