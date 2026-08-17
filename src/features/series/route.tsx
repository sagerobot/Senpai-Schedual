import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { AnimeMedia, EpisodeLog, LibraryEntry } from '../../types';
import type { SeriesGraph } from '../../series/labeling';
import type { VibesLookup } from '../../queries/vibes';
import { useMediaByIds } from '../../queries/hooks';
import { useVibesIndex } from '../../queries/vibes';
import { parseShowId } from '../../routes/showParam';
import { useSeriesGraph } from '../../series/useSeriesGraphs';
import { selectLibraryArray, selectLogsArray, useUserData } from '../../stores/userData';
import { EpisodeView } from './EpisodeView';
import { EpisodesRoom } from './EpisodesRoom';
import { OverviewRoom } from './OverviewRoom';
import { RunRoom } from './RunRoom';
import { SeriesShell } from './SeriesShell';
import { parseRoom, VIEW_PARAM, type SeriesRoom } from './rooms';
import { seriesSkin } from './seriesSkin';
import { useAtlas } from './useAtlas';

/**
 * `/series/:id` — the Atlas. `:id` is ANY member's AniList id; the graph
 * resolves the franchise from whichever member the link carried. The router's
 * loader has already redirected junk ids, so the param parses by construction.
 *
 * Three URL citizens live here, with different history semantics:
 * - `?view=` addresses a room. Switching rooms REPLACES history — tabs are
 *   peers, and Back should leave the page, not un-tab.
 * - `?ep=<memberId>-<n>` is an episode permalink (a layer): opening one
 *   PUSHES, carrying `view=episodes` in the same navigation, so Back returns
 *   to the room you came from.
 * - `?show=` stays the app-wide quick-view modal, hosted by RootLayout.
 *
 * The loaded page is keyed by `graph.seriesId`: SeriesRoute stays mounted when
 * only `:id` changes (the modal's franchise link can hop franchises), and the
 * reveal toggle plus every room's local selection must die with the franchise
 * they belong to — spoiler consent does not transfer.
 */

const EP_PARAM = 'ep';
const EP_SHAPE = /^(\d{1,10})-(\d{1,4})$/;

function parseEpParam(value: string | null): { memberId: number; episode: number } | null {
  if (value === null) return null;
  const match = EP_SHAPE.exec(value);
  if (match === null) return null;
  return { memberId: Number(match[1]), episode: Number(match[2]) };
}

export function SeriesRoute() {
  const params = useParams();
  const showId = parseShowId(params.id ?? null) ?? 0;

  const graph = useSeriesGraph(showId);
  const memberIds = useMemo(() => graph.data?.entries.map((e) => e.id) ?? [], [graph.data]);
  const { media } = useMediaByIds(memberIds);
  const vibes = useVibesIndex();

  const logs = useUserData(selectLogsArray);
  const library = useUserData(selectLibraryArray);

  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseRoom(searchParams.get(VIEW_PARAM));
  const epTarget = parseEpParam(searchParams.get(EP_PARAM));

  const setView = useCallback(
    (room: SeriesRoom) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (room === 'overview') next.delete(VIEW_PARAM);
          else next.set(VIEW_PARAM, room);
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  const openEpisode = useCallback(
    (memberId: number, episode: number) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(VIEW_PARAM, 'episodes');
          next.set(EP_PARAM, `${memberId}-${episode}`);
          return next;
        },
        { preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  const closeEpisode = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(EP_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [setSearchParams]);

  if (graph.isPending) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" role="status">
          <span className="sr-only">Loading franchise…</span>
        </div>
      </div>
    );
  }

  if (graph.isError || graph.data === undefined) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center space-y-4 text-center">
        <h1 className="text-2xl font-bold text-fg">Couldn&apos;t load this franchise</h1>
        <p className="max-w-sm text-sm text-fg-faint">AniList didn&apos;t answer, or the id doesn&apos;t exist.</p>
        <Link
          to="/schedule"
          className="flex h-11 items-center rounded-field bg-accent-600 px-4 text-sm font-semibold text-fg-inverse transition-colors hover:bg-accent-500"
        >
          Back to Schedule
        </Link>
      </div>
    );
  }

  return (
    <AtlasContent
      key={graph.data.seriesId}
      graph={graph.data}
      media={media}
      vibes={vibes}
      logs={logs}
      library={library}
      view={view}
      onViewChange={setView}
      epTarget={epTarget}
      onOpenEpisode={openEpisode}
      onCloseEpisode={closeEpisode}
    />
  );
}

interface AtlasContentProps {
  graph: SeriesGraph;
  media: AnimeMedia[];
  vibes: VibesLookup;
  logs: EpisodeLog[];
  library: LibraryEntry[];
  view: SeriesRoom;
  onViewChange: (room: SeriesRoom) => void;
  epTarget: { memberId: number; episode: number } | null;
  onOpenEpisode: (memberId: number, episode: number) => void;
  onCloseEpisode: () => void;
}

/**
 * Everything below the loading gate, keyed per franchise. Owns the reveal
 * toggle (per-visit, per-franchise — deliberately not persisted) and the
 * `--series-*` tint scope both the shell and the rooms consume.
 */
function AtlasContent({
  graph,
  media,
  vibes,
  logs,
  library,
  view,
  onViewChange,
  epTarget,
  onOpenEpisode,
  onCloseEpisode,
}: AtlasContentProps) {
  const [reveal, setReveal] = useState(false);
  const atlas = useAtlas(graph, media, logs, library);

  const tint =
    atlas.mediaById.get(graph.seriesId)?.coverImage?.color ??
    atlas.mediaById.get(atlas.seasons[0]?.id ?? 0)?.coverImage?.color;

  const epMember = epTarget !== null ? graph.entries.find((e) => e.id === epTarget.memberId) : undefined;

  return (
    <div className="mx-auto max-w-5xl" style={seriesSkin(tint)}>
      <SeriesShell
        graph={graph}
        atlas={atlas}
        view={view}
        onViewChange={onViewChange}
        reveal={reveal}
        onToggleReveal={() => setReveal((v) => !v)}
      />

      <div role="tabpanel" id={`series-room-${view}`} aria-labelledby={`series-tab-${view}`}>
        {view === 'overview' && (
          <OverviewRoom
            graph={graph}
            atlas={atlas}
            vibes={vibes}
            logs={logs}
            library={library}
            reveal={reveal}
            onOpenRun={() => onViewChange('run')}
          />
        )}
        {view === 'run' && (
          <RunRoom
            graph={graph}
            atlas={atlas}
            vibes={vibes}
            logs={logs}
            library={library}
            reveal={reveal}
            onOpenEpisode={onOpenEpisode}
          />
        )}
        {view === 'episodes' && (
          <EpisodesRoom atlas={atlas} vibes={vibes} reveal={reveal} onOpenEpisode={onOpenEpisode} />
        )}
      </div>

      {epTarget !== null && epMember !== undefined && (
        <EpisodeView
          key={`${epTarget.memberId}-${epTarget.episode}`}
          seriesTitle={graph.title}
          member={epMember}
          media={media.find((m) => m.id === epTarget.memberId)}
          episode={epTarget.episode}
          sealed={!reveal && epTarget.episode > (atlas.progress.get(epTarget.memberId)?.maxWatched ?? 0)}
          onClose={onCloseEpisode}
        />
      )}
    </div>
  );
}
