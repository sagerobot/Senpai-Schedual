import { useMemo } from 'react';
import type { AnimeMedia, EpisodeLog, LibraryEntry } from '../../types';
import type { SeriesEntry, SeriesGraph } from '../../series/labeling';
import type { WatchState } from '../../lib/status';
import { getAiredEpisodesCount } from '../../lib/aired';
import { pickWatchLink } from '../../lib/watchLinks';
import { useUserData } from '../../stores/userData';
import { franchiseRollup, type FranchiseRollup } from './rollups';
import {
  behindFrom,
  continueTarget,
  progressByMember,
  type ContinueTarget,
  type MemberProgress,
} from './insights';

/**
 * The shared spine of the Atlas, computed once per render pass and handed to
 * the shell and every room: watch progress per member, the Continue target,
 * the behind count from that point onward, and the franchise roll-ups.
 */

export interface AtlasState {
  seasons: SeriesEntry[];
  extras: SeriesEntry[];
  mediaById: Map<number, AnimeMedia>;
  progress: Map<number, MemberProgress>;
  /** Aired episode count per season member (attachments excluded). */
  airedByMember: Map<number, number>;
  target: ContinueTarget | null;
  targetWatchUrl?: string;
  behind: number;
  watchState: WatchState;
  franchise: FranchiseRollup;
  /** Mean of the member overall scores you have given, one decimal. */
  overallMean: number | null;
  totalEpisodes: number | null;
}

function entryHasStarted(entry: SeriesEntry, nowYear: number): boolean {
  const year = entry.startDate?.year;
  return year !== null && year !== undefined && year <= nowYear;
}

export function useAtlas(graph: SeriesGraph, media: AnimeMedia[], logs: EpisodeLog[], library: LibraryEntry[]): AtlasState {
  const customSite = useUserData((s) => s.uiPrefs.customSource?.name);

  return useMemo(() => {
    const seasons = graph.entries.filter((e) => !e.isAttachment);
    const extras = graph.entries.filter((e) => e.isAttachment);
    const mediaById = new Map(media.map((m) => [m.id, m]));
    const memberIds = graph.entries.map((e) => e.id);
    const progress = progressByMember(logs, memberIds);

    const nowSec = Math.floor(Date.now() / 1000);
    const nowYear = new Date().getFullYear();
    const airedByMember = new Map<number, number>();
    for (const entry of seasons) {
      const m = mediaById.get(entry.id);
      if (m !== undefined) {
        airedByMember.set(entry.id, getAiredEpisodesCount(m, nowSec));
      } else {
        // Media not resolved yet: trust the graph's episode count for past
        // entries, and never invent aired episodes for a future one.
        airedByMember.set(entry.id, entryHasStarted(entry, nowYear) ? (entry.episodes ?? 0) : 0);
      }
    }

    const seasonIds = seasons.map((e) => e.id);
    const target = continueTarget(seasonIds, progress, airedByMember);
    const behind = behindFrom(target, seasonIds, progress, airedByMember);

    const franchise = franchiseRollup(logs, memberIds);

    let watchState: WatchState;
    if (franchise.watched === 0) watchState = 'not-started';
    else if (target !== null) watchState = 'behind';
    else {
      const anyReleasing = seasons.some((e) => mediaById.get(e.id)?.status === 'RELEASING');
      watchState = anyReleasing ? 'caught-up' : 'finished';
    }

    const memberScores = library
      .filter((l) => memberIds.includes(l.showId) && l.showScore !== null)
      .map((l) => l.showScore as number);
    const overallMean =
      memberScores.length === 0
        ? null
        : Math.round((memberScores.reduce((a, b) => a + b, 0) / memberScores.length) * 10) / 10;

    const totalEpisodes = seasons.reduce<number | null>(
      (acc, e) => (e.episodes == null || acc === null ? null : acc + e.episodes),
      0,
    );

    const targetWatchUrl =
      target !== null ? pickWatchLink(mediaById.get(target.memberId)?.externalLinks, customSite) : undefined;

    return {
      seasons,
      extras,
      mediaById,
      progress,
      airedByMember,
      target,
      targetWatchUrl,
      behind,
      watchState,
      franchise,
      overallMean,
      totalEpisodes,
    };
  }, [graph.entries, media, logs, library, customSite]);
}
