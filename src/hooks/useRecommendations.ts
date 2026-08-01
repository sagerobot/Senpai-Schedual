import { useState, useEffect, useCallback, useRef } from 'react';
import { z } from 'zod';
import { AnimeMedia, LibraryEntry } from '../types';
import { postEnvelope } from '../api/aiEnvelope';
import { readJSON, writeJSON } from '../stores/storage';
import { useLibrarySeries } from './useLibrarySeries';

interface RecommendedShow {
  show: AnimeMedia;
  score: number;
  reason: string;
  basedOn: string[];
}

interface RecState {
  lastComputedScoreCount: number;
  items: RecommendedShow[];
  notInterestedIds: number[];
}

export type RecommendationsStatus = 'idle' | 'loading' | 'ok' | 'no_key' | 'resting' | 'error';

/**
 * The wire shape of a recommended show (the field set of the server's
 * RECOMMENDATIONS_QUERY — narrower than MEDIA_FIELDS), normalized into a real
 * AnimeMedia so cards and the detail modal can render it.
 */
const RecShowWireSchema = z
  .object({
    id: z.number(),
    idMal: z.number().nullable().catch(null),
    title: z.object({
      romaji: z.string().nullable().catch(null),
      english: z.string().nullable().catch(null),
      userPreferred: z.string().nullable().catch(null),
    }),
    coverImage: z.object({
      large: z.string(),
      color: z.string().nullable().catch(null),
    }),
    startDate: z
      .object({
        year: z.number().nullable(),
        month: z.number().nullable(),
        day: z.number().nullable(),
      })
      .nullable()
      .catch(null),
    nextAiringEpisode: z
      .object({ airingAt: z.number(), timeUntilAiring: z.number(), episode: z.number() })
      .nullable()
      .catch(null),
    status: z.string().nullable().catch(null),
    format: z.string().nullable().catch(null),
    episodes: z.number().nullable().catch(null),
    averageScore: z.number().nullable().catch(null),
    genres: z.array(z.string()).nullable().catch(null),
    description: z.string().nullable().catch(null),
    bannerImage: z.string().nullable().catch(null),
    externalLinks: z
      .array(
        z.object({
          url: z.string().nullable(),
          site: z.string(),
          icon: z.string().nullable().catch(null),
          color: z.string().nullable().catch(null),
        }),
      )
      .nullable()
      .catch(null),
  })
  .transform(
    (s): AnimeMedia => ({
      id: s.id,
      idMal: s.idMal,
      averageScore: s.averageScore,
      title: s.title,
      bannerImage: s.bannerImage,
      coverImage: { large: s.coverImage.large, color: s.coverImage.color },
      startDate: s.startDate,
      nextAiringEpisode: s.nextAiringEpisode,
      status: s.status,
      format: s.format,
      episodes: s.episodes,
      externalLinks: (s.externalLinks ?? []).flatMap((l) =>
        l.url === null ? [] : [{ url: l.url, site: l.site, icon: l.icon, color: l.color }],
      ),
      genres: s.genres ?? [],
      description: s.description,
    }),
  );

const RecommendedShowSchema = z.object({
  show: RecShowWireSchema,
  score: z.number(),
  reason: z.string(),
  basedOn: z.array(z.string()).catch([]),
});

const RecommendationsPayloadSchema = z.object({
  recommendations: z.array(RecommendedShowSchema),
});

/** Persisted state — per-field catches so one corrupt field degrades, not the whole blob. */
const RecStateSchema = z.object({
  lastComputedScoreCount: z.number().catch(0),
  items: z.array(RecommendedShowSchema).catch([]),
  notInterestedIds: z.array(z.number()).catch([]),
});

const DEFAULT_STATE: RecState = { lastComputedScoreCount: 0, items: [], notInterestedIds: [] };

export function useRecommendations(library: LibraryEntry[]) {
  const [state, setState] = useState<RecState>(() =>
    readJSON('senpai_recommendations', RecStateSchema, DEFAULT_STATE),
  );

  const [status, setStatus] = useState<RecommendationsStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { graphs: seriesGraphs, resolving } = useLibrarySeries(library);

  // forceRecompute sets the flag and bumps the token so the effect below
  // re-runs and computes unconditionally — regardless of library size.
  const forcedRef = useRef(false);
  const [forceToken, setForceToken] = useState(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    writeJSON('senpai_recommendations', state);
  }, [state]);

  const removeRecommendation = useCallback((id: number) => {
    setState(s => ({
      ...s,
      items: s.items.filter(i => i.show.id !== id),
      notInterestedIds: [...s.notInterestedIds, id]
    }));
  }, []);

  const computeIfNeeded = useCallback(async () => {
    if (resolving || inFlightRef.current) return;

    const scoredEntries = library.filter(e => e.showScore !== null);
    if (scoredEntries.length === 0) return;

    const neverProduced = state.items.length === 0 && state.lastComputedScoreCount === 0;
    const drifted = Math.abs(scoredEntries.length - state.lastComputedScoreCount) >= 5;
    if (!forcedRef.current && !drifted && !neverProduced) return;

    forcedRef.current = false;
    inFlightRef.current = true;
    setStatus('loading');
    setErrorMessage(null);
    try {
      // Collect all related IDs for exclusions
      const excludeSet = new Set<number>();
      Object.values(seriesGraphs).forEach(g => {
        g.entries.forEach(e => excludeSet.add(e.id));
      });

      // Group top entries by series and compute average score
      const seriesScores = new Map<number, { scoreSum: number, count: number }>();
      scoredEntries.forEach(e => {
        let sid = e.showId;
        // Find series ID
        for (const g of Object.values(seriesGraphs)) {
          if (g.entries.some(ge => ge.id === e.showId)) {
            sid = g.seriesId;
            break;
          }
        }
        if (!seriesScores.has(sid)) seriesScores.set(sid, { scoreSum: 0, count: 0 });
        const curr = seriesScores.get(sid)!;
        curr.scoreSum += e.showScore!;
        curr.count += 1;
      });

      const topSeriesIds = Array.from(seriesScores.entries())
        .map(([sid, stats]) => ({ showId: sid, showScore: stats.scoreSum / stats.count }))
        .sort((a, b) => b.showScore - a.showScore)
        .slice(0, 15);

      // Exclude all things from the library graphs + not interested
      const allLibraryIdsToExclude = Array.from(excludeSet);

      const result = await postEnvelope(
        '/api/recommendations',
        {
          libraryIds: allLibraryIdsToExclude,
          topEntries: topSeriesIds,
          notInterestedIds: state.notInterestedIds
        },
        RecommendationsPayloadSchema,
      );

      if (result.kind === 'ok') {
        // Record the score count even when the list is empty — otherwise an
        // honest empty result would re-fire the pipeline on every render.
        setState(s => ({
          ...s,
          lastComputedScoreCount: scoredEntries.length,
          items: result.data.recommendations
        }));
        setStatus('ok');
      } else {
        // Keep whatever is cached; only the status changes.
        setStatus(result.kind);
        if (result.kind === 'error') setErrorMessage(result.message);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [library, seriesGraphs, resolving, state.lastComputedScoreCount, state.items.length, state.notInterestedIds, forceToken]);

  useEffect(() => {
    computeIfNeeded();
  }, [computeIfNeeded]);

  const forceRecompute = useCallback(() => {
    forcedRef.current = true;
    setForceToken(t => t + 1);
  }, []);

  return {
    recommendations: state.items,
    loading: status === 'loading' || resolving,
    status,
    errorMessage,
    removeRecommendation,
    forceRecompute
  };
}
