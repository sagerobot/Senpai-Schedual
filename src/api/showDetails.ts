import { z } from 'zod';
import { postEnvelope, type AiAvailability } from './aiEnvelope';
import { readJSON, writeJSON } from '../stores/storage';

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
  /** Outcome of the AI summary request. Surfaced for the modal, never cached. */
  aiStatus?: AiAvailability;
}

const CACHE_KEY_PREFIX = 'anime_details_';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/** What actually goes into localStorage — aiStatus is deliberately absent. */
const CachedDetailsSchema = z.object({
  timestamp: z.number(),
  data: z.object({
    mal: z.object({ score: z.number().nullable(), synopsis: z.string().nullable() }).optional(),
    kitsu: z.object({ averageRating: z.string().nullable(), synopsis: z.string().nullable() }).optional(),
    aiSummary: z.string().optional(),
  }),
});

type CachedDetails = z.infer<typeof CachedDetailsSchema>;

const SummaryPayloadSchema = z.object({ summary: z.string().min(1) });

async function fetchAiSummary(
  showId: number,
  synopses: string,
): Promise<{ aiSummary: string | null; aiStatus: AiAvailability }> {
  const result = await postEnvelope('/api/generate-summary', { showId, synopses }, SummaryPayloadSchema);
  if (result.kind === 'ok') return { aiSummary: result.data.summary, aiStatus: 'ok' };
  return { aiSummary: null, aiStatus: result.kind };
}

function buildSynopses(anilistSynopsis: string, details: CachedDetails['data']): string {
  let synopsesText = `AniList:\n${anilistSynopsis}\n`;
  if (details.mal?.synopsis) synopsesText += `\nMyAnimeList:\n${details.mal.synopsis}\n`;
  if (details.kitsu?.synopsis) synopsesText += `\nKitsu:\n${details.kitsu.synopsis}\n`;
  return synopsesText;
}

export async function fetchShowDetails(idMal: number | null, title: string, anilistSynopsis: string, showId: number): Promise<ShowDetails> {
  const cacheKey = `${CACHE_KEY_PREFIX}${showId}`;
  const cached = readJSON<CachedDetails | null>(cacheKey, CachedDetailsSchema.nullable(), null);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    if (cached.data.aiSummary) {
      return { ...cached.data, aiStatus: 'ok' };
    }
    // External details are fresh but no real summary was ever cached (the AI
    // was off, resting, or failing last time). Re-attempt just the summary —
    // the server caches summaries, so this is a cheap call when it exists.
    const { aiSummary, aiStatus } = await fetchAiSummary(showId, buildSynopses(anilistSynopsis, cached.data));
    if (aiSummary) {
      writeJSON(cacheKey, { timestamp: cached.timestamp, data: { ...cached.data, aiSummary } });
      return { ...cached.data, aiSummary, aiStatus };
    }
    return { ...cached.data, aiStatus };
  }

  const details: CachedDetails['data'] = {};

  const [jikanRes, kitsuRes] = await Promise.allSettled([
    idMal ? fetch(`https://api.jikan.moe/v4/anime/${idMal}`).then(r => r.json()) : Promise.resolve(null),
    fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title)}`).then(r => r.json())
  ]);

  if (jikanRes.status === 'fulfilled' && jikanRes.value?.data) {
    details.mal = {
      score: jikanRes.value.data.score || null,
      synopsis: jikanRes.value.data.synopsis || null,
    };
  }

  if (kitsuRes.status === 'fulfilled' && kitsuRes.value?.data?.length > 0) {
    // try to find closest match or just take first
    const bestMatch = kitsuRes.value.data[0];
    details.kitsu = {
      averageRating: bestMatch.attributes.averageRating || null,
      synopsis: bestMatch.attributes.synopsis || null,
    };
  }

  const { aiSummary, aiStatus } = await fetchAiSummary(showId, buildSynopses(anilistSynopsis, details));

  // Only a real summary is persisted — no_key/resting/error must not poison
  // the 24h cache with placeholder copy or a frozen absence-of-summary.
  if (aiSummary) details.aiSummary = aiSummary;
  writeJSON(cacheKey, { timestamp: Date.now(), data: details });

  return { ...details, aiStatus };
}
