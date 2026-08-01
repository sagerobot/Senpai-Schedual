import { z } from 'zod';
import { postEnvelope, type AiAvailability } from './aiEnvelope';

export interface ShowDetails {
  mal?: {
    score: number | null;
    synopsis: string | null;
  };
  kitsu?: {
    averageRating: string | null;
    synopsis: string | null;
  };
  aiSummary?: string;
  /** Outcome of the AI summary request, so the modal can tell "off" from "failed". */
  aiStatus?: AiAvailability;
}

/**
 * A pure fetcher. Caching lives in the query layer
 * (`useShowDetailsQuery`, key `['showDetails', id]`, 24h) — this module used to
 * keep its own `anime_details_<id>` localStorage entry and no longer does.
 */

const SummaryPayloadSchema = z.object({ summary: z.string().min(1) });

/** Both upstreams answer 429 with a JSON body, so a bare `.json()` would read as "no data". */
async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

async function fetchAiSummary(
  showId: number,
  synopses: string,
): Promise<{ aiSummary: string | null; aiStatus: AiAvailability }> {
  const result = await postEnvelope('/api/generate-summary', { showId, synopses }, SummaryPayloadSchema);
  if (result.kind === 'ok') return { aiSummary: result.data.summary, aiStatus: 'ok' };
  return { aiSummary: null, aiStatus: result.kind };
}

function buildSynopses(anilistSynopsis: string, details: ShowDetails): string {
  let synopsesText = `AniList:\n${anilistSynopsis}\n`;
  if (details.mal?.synopsis) synopsesText += `\nMyAnimeList:\n${details.mal.synopsis}\n`;
  if (details.kitsu?.synopsis) synopsesText += `\nKitsu:\n${details.kitsu.synopsis}\n`;
  return synopsesText;
}

/**
 * Throws when every upstream that was tried failed and nothing usable came
 * back. A show that genuinely has no MAL or Kitsu match still resolves (with
 * an empty result) and caches normally; a transient Jikan/Kitsu 429 does not,
 * so it can never freeze an empty modal for the cache's whole lifetime.
 *
 * `anilistSynopsis` may be a promise: list records no longer carry
 * `description`, so the caller passes the in-flight by-id fetch's description
 * instead. It is awaited only where the synopses are assembled for the AI
 * summary — the Jikan/Kitsu fetches above never wait on it. The caller is
 * expected to hand over a non-rejecting promise; a rejection degrades to an
 * empty synopsis rather than failing the whole details fetch.
 */
export async function fetchShowDetails(
  idMal: number | null,
  title: string,
  anilistSynopsis: string | Promise<string>,
  showId: number,
): Promise<ShowDetails> {
  const details: ShowDetails = {};

  const [jikanRes, kitsuRes] = await Promise.allSettled([
    idMal ? fetchJson(`https://api.jikan.moe/v4/anime/${idMal}`) : Promise.resolve(null),
    fetchJson(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title)}`),
  ]);

  if (jikanRes.status === 'fulfilled') {
    const data = (jikanRes.value as { data?: { score?: number; synopsis?: string } } | null)?.data;
    if (data) {
      details.mal = { score: data.score || null, synopsis: data.synopsis || null };
    }
  }

  if (kitsuRes.status === 'fulfilled') {
    const list = (kitsuRes.value as { data?: { attributes: Record<string, string | null> }[] } | null)?.data;
    if (list && list.length > 0) {
      const bestMatch = list[0];
      details.kitsu = {
        averageRating: bestMatch.attributes.averageRating || null,
        synopsis: bestMatch.attributes.synopsis || null,
      };
    }
  }

  const resolvedSynopsis = await Promise.resolve(anilistSynopsis).catch(() => '');

  const { aiSummary, aiStatus } = await fetchAiSummary(showId, buildSynopses(resolvedSynopsis, details));
  if (aiSummary) details.aiSummary = aiSummary;
  details.aiStatus = aiStatus;

  const gotNothing = !details.mal && !details.kitsu && !details.aiSummary;
  const upstreamFailed = jikanRes.status === 'rejected' || kitsuRes.status === 'rejected';
  if (gotNothing && upstreamFailed) {
    throw new Error('Could not load details for this show.');
  }

  return details;
}
