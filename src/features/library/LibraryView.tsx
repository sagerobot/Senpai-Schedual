import React, { useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { AnimeMedia, LibraryEntry, EpisodeLog, LibraryStatus } from '../../types';
import { useMediaByIds } from '../../queries/hooks';
import { importMalFile } from '../../lib/malImport';
import { displayTitle } from '../../lib/displayTitle';
import { Loader2, Upload, BookmarkIcon, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ErrorState } from '../../components/ErrorState';
import { LIBRARY_STATUS_LABELS, LIBRARY_STATUS_ORDER } from '../../lib/status';
import { useSeriesGraphs } from '../../series/useSeriesGraphs';
import { SeriesCard } from './SeriesCard';
import { SeriesGraph } from '../../series/labeling';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';

interface LibraryViewProps {
  library: LibraryEntry[];
  logs: EpisodeLog[];
  animeList: AnimeMedia[];
  onAnimeSelect: (show: { id: number }) => void;
  setLibraryBulk: (entries: LibraryEntry[]) => void;
  setLogsBulk: (logs: EpisodeLog[]) => void;
  scheduleError: string | null;
  retrySchedule: () => void;
}

type TabId = 'all' | LibraryStatus;

interface GroupedSeries {
  series: SeriesGraph;
  derivedStatus: LibraryStatus;
  entries: LibraryEntry[];
  avgScore: number | null;
  lastUpdated: number;
}

export function LibraryView({ library, logs, animeList, onAnimeSelect, setLibraryBulk, setLogsBulk, scheduleError, retrySchedule }: LibraryViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('all');
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number, total: number } | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number, failed: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Anything the schedule already carries is free; the rest is resolved by id.
  // Ids AniList cannot resolve settle as `null` and stay settled.
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
    e.target.value = ''; // allow re-selecting the same file after a failure
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    setImportError(null);
    setImportProgress(null);

    try {
      const result = await importMalFile(file, (current, total) => {
        setImportProgress({ current, total });
      });

      setLibraryBulk(result.entries);
      setLogsBulk(result.logs);
      setImportResult({ imported: result.entries.length, failed: result.failed });
      toast.success(`Imported ${result.entries.length} shows from MAL`);
    } catch (err) {
      console.error(err);
      setImportError('Could not read that file. Export your list from MyAnimeList as XML (or .xml.gz) and try again.');
      toast.error('MAL import failed');
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  // Group the whole library into franchises once; tab counts and the visible
  // list both derive from this.
  const groupedSeries = useMemo(() => {
    const libraryMap = new Map(library.map(l => [l.showId, l]));
    const grouped: GroupedSeries[] = [];
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

        grouped.push({
          series: graph,
          derivedStatus,
          entries: seriesEntries,
          avgScore: scoreCount > 0 ? scoreSum / scoreCount : null,
          lastUpdated: latestUpdated
        });
      }
    });

    return grouped;
  }, [library, graphByShow, allAnimeDict]);

  const tabCounts = useMemo(() => {
    const counts: Record<TabId, number> = {
      all: groupedSeries.length,
      watching: 0,
      plan_to_watch: 0,
      stacking: 0,
      completed: 0,
      on_hold: 0,
      dropped: 0,
    };
    groupedSeries.forEach(g => { counts[g.derivedStatus]++; });
    return counts;
  }, [groupedSeries]);

  const displaySeries = useMemo(() => {
    let result = groupedSeries;
    if (activeTab !== 'all') result = result.filter(g => g.derivedStatus === activeTab);
    if (search) result = result.filter(g => g.series.title.toLowerCase().includes(search.toLowerCase()));

    return [...result].sort((a, b) => {
      if (sortOption === 'my-score') {
        return (b.avgScore || 0) - (a.avgScore || 0);
      } else if (sortOption === 'recently-updated') {
        return b.lastUpdated - a.lastUpdated;
      } else {
        return a.series.title.localeCompare(b.series.title);
      }
    });
  }, [groupedSeries, activeTab, sortOption, search]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'all', label: 'All' },
    ...LIBRARY_STATUS_ORDER.map((id) => ({ id, label: LIBRARY_STATUS_LABELS[id] })),
  ];

  // The modal host resolves `?show=<id>` itself, so opening a row never needs
  // the record in hand first.
  const handleAnimeSelect = (id: number) => onAnimeSelect({ id });

  const hasSearchMiss = displaySeries.length === 0 && search !== '' &&
    groupedSeries.some(g => activeTab === 'all' || g.derivedStatus === activeTab);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Library</h1>
          <p className="text-fg-muted">Everything you've watched, planned, and shelved — grouped by series</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,.gz"
            className="hidden"
            onChange={handleFileUpload}
            disabled={importing}
          />
          <Button
            variant="secondary"
            size="lg"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
            Import MAL (XML)
          </Button>
        </div>
      </div>

      {importResult && (
        <div className="rounded-field bg-success-500/10 border border-success-500/30 p-4 text-success-300">
          <p className="font-medium text-sm">Import completed: {importResult.imported} shows imported successfully.</p>
          {importResult.failed > 0 && <p className="text-xs opacity-80 mt-1">{importResult.failed} shows could not be matched to AniList.</p>}
        </div>
      )}

      {importError && (
        <div className="flex items-start gap-3 rounded-field bg-danger-500/10 border border-danger-500/30 p-4 text-danger-300">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">{importError}</p>
        </div>
      )}

      {importProgress && importProgress.total > 0 && (
        <div className="rounded-field bg-surface-3 border border-edge p-4">
          <div className="flex justify-between text-xs text-fg-muted mb-2">
            <span>Matching MAL entries to AniList ({importProgress.current} / {importProgress.total})...</span>
            <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
          </div>
          <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (importProgress.current / importProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-1 p-2 rounded-inner border border-edge">
        <div className="flex space-x-1 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-field px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeTab === t.id ? "bg-surface-3 text-fg shadow-e1" : "text-fg-muted hover:text-fg-secondary hover:bg-surface-3/50"
              )}
            >
              {t.label}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-micro font-semibold",
                activeTab === t.id ? "bg-accent-500/20 text-accent-300" : "bg-surface-0/50 text-fg-faint"
              )}>
                {tabCounts[t.id]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {resolving && <Loader2 className="h-4 w-4 animate-spin text-fg-faint" />}
          <input
            type="text"
            placeholder="Search series..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-field border border-edge-strong bg-surface-3 px-3 py-2 text-sm text-fg placeholder-fg-faint focus:border-accent-500 focus:outline-none w-full md:w-48"
          />
          <Select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as 'my-score' | 'title' | 'recently-updated')}
            aria-label="Sort library"
            className="shrink-0"
          >
            <option value="recently-updated">Recently Updated</option>
            <option value="title">A-Z</option>
            <option value="my-score">My Score</option>
          </Select>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-fg-faint">
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
            />
          ))}
        </div>
      ) : hasSearchMiss ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-inner border border-dashed border-edge bg-surface-1">
          <p className="text-fg-muted">No series match "{search}" here.</p>
        </div>
      ) : scheduleError && library.length > 0 && groupedSeries.length === 0 ? (
        // The library has entries but none could be resolved and the schedule
        // fetch failed — never dress that failure up as an empty library.
        <ErrorState title="Failed to load your library." detail={scheduleError} onRetry={retrySchedule} />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-edge bg-surface-1 py-24 text-center px-6">
          <BookmarkIcon className="mb-4 h-12 w-12 text-edge-strong" />
          <h3 className="text-xl font-bold text-fg">Nothing here yet</h3>
          <p className="mt-2 max-w-md text-fg-faint">
            Bookmark a show anywhere in the app and it lands in your library.
            Already tracking on MyAnimeList? Bring your whole history over.
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="mt-6"
          >
            <Upload className="h-4 w-4" />
            Import from MAL
          </Button>
        </div>
      )}
    </div>
  );
}
