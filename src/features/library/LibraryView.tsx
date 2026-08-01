import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { AnimeMedia, LibraryEntry, EpisodeLog, LibraryStatus } from '../../types';
import { fetchAnimeByMalIds } from '../../api/anilist/queries';
import { useMediaByIds } from '../../queries/hooks';
import { parseMalXml } from '../../lib/malParser';
import { displayTitle } from '../../lib/displayTitle';
import { Loader2, Upload, FileText, Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSeriesGraphs } from '../../series/useSeriesGraphs';
import { SeriesCard } from './SeriesCard';
import { SeriesGraph } from '../../series/labeling';

interface LibraryViewProps {
  library: LibraryEntry[];
  logs: EpisodeLog[];
  animeList: AnimeMedia[];
  onAnimeSelect: (show: { id: number }) => void;
  setLibraryBulk: (entries: LibraryEntry[]) => void;
  setLogsBulk: (logs: EpisodeLog[]) => void;
}

type TabType = LibraryStatus;

export function LibraryView({ library, logs, animeList, onAnimeSelect, setLibraryBulk, setLogsBulk }: LibraryViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('watching');
  const [sortOption, setSortOption] = useState<'my-score' | 'title' | 'recently-updated'>('recently-updated');
  // `?q=` seeds the box once so /library?q=... is linkable; typing after that is
  // local state and doesn't rewrite the URL.
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');

  // Shared with the recommendation pipeline through the query cache, so the two
  // no longer resolve the same library independently.
  const libraryIds = useMemo(() => library.map((l) => l.showId), [library]);
  const { graphs: seriesGraphs, resolving } = useSeriesGraphs(libraryIds);

  const graphByShow = useMemo(() => {
    const map = new Map<number, SeriesGraph>();
    for (const graph of Object.values(seriesGraphs)) {
      for (const entry of graph.entries) map.set(entry.id, graph);
    }
    return map;
  }, [seriesGraphs]);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number, total: number } | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number, failed: number } | null>(null);

  // Anything the schedule already carries is free; the rest is resolved by id.
  // Ids AniList cannot resolve settle as `null` and stay settled, which is what
  // the old effect-plus-localStorage arrangement could never do.
  const scheduleIds = useMemo(() => new Set(animeList.map((a) => a.id)), [animeList]);
  const missingIds = useMemo(
    () => library.map((l) => l.showId).filter((id) => !scheduleIds.has(id)),
    [library, scheduleIds],
  );
  const { media: resolvedMedia, pendingCount } = useMediaByIds(missingIds);

  const allAnimeDict = useMemo(() => {
    const dict: Record<number, AnimeMedia> = {};
    animeList.forEach(a => { dict[a.id] = a; });
    resolvedMedia.forEach(a => { dict[a.id] = a; });
    return dict;
  }, [resolvedMedia, animeList]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    setImportResult(null);
    setImportProgress(null);
    
    try {
      let text = '';
      if (file.name.endsWith('.gz')) {
        const ds = new DecompressionStream('gzip');
        const decompressedStream = file.stream().pipeThrough(ds);
        text = await new Response(decompressedStream).text();
      } else {
        text = await file.text();
      }

      const malEntries = parseMalXml(text);
      setImportProgress({ current: 0, total: malEntries.length });

      // Match MAL IDs to AniList IDs
      const malIds = malEntries.map(e => e.series_animedb_id);
      const matchedAnime = await fetchAnimeByMalIds(malIds, (current, total) => {
        setImportProgress({ current, total });
      });
      const malToAnilist: Record<number, number> = {};
      matchedAnime.forEach(a => {
        if (a.idMal) malToAnilist[a.idMal] = a.id;
      });

      const newLibraryEntries: LibraryEntry[] = [];
      const newLogs: EpisodeLog[] = [];
      let failed = 0;

      malEntries.forEach(entry => {
        const aniId = malToAnilist[entry.series_animedb_id];
        if (!aniId) {
          failed++;
          return;
        }

        let status: LibraryStatus = 'plan_to_watch';
        if (entry.my_status === 1) status = 'watching';
        else if (entry.my_status === 2) status = 'completed';
        else if (entry.my_status === 3) status = 'on_hold';
        else if (entry.my_status === 4) status = 'dropped';
        else if (entry.my_status === 6) status = 'plan_to_watch';

        newLibraryEntries.push({
          showId: aniId,
          idMal: entry.series_animedb_id,
          status,
          showScore: entry.my_score > 0 ? entry.my_score : null,
          source: 'mal_import',
          updatedAt: Date.now()
        });

        if (entry.my_watched_episodes > 0) {
          for (let i = 1; i <= entry.my_watched_episodes; i++) {
            newLogs.push({
              showId: aniId,
              episodeNumber: i,
              watchedAt: Date.now(),
              score: null
            });
          }
        }
      });

      setLibraryBulk(newLibraryEntries);
      setLogsBulk(newLogs);
      setImportResult({ imported: newLibraryEntries.length, failed });

    } catch (err) {
      console.error(err);
      alert('Failed to parse or import file.');
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const exportFullLibrary = () => {
    const data = { library, logs };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `senpai_full_library_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displaySeries = useMemo(() => {
    const libraryMap = new Map(library.map(l => [l.showId, l]));
    const groupedSeries: { series: SeriesGraph; derivedStatus: LibraryStatus; entries: LibraryEntry[]; avgScore: number | null; lastUpdated: number }[] = [];
    const processedIds = new Set<number>();

    library.forEach(entry => {
      if (processedIds.has(entry.showId)) return;

      let graph: SeriesGraph | null = graphByShow.get(entry.showId) ?? null;

      if (!graph) {
        // Fallback to standalone series if not yet resolved
        const anime = allAnimeDict[entry.showId];
        if (anime) {
          graph = {
            seriesId: entry.showId,
            title: displayTitle(anime),
            entries: [{
              id: entry.showId,
              title: displayTitle(anime),
              seasonLabel: 'Season 1',
              format: anime.status ?? '',
              isAttachment: false,
              startDate: anime.startDate,
              episodes: anime.episodes ?? undefined
            }]
          };
        }
      }

      if (graph) {
        graph.entries.forEach(e => processedIds.add(e.id));
        
        let isWatching = false;
        let isCompleted = true;
        let latestUpdated = 0;
        let derivedStatus: LibraryStatus = 'plan_to_watch';
        let scoreSum = 0;
        let scoreCount = 0;

        const seriesEntries: LibraryEntry[] = [];

        const displaySeasons = graph.entries.filter(e => !e.isAttachment || libraryMap.has(e.id));
        displaySeasons.forEach(season => {
          const l = libraryMap.get(season.id);
          if (l) {
            seriesEntries.push(l);
            if (l.showScore) {
              scoreSum += l.showScore;
              scoreCount++;
            }
            if (l.status === 'watching') isWatching = true;
            if (l.status !== 'completed') isCompleted = false;
            if (l.updatedAt && l.updatedAt > latestUpdated) {
              latestUpdated = l.updatedAt;
              if (!isWatching) derivedStatus = l.status;
            }
          } else {
            isCompleted = false;
          }
        });

        if (isWatching) derivedStatus = 'watching';
        else if (isCompleted && displaySeasons.length > 0) derivedStatus = 'completed';

        if (derivedStatus === activeTab) {
          // Check search
          if (!search || graph.title.toLowerCase().includes(search.toLowerCase())) {
            groupedSeries.push({
              series: graph,
              derivedStatus,
              entries: seriesEntries,
              avgScore: scoreCount > 0 ? scoreSum / scoreCount : null,
              lastUpdated: latestUpdated
            });
          }
        }
      }
    });

    return groupedSeries.sort((a, b) => {
      if (sortOption === 'my-score') {
        return (b.avgScore || 0) - (a.avgScore || 0);
      } else if (sortOption === 'recently-updated') {
        return b.lastUpdated - a.lastUpdated;
      } else {
        return a.series.title.localeCompare(b.series.title);
      }
    });
  }, [library, graphByShow, activeTab, sortOption, search, allAnimeDict]);

  const tabs: { id: LibraryStatus; label: string }[] = [
    { id: 'watching', label: 'Watching' },
    { id: 'completed', label: 'Completed' },
    { id: 'on_hold', label: 'Shelved' },
    { id: 'dropped', label: 'Dropped' },
    { id: 'plan_to_watch', label: 'Plan to Watch' },
  ];

  // The modal host resolves `?show=<id>` itself, so opening a row never needs
  // the record in hand first.
  const handleAnimeSelect = (id: number) => onAnimeSelect({ id });

  const handleAddPlanToWatch = (id: number) => {
    const newEntry: LibraryEntry = {
      showId: id,
      idMal: null,
      status: 'plan_to_watch',
      showScore: null,
      source: 'manual',
      updatedAt: Date.now()
    };
    setLibraryBulk([...library.filter(l => l.showId !== id), newEntry]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">All-Time Library</h2>
          <p className="text-gray-400">Manage your entire watch history grouped by series</p>
        </div>
        
        <div className="flex items-center gap-2">
          <label className={cn(
            "flex items-center gap-2 rounded-lg bg-[#2a2a2d] border border-gray-800 px-4 py-2 text-sm font-medium transition-colors cursor-pointer",
            importing ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-800 hover:text-white text-gray-300"
          )}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import MAL (XML)
            <input type="file" accept=".xml,.gz" className="hidden" onChange={handleFileUpload} disabled={importing} />
          </label>
          <button 
            onClick={exportFullLibrary}
            className="flex items-center gap-2 rounded-lg bg-[#2a2a2d] border border-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <Download className="h-4 w-4" />
            Export Data
          </button>
        </div>
      </div>

      {importResult && (
        <div className="rounded-lg bg-emerald-900/20 border border-emerald-500/30 p-4 text-emerald-300">
          <p className="font-medium text-sm">Import completed: {importResult.imported} shows imported successfully.</p>
          {importResult.failed > 0 && <p className="text-xs opacity-80 mt-1">{importResult.failed} shows could not be matched to AniList.</p>}
        </div>
      )}

      {importProgress && (
        <div className="rounded-lg bg-[#2a2a2d] border border-gray-800 p-4">
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>Matching MAL entries to AniList ({importProgress.current} / {importProgress.total})...</span>
            <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
          </div>
          <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-accent-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (importProgress.current / importProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#1c1c1f] p-2 rounded-xl border border-gray-800">
        <div className="flex space-x-1 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                activeTab === t.id ? "bg-[#2a2a2d] text-white shadow-sm" : "text-gray-400 hover:text-gray-200 hover:bg-[#2a2a2d]/50"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {resolving && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
          <input
            type="text"
            placeholder="Search series..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-gray-700 bg-[#2a2a2d] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none w-full md:w-48"
          />
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as any)}
            className="rounded-lg border border-gray-700 bg-[#2a2a2d] px-3 py-2 text-sm font-medium text-gray-300 focus:border-accent-500 focus:outline-none"
          >
            <option value="recently-updated">Recently Updated</option>
            <option value="title">A-Z</option>
            <option value="my-score">My Score</option>
          </select>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Loading {pendingCount} more {pendingCount === 1 ? 'show' : 'shows'}…</span>
        </div>
      )}

      {displaySeries.length > 0 ? (
        <div className="flex flex-col gap-3">
          {displaySeries.map(item => (
            <SeriesCard
              key={item.series.seriesId}
              series={item.series}
              libraryEntries={item.entries}
              logs={logs}
              onAnimeSelect={handleAnimeSelect}
              onAddPlanToWatch={handleAddPlanToWatch}
            />
          ))}
        </div>
      ) : (
        <div className="flex h-64 flex-col items-center justify-center space-y-4 rounded-xl border border-dashed border-gray-800 bg-[#1c1c1f]">
          <FileText className="h-10 w-10 text-gray-600" />
          <p className="text-gray-400">No series found in this category.</p>
        </div>
      )}
    </div>
  );
}
