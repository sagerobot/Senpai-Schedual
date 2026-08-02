import { useCallback, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useMediaByIds } from '../../queries/hooks';
import { parseShowId } from '../../routes/showParam';
import { useSeriesGraph } from '../../series/useSeriesGraphs';
import { selectLibraryArray, selectLogsArray, useUserData } from '../../stores/userData';
import { EpisodeView } from './EpisodeView';
import { SeriesView } from './SeriesView';

/**
 * `/series/:id` — the franchise page. `:id` is ANY member's AniList id; the
 * graph resolves the franchise from whichever member the link carried, so
 * every season's id is a valid address for the whole. The router's loader has
 * already redirected junk ids, so the param parses here by construction.
 *
 * Episodes live on `?ep=<memberId>-<n>`, mirroring the `?show=` pattern: Back
 * closes the episode view, and the URL is a shareable episode permalink.
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

  const logs = useUserData(selectLogsArray);
  const library = useUserData(selectLibraryArray);

  const [searchParams, setSearchParams] = useSearchParams();
  const epTarget = parseEpParam(searchParams.get(EP_PARAM));

  const openEpisode = useCallback(
    (memberId: number, episode: number) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
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
        <h1 className="text-2xl font-bold text-white">Couldn&apos;t load this franchise</h1>
        <p className="max-w-sm text-sm text-gray-500">AniList didn&apos;t answer, or the id doesn&apos;t exist.</p>
        <Link
          to="/schedule"
          className="flex h-11 items-center rounded-lg bg-accent-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-500"
        >
          Back to Schedule
        </Link>
      </div>
    );
  }

  const epMember = epTarget !== null ? graph.data.entries.find((e) => e.id === epTarget.memberId) : undefined;

  return (
    <>
      <SeriesView graph={graph.data} media={media} logs={logs} library={library} onOpenEpisode={openEpisode} />
      {epTarget !== null && epMember !== undefined && (
        <EpisodeView
          key={`${epTarget.memberId}-${epTarget.episode}`}
          seriesTitle={graph.data.title}
          member={epMember}
          media={media.find((m) => m.id === epTarget.memberId)}
          episode={epTarget.episode}
          onClose={closeEpisode}
        />
      )}
    </>
  );
}
