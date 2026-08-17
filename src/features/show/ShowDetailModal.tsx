import * as Dialog from '@radix-ui/react-dialog';
import { X, ExternalLink, Bookmark, Layers, MessageCircle, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AnimeMedia, LibraryEntry, LibraryStatus } from '../../types';
import { useShowDetailsQuery } from '../../queries/hooks';
import { useVibesIndex } from '../../queries/vibes';
import { latestAiredEpisode } from '../../lib/aired';
import { displayTitle } from '../../lib/displayTitle';
import { isJustAired } from '../../lib/vibesFile';
import { asOfLabel, useCommunityPulse } from './useCommunityPulse';
import { EpisodeTracker } from './EpisodeTracker';
import { VibeFlagButton } from './VibeFlagButton';
import { ShowAdvancedPanel } from './ShowAdvancedPanel';
import { cn } from '../../lib/utils';
import { LIBRARY_STATUS_LABELS, LIBRARY_STATUS_ORDER } from '../../lib/status';
import { useUserData } from '../../stores/userData';
import { LibraryStatusMenu } from '../../components/LibraryStatusMenu';
import { filterWatchLinks } from '../../lib/watchLinks';
import { Link } from 'react-router';
import { useSeriesGraph } from '../../series/useSeriesGraphs';

interface ShowDetailModalProps {
  anime: AnimeMedia;
  onClose: () => void;
  onAnimeSelect?: (show: { id: number }) => void;
  libraryEntry?: LibraryEntry;
  onUpdateEntry?: (showId: number, update: Partial<LibraryEntry>) => void;
}

type TabType = 'mal' | 'anilist' | 'kitsu';

export function ShowDetailModal({ anime, onClose, onAnimeSelect, libraryEntry, onUpdateEntry }: ShowDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('mal');

  // The vibe check's episode picker — deliberately its own state, fully
  // decoupled from the episode tracker. Defaults to the latest aired episode.
  // Stale-proof latest aired episode (a passed airingAt counts as aired).
  const latestEpisode = Math.max(1, latestAiredEpisode(anime, Math.floor(Date.now() / 1000))?.episode ?? anime.episodes ?? 1);
  const [selectedEpisode, setSelectedEpisode] = useState(latestEpisode);
  const vibes = useVibesIndex();
  const {
    pulse,
    state: pulseState,
    load: loadPulse,
    remembered,
    quiet,
  } = useCommunityPulse(displayTitle(anime), selectedEpisode, anime.id, vibes.get(anime.id, selectedEpisode));

  // r/anime episode discussion threads barely exist before about 2013, so for
  // an older show the button is a paid search with a known answer. Anything the
  // refresh routine has already remembered still displays — this only removes
  // the offer to go looking.
  const startYear = anime.startDate?.year ?? null;
  const preDiscussionEra = startYear !== null && startYear < 2013;
  const asOfLine = remembered !== null ? asOfLabel(remembered) : null;

  // The remembered reading carries the real thread URL — a quiet entry too;
  // the r/anime search is only the fallback for episodes nothing has read yet.
  const discussionIsThread = pulseState === 'ok' && pulse !== null && pulse.url.includes('/comments/');
  const discussionUrl = discussionIsThread
    ? pulse.url
    : quiet !== null
      ? quiet.url
      : `https://www.reddit.com/r/anime/search/?q=${encodeURIComponent(displayTitle(anime))}+episode+${selectedEpisode}+discussion&restrict_sr=1`;

  const setShowScore = useUserData((s) => s.setShowScore);
  const customSite = useUserData((s) => s.uiPrefs.customSource?.name);
  const watchEntry = filterWatchLinks(anime.externalLinks, customSite)[0];
  // Same 7-day-cached query the advanced panel resolves; a solo show gets no link.
  const seriesGraph = useSeriesGraph(anime.id);
  const hasFranchise = (seriesGraph.data?.entries.length ?? 0) > 1;

  const handleRate = (score: number) => {
    if (!libraryEntry) return;
    const previous = libraryEntry.showScore;
    const next = previous === score ? null : score; // tapping the current score clears it
    setShowScore(anime.id, next);
    toast(next === null ? 'Rating cleared' : `Rated ${next}/10`, {
      action: { label: 'Undo', onClick: () => useUserData.getState().setShowScore(anime.id, previous) },
    });
  };

  const handleRemoveFromLibrary = () => {
    const snapshot = useUserData.getState().removeFromLibrary(anime.id);
    if (snapshot === null) return;
    toast('Removed from Library', {
      action: { label: 'Undo', onClick: () => useUserData.getState().restoreSnapshot(snapshot) },
    });
  };

  // List queries no longer carry `description` (localStorage quota); the query
  // fetches the full record by id alongside the MAL/Kitsu/AI details, and the
  // passed-in `anime` covers the immediate render.
  const detailsQuery = useShowDetailsQuery(anime);
  const details = detailsQuery.data?.details ?? null;
  const fullMedia = detailsQuery.data?.full ?? null;
  const loading = detailsQuery.isPending;

  const anilistDescription = fullMedia?.description ?? anime.description ?? null;

  // Land on a tab that actually has copy, once we know which do.
  useEffect(() => {
    if (!details) return;
    if (details.mal?.synopsis) return;
    if (anilistDescription) setActiveTab('anilist');
    else if (details.kitsu?.synopsis) setActiveTab('kitsu');
  }, [details, anilistDescription]);

  const kitsuScore = details?.kitsu?.averageRating ? parseFloat(details.kitsu.averageRating) : null;
  const anilistScore = anime.averageScore;
  const malScore = details?.mal?.score;
  
  // Calculate normalized average
  let totalNorm = 0;
  let countNorm = 0;
  if (malScore) { totalNorm += malScore; countNorm++; }
  if (anilistScore) { totalNorm += anilistScore / 10; countNorm++; }
  if (kitsuScore) { totalNorm += kitsuScore / 10; countNorm++; }
  const normalizedAverage = countNorm > 0 ? (totalNorm / countNorm).toFixed(2) : null;

  const sourceRelation = anime.relations?.edges?.find(e => 
    (e.relationType === 'SOURCE' || e.relationType === 'ADAPTATION') && 
    (e.node?.type === 'MANGA' || e.node?.type === 'NOVEL')
  );
  const sourceNode = sourceRelation?.node;
  const isOriginal = !sourceRelation;
  const sourceScore = sourceNode?.averageScore ? (sourceNode.averageScore / 10).toFixed(1) : null;
  const sourceRatedHigher = sourceScore && normalizedAverage && parseFloat(sourceScore) >= parseFloat(normalizedAverage) + 0.7;

  const rawTabs = [
    { id: 'mal' as TabType, label: 'MyAnimeList', content: details?.mal?.synopsis },
    { id: 'anilist' as TabType, label: 'AniList', content: anilistDescription },
    { id: 'kitsu' as TabType, label: 'Kitsu', content: details?.kitsu?.synopsis }
  ];

  const tabs: { id: TabType; label: string; content: string }[] = rawTabs
    .filter((t): t is { id: TabType; label: string; content: string } => typeof t.content === 'string' && t.content.trim().length > 0);

  const activeContent = tabs.find(t => t.id === activeTab)?.content || 'No synopsis available.';

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] p-4 md:p-6 shadow-e3 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <div className="relative flex max-h-[85vh] flex-col overflow-hidden rounded-card bg-surface-1 text-fg-secondary shadow-e3 border border-edge">
            
            {/* Header */}
            <div className="flex gap-4 p-5 md:p-6 pb-2">
              <div className="shrink-0">
                <img 
                  src={anime.coverImage.large}
                  alt={displayTitle(anime)}
                  className="h-32 w-24 rounded-field object-cover shadow-e1 bg-surface-1"
                />
              </div>
              <div className="flex flex-col justify-center py-1">
                <Dialog.Title className="text-xl md:text-2xl font-bold tracking-tight text-fg mb-3">
                  {displayTitle(anime)}
                </Dialog.Title>
                
                <div className="flex flex-wrap gap-2 text-xs font-medium">
                  {anime.nextAiringEpisode && (
                    <div className="rounded-full bg-accent-500/20 border border-accent-500/30 px-3 py-1.5 text-accent-300">
                      Ep {anime.nextAiringEpisode.episode} · {new Intl.DateTimeFormat('en-US', {
                        weekday: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      }).format(new Date(anime.nextAiringEpisode.airingAt * 1000))}
                    </div>
                  )}
                  {watchEntry && (
                    <div className="rounded-full bg-surface-3 px-3 py-1.5 text-fg-secondary">
                      {watchEntry.site}
                    </div>
                  )}
                  {anime.genres && anime.genres.length > 0 && (
                    <div className="rounded-full bg-surface-3 px-3 py-1.5 text-fg-secondary">
                      {anime.genres.slice(0, 2).join(' · ')}
                    </div>
                  )}
                </div>
              </div>
              <Dialog.Close className="absolute right-4 top-4 rounded-field border border-edge-strong bg-transparent p-1.5 text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Dialog.Close>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 md:p-6 pt-2 space-y-6 custom-scrollbar">
              
              {/* Ratings Row */}
              <div className="flex gap-2 md:gap-3 text-sm text-center">
                {loading ? (
                  <>
                    <div className="flex-1 h-[70px] animate-pulse rounded-inner bg-surface-2"></div>
                    <div className="flex-1 h-[70px] animate-pulse rounded-inner bg-surface-2"></div>
                    <div className="flex-1 h-[70px] animate-pulse rounded-inner bg-surface-2"></div>
                    <div className="flex-1 h-[70px] animate-pulse rounded-inner bg-surface-2"></div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-1 flex-col justify-center rounded-inner bg-surface-2 py-3">
                      <span className="text-caption font-semibold uppercase text-fg-muted">MAL</span>
                      <span className="text-2xl font-bold text-fg">{malScore || '-'}</span>
                    </div>
                    <div className="flex flex-1 flex-col justify-center rounded-inner bg-surface-2 py-3">
                      <span className="text-caption font-semibold uppercase text-fg-muted">AniList</span>
                      <span className="text-2xl font-bold text-fg">{anilistScore ? `${anilistScore}%` : '-'}</span>
                    </div>
                    <div className="flex flex-1 flex-col justify-center rounded-inner bg-surface-2 py-3">
                      <span className="text-caption font-semibold uppercase text-fg-muted">Kitsu</span>
                      <span className="text-2xl font-bold text-fg">{kitsuScore ? `${kitsuScore}%` : '-'}</span>
                    </div>
                    <div className="flex flex-1 flex-col justify-center rounded-inner bg-accent-600/20 border border-accent-500/30 py-3">
                      <span className="text-micro font-semibold uppercase text-accent-400">Average</span>
                      <span className="text-2xl font-bold text-fg">{normalizedAverage || '-'}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Source Material Card */}
              {!loading && (
                <div className="flex items-center justify-between rounded-inner bg-surface-2 p-4">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-fg-muted">Source Material</span>
                    {isOriginal ? (
                      <span className="text-sm font-semibold text-fg">Anime original</span>
                    ) : (
                      <a 
                        href={`https://anilist.co/${sourceNode?.type?.toLowerCase()}/${sourceNode?.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-accent-400 hover:underline"
                      >
                        {sourceNode?.type === 'MANGA' ? 'Manga' : sourceNode?.type === 'NOVEL' ? 'Light Novel' : 'Source'}
                        {sourceScore && `: ${sourceScore}`}
                      </a>
                    )}
                  </div>
                  {sourceRatedHigher && (
                    <div className="rounded-full bg-warning-500/20 px-2.5 py-1 text-micro font-bold text-warning-400 border border-warning-500/30">
                      Source rated higher
                    </div>
                  )}
                  {anime.trending && anime.trending > 0 && (
                    <div className="rounded-full bg-sent-mixed/20 px-2.5 py-1 text-micro font-bold text-sent-mixed-fg border border-sent-mixed/30 ml-2">
                      #{anime.trending} Trending
                    </div>
                  )}
                </div>
              )}


              {/* Related Anime */}
              {!loading && anime.relations?.edges && anime.relations.edges.filter(e => e.node?.type === 'ANIME').length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-fg-secondary">Related Anime</h3>
                  <div className="flex flex-wrap gap-2">
                    {anime.relations.edges.filter(e => e.node?.type === 'ANIME').map(e => (
                      <button
                        key={e.node.id}
                        // Opening by id is enough — the modal host resolves the record.
                        onClick={() => onAnimeSelect?.({ id: e.node.id })}
                        className="flex items-center gap-2 rounded-field bg-surface-2 px-3 py-2 text-left transition-colors hover:bg-accent-500/20 hover:border-accent-500/50 border border-transparent"
                      >
                        <div className="flex flex-col">
                          <span className="text-micro font-semibold uppercase text-accent-400">{e.relationType.replace('_', ' ')}</span>
                          <span className="text-xs font-medium text-fg line-clamp-1">{e.node.title.userPreferred}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Synopsis Section */}
              {loading ? (
                <div className="space-y-4 animate-pulse">
                  <div className="flex justify-between border-b border-edge pb-2">
                    <div className="h-4 w-20 rounded bg-surface-2"></div>
                    <div className="flex space-x-2">
                      <div className="h-6 w-12 rounded-full bg-surface-2"></div>
                      <div className="h-6 w-16 rounded-full bg-surface-2"></div>
                    </div>
                  </div>
                  <div className="space-y-2 rounded-inner bg-surface-2 p-4">
                    <div className="h-4 w-full rounded bg-surface-3"></div>
                    <div className="h-4 w-[90%] rounded bg-surface-3"></div>
                    <div className="h-4 w-[95%] rounded bg-surface-3"></div>
                  </div>
                </div>
              ) : tabs.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-fg-secondary">Synopsis</h3>
                    <div className="flex space-x-2">
                      {tabs.map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={cn(
                            "rounded-full px-3 py-1 text-caption font-medium transition-colors",
                            activeTab === tab.id
                              ? "bg-accent-600/20 border border-accent-500/40 text-accent-300"
                              : "border border-edge-strong text-fg-muted hover:text-fg-secondary"
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-inner bg-surface-2 p-4 text-sm leading-relaxed text-fg-secondary prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: activeContent }} />
                </div>
              )}

              {/* AI Summary */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-8 rounded-inner border border-edge bg-surface-2/50">
                  <Loader2 className="h-6 w-6 animate-spin text-accent-400" />
                  <p className="mt-2 text-sm text-fg-muted">Analyzing synopses...</p>
                </div>
              ) : details?.aiSummary ? (
                <div className="relative rounded-inner border border-accent-500/30 bg-surface-2 p-4">
                  <div className="mb-2 flex items-center space-x-2">
                    <Sparkles className="h-4 w-4 text-accent-400" />
                    <span className="text-xs font-semibold text-accent-400">AI summary</span>
                    <span className="rounded-full bg-success-500/15 px-2 py-0.5 text-micro font-semibold text-success-300">Spoiler-free</span>
                  </div>
                  <p className="text-sm leading-relaxed text-fg-secondary">
                    {details.aiSummary}
                  </p>
                </div>
              ) : null}

              {/* Episode tracking */}
              <EpisodeTracker anime={anime} />

              {/* Community Pulse Section */}
              <div className="mt-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-fg-secondary">Community vibe</h3>
                {(pulseState !== 'idle' || preDiscussionEra) && (
                  <select
                    value={selectedEpisode}
                    onChange={(e) => setSelectedEpisode(Number(e.target.value))}
                    aria-label="Episode for community vibe"
                    className="rounded-field border border-edge-strong bg-surface-2 px-2 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:border-fg-faint focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-ring/40"
                  >
                    {Array.from({ length: latestEpisode }, (_, i) => i + 1).map((ep) => (
                      <option key={ep} value={ep}>Episode {ep}</option>
                    ))}
                  </select>
                )}
              </div>
              {pulseState === 'idle' && preDiscussionEra ? (
                <p className="rounded-inner border border-edge bg-surface-2/50 p-5 text-center text-sm text-fg-muted">
                  r/anime episode discussions only go back to about 2013 — there is nothing to read for a show this old.
                </p>
              ) : pulseState === 'quiet' && quiet !== null ? (
                isJustAired(quiet) ? (
                  <p className="rounded-inner border border-sent-new/40 bg-sent-new/10 p-5 text-center text-sm text-sent-new-fg">
                    Just released — the{' '}
                    <a href={quiet.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      discussion thread
                    </a>{' '}
                    is still filling up. Check back soon.
                  </p>
                ) : (
                  <p className="rounded-inner border border-sent-quiet/40 bg-surface-2/50 p-5 text-center text-sm text-sent-quiet-fg">
                    The{' '}
                    <a href={quiet.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 text-fg-secondary">
                      discussion thread
                    </a>{' '}
                    for episode {selectedEpisode} is quiet — only {quiet.comments} comment
                    {quiet.comments === 1 ? '' : 's'}, not enough for a sentiment read.
                  </p>
                )
              ) : pulseState === 'not_found' ? (
                <p className="rounded-inner border border-edge bg-surface-2/50 p-5 text-center text-sm text-fg-muted">
                  No discussion thread found for episode {selectedEpisode}.
                </p>
              ) : pulseState === 'idle' ? (
                <div className="flex flex-col items-center space-y-2 rounded-inner border border-edge bg-surface-2/50 p-5">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <select
                      value={selectedEpisode}
                      onChange={(e) => setSelectedEpisode(Number(e.target.value))}
                      aria-label="Episode for community vibe"
                      className="h-11 rounded-field border border-edge-strong bg-surface-2 px-2 text-xs font-medium text-fg-secondary transition-colors hover:border-fg-faint focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-ring/40"
                    >
                      {Array.from({ length: latestEpisode }, (_, i) => i + 1).map((ep) => (
                        <option key={ep} value={ep}>Episode {ep}</option>
                      ))}
                    </select>
                    <button
                      onClick={loadPulse}
                      className="flex items-center space-x-2 rounded-field bg-accent-600 px-4 py-2.5 text-sm font-medium text-fg-inverse transition-colors hover:bg-accent-500"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>Check community vibe</span>
                    </button>
                  </div>
                  <p className="text-caption text-fg-muted">Searches r/anime discussion for episode {selectedEpisode}</p>
                </div>
              ) : pulseState === 'loading' ? (
                <div className="relative rounded-inner border border-edge bg-surface-2/50 p-4 animate-pulse">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="h-4 w-4 rounded-full bg-surface-3"></div>
                      <div className="h-4 w-32 rounded bg-surface-3"></div>
                    </div>
                    <div className="flex space-x-3">
                      <div className="h-3 w-10 rounded bg-surface-3"></div>
                      <div className="h-3 w-10 rounded bg-surface-3"></div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="h-3 w-full rounded bg-surface-3"></div>
                    <div className="h-3 w-4/5 rounded bg-surface-3"></div>
                  </div>
                </div>
              ) : pulseState === 'ok' && pulse ? (
                <div className={cn("relative rounded-inner border p-4",
                  pulse.indicator === 'positive' ? "bg-sent-positive/10 border-sent-positive/40" : 
                  pulse.indicator === 'negative' ? "bg-sent-negative/10 border-sent-negative/40" : 
                  "bg-sent-mixed/10 border-sent-mixed/40"
                )}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <MessageCircle className={cn("h-4 w-4", 
                        pulse.indicator === 'positive' ? "text-sent-positive-fg" : 
                        pulse.indicator === 'negative' ? "text-sent-negative-fg" : 
                        "text-sent-mixed-fg"
                      )} />
                      <span className={cn("text-xs font-semibold", 
                        pulse.indicator === 'positive' ? "text-sent-positive-fg" : 
                        pulse.indicator === 'negative' ? "text-sent-negative-fg" : 
                        "text-sent-mixed-fg"
                      )}>Community vibe (Ep {selectedEpisode})</span>
                      {/* Sentiment in words: the card's colour is a second signal, never the only one. */}
                      <span className={cn("rounded-full border px-2 py-0.5 text-caption font-bold",
                        pulse.indicator === 'positive' ? "border-sent-positive/40 bg-sent-positive/15 text-sent-positive-fg" :
                        pulse.indicator === 'negative' ? "border-sent-negative/40 bg-sent-negative/15 text-sent-negative-fg" :
                        "border-sent-mixed/40 bg-sent-mixed/15 text-sent-mixed-fg"
                      )}>
                        {pulse.indicator === 'positive' ? 'Positive' : pulse.indicator === 'negative' ? 'Negative' : 'Mixed'}
                      </span>
                      <span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-caption font-semibold text-accent-300">Spoiler-free</span>
                    </div>
                    <div className={cn("flex items-center space-x-3 text-xs", 
                        pulse.indicator === 'positive' ? "text-sent-positive-fg/80" : 
                        pulse.indicator === 'negative' ? "text-sent-negative-fg/80" : 
                        "text-sent-mixed-fg/80"
                      )}>
                      {pulse.upvotes > 0 || pulse.comments > 0 ? (
                        <>
                          <span>↑ {pulse.upvotes}</span>
                          <span>💬 {pulse.comments}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <p className={cn("text-sm leading-relaxed text-fg-secondary", (pulse.goods?.length || pulse.bads?.length) ? "mb-3" : "")}>
                    {pulse.summary}
                  </p>

                  {/* An unsettled reading is deliberately partial — the thread was
                      still filling up. Say when it was taken rather than imply it
                      is the last word. */}
                  {asOfLine && (
                    <p className="-mt-1 mb-1 text-caption text-fg-muted">
                      Early read, {asOfLine} — refreshed hourly for the first day.
                    </p>
                  )}

                  {((pulse.goods && pulse.goods.length > 0) || (pulse.bads && pulse.bads.length > 0)) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-edge-strong/50">
                      {pulse.goods && pulse.goods.length > 0 && (
                        <div>
                          <span className="text-caption font-semibold text-sent-positive-fg uppercase tracking-wider">Highlights</span>
                          <ul className="mt-1 space-y-1">
                            {pulse.goods.map((good, i) => (
                              <li key={i} className="text-xs text-fg-secondary flex items-start">
                                <span className="text-sent-positive mr-1.5">•</span>
                                <span>{good}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {pulse.bads && pulse.bads.length > 0 && (
                        <div>
                          <span className="text-caption font-semibold text-sent-negative-fg uppercase tracking-wider">Critiques</span>
                          <ul className="mt-1 space-y-1">
                            {pulse.bads.map((bad, i) => (
                              <li key={i} className="text-xs text-fg-secondary flex items-start">
                                <span className="text-sent-negative mr-1.5">•</span>
                                <span>{bad}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <VibeFlagButton showId={anime.id} episode={selectedEpisode} />
                </div>
              ) : pulseState === 'resting' ? (
                <div className="rounded-inner border border-edge bg-surface-2/50 p-5 text-center text-sm text-fg-muted">
                  AI features are resting — try again tomorrow
                </div>
              ) : pulseState === 'no_key' ? (
                <div className="rounded-inner border border-edge bg-surface-2/50 p-5 text-center text-sm text-fg-muted">
                  AI features are off in this deployment
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-3 rounded-inner border border-danger-500/30 bg-danger-500/10 p-5 text-center">
                  <p className="text-sm text-danger-300">Could not check the community vibe.</p>
                  <button
                    onClick={loadPulse}
                    className="rounded-field border border-edge-strong px-4 py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-3 hover:text-fg"
                  >
                    Try again
                  </button>
                </div>
              )}

              {/* Advanced: simulcast delay + series split/merge */}
              <ShowAdvancedPanel anime={anime} />
            </div>

            {/* Footer Actions */}
            <div className="shrink-0 space-y-4 p-5 pt-0 md:p-6 md:pt-0">
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={discussionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center space-x-2 rounded-field border border-edge-strong bg-transparent px-4 py-2.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-3 hover:text-fg"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>{discussionIsThread ? 'Discussion thread' : 'Find the discussion'}</span>
                </a>

                {hasFranchise && (
                  <Link
                    // No onClose here: navigating away drops `?show=`, which is
                    // what closes the modal. Calling onClose too fires the
                    // modal's navigate(-1) and it races this Link's navigation.
                    to={`/series/${anime.id}`}
                    className="flex flex-1 items-center justify-center space-x-2 rounded-field border border-edge-strong bg-transparent px-4 py-2.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-3 hover:text-fg"
                  >
                    <Layers className="h-4 w-4" />
                    <span>Series page</span>
                  </Link>
                )}

                {watchEntry && (
                  <a
                    href={watchEntry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center space-x-2 rounded-field border border-edge-strong bg-transparent px-4 py-2.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-3 hover:text-fg"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>Watch on {watchEntry.site}</span>
                  </a>
                )}

                <div className="flex items-center gap-2">
                  {libraryEntry && onUpdateEntry && (
                    <>
                      <select
                        value={libraryEntry.status}
                        onChange={(e) => onUpdateEntry(anime.id, { status: e.target.value as LibraryStatus })}
                        className="rounded-field border border-edge-strong bg-surface-2 px-3 py-2.5 text-sm font-medium text-fg-secondary transition-colors hover:border-fg-faint focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-ring/40"
                      >
                        {LIBRARY_STATUS_ORDER.map((status) => (
                          <option key={status} value={status}>{LIBRARY_STATUS_LABELS[status]}</option>
                        ))}
                      </select>
                      {libraryEntry.status === 'stacking' && (
                        <select
                          value={libraryEntry.stackWakeCount ?? ''}
                          onChange={(e) =>
                            onUpdateEntry(anime.id, {
                              stackWakeCount: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                          aria-label="Binge-ready when"
                          className="rounded-field border border-edge-strong bg-surface-2 px-3 py-2.5 text-sm font-medium text-fg-secondary transition-colors hover:border-fg-faint focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-ring/40"
                        >
                          <option value="">Wake: season end</option>
                          {[4, 6, 8, 12].map((n) => (
                            <option key={n} value={n}>Wake: {n} eps</option>
                          ))}
                        </select>
                      )}
                    </>
                  )}
                  <LibraryStatusMenu
                    showId={anime.id}
                    renderTrigger={({ inLibrary }) => (
                      <button
                        className={cn(
                          "flex min-h-11 min-w-11 items-center justify-center rounded-field p-2.5 transition-colors border",
                          inLibrary
                            ? "bg-accent-600 border-accent-600 text-fg-inverse"
                            : "bg-transparent border-edge-strong text-fg-muted hover:text-fg hover:bg-surface-3"
                        )}
                      >
                        <Bookmark className="h-5 w-5" fill={inLibrary ? "currentColor" : "none"} />
                      </button>
                    )}
                  />
                </div>
              </div>

              {/* Your rating */}
              <div className="space-y-2">
                <span className="block text-xs font-medium text-fg-muted">Your rating</span>
                {libraryEntry ? (
                  <div className="grid grid-cols-5 gap-2 sm:grid-cols-10" role="group" aria-label="Your rating, 1 to 10">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => {
                      const isCurrent = libraryEntry.showScore === score;
                      return (
                        <button
                          key={score}
                          onClick={() => handleRate(score)}
                          aria-pressed={isCurrent}
                          aria-label={isCurrent ? `Rated ${score} of 10 — tap to clear` : `Rate ${score} of 10`}
                          className={cn(
                            'flex h-11 min-w-11 items-center justify-center rounded-field text-sm font-semibold transition-colors',
                            isCurrent
                              ? 'bg-accent-600 text-fg-inverse hover:bg-accent-500'
                              : 'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg',
                          )}
                        >
                          {score}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-caption text-fg-muted">Add to library to rate</p>
                )}
              </div>

              {libraryEntry && (
                <button
                  onClick={handleRemoveFromLibrary}
                  className="text-xs font-medium text-danger-400/80 underline-offset-2 transition-colors hover:text-danger-300 hover:underline"
                >
                  Remove from Library
                </button>
              )}
            </div>
            
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
