import * as Dialog from '@radix-ui/react-dialog';
import { X, ExternalLink, Bookmark, MessageCircle, Loader2, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { AnimeMedia, LibraryEntry } from '../../types';
import { fetchShowDetails, ShowDetails } from '../../api/showDetails';
import { fetchAnimeByIds, fetchMediaById } from '../../api/anilist/queries';
import { displayTitle } from '../../lib/displayTitle';
import { useCommunityPulse } from './useCommunityPulse';
import { useSimulcastOffsets } from '../../hooks/useSimulcastOffsets';
import { formatTimeUntil, cn } from '../../lib/utils';
import { splitFromSeries, mergeIntoSeries } from '../../utils/seriesOverrides';
import { motion, AnimatePresence } from 'motion/react';

interface ShowDetailModalProps {
  anime: AnimeMedia;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: (id: number) => void;
  onAnimeSelect?: (anime: AnimeMedia) => void;
  libraryEntry?: LibraryEntry;
  onUpdateEntry?: (showId: number, update: Partial<LibraryEntry>) => void;
}

type TabType = 'mal' | 'anilist' | 'kitsu';

export function ShowDetailModal({ anime, onClose, isFavorite, onToggleFavorite, onAnimeSelect, libraryEntry, onUpdateEntry }: ShowDetailModalProps) {
  const [details, setDetails] = useState<ShowDetails | null>(null);
  // List queries no longer carry `description` (localStorage quota); the modal
  // fetches the full record by id and uses the passed-in anime for immediate render.
  const [fullMedia, setFullMedia] = useState<AnimeMedia | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('mal');
  const [loadingRelationId, setLoadingRelationId] = useState<number | null>(null);

  const latestEpisode = anime.nextAiringEpisode ? Math.max(1, anime.nextAiringEpisode.episode - 1) : anime.episodes || 1;
  const [selectedEpisode, setSelectedEpisode] = useState(latestEpisode);
  const { pulse, state: pulseState, load: loadPulse } = useCommunityPulse(displayTitle(anime), selectedEpisode, anime.id);
  const { offsets, setOffset } = useSimulcastOffsets();

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setFullMedia(null);

    Promise.all([
      fetchShowDetails(anime.idMal, displayTitle(anime), anime.description ?? '', anime.id),
      fetchMediaById(anime.id).catch(() => null),
    ]).then(([data, full]) => {
      if (mounted) {
        setDetails(data);
        setFullMedia(full);

        // Auto select best tab
        const anilistSynopsis = full?.description ?? anime.description;
        if (!data.mal?.synopsis && anilistSynopsis) setActiveTab('anilist');
        else if (!data.mal?.synopsis && !anilistSynopsis && data.kitsu?.synopsis) setActiveTab('kitsu');

        setLoading(false);
      }
    });

    return () => { mounted = false; };
  }, [anime]);

  const anilistDescription = fullMedia?.description ?? anime.description ?? null;

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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] p-4 md:p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <div className="relative flex max-h-[85vh] flex-col overflow-hidden rounded-2xl bg-[#1c1c1f] text-gray-200 shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-gray-800">
            
            {/* Header */}
            <div className="flex gap-4 p-5 md:p-6 pb-2">
              <div className="shrink-0">
                <img 
                  src={anime.coverImage.large}
                  alt={displayTitle(anime)}
                  className="h-32 w-24 rounded-lg object-cover shadow-md bg-gray-900"
                />
              </div>
              <div className="flex flex-col justify-center py-1">
                <Dialog.Title className="text-xl md:text-2xl font-bold tracking-tight text-white mb-3">
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
                  {anime.externalLinks.find(l => ['Crunchyroll', 'Netflix', 'HiDive', 'Hulu', 'Amazon', 'CustomSource'].some(s => l.site.toLowerCase().includes(s.toLowerCase()))) && (
                    <div className="rounded-full bg-[#323236] px-3 py-1.5 text-gray-300">
                      {anime.externalLinks.find(l => ['Crunchyroll', 'Netflix', 'HiDive', 'Hulu', 'Amazon', 'CustomSource'].some(s => l.site.toLowerCase().includes(s.toLowerCase())))!.site}
                    </div>
                  )}
                  {anime.genres && anime.genres.length > 0 && (
                    <div className="rounded-full bg-[#323236] px-3 py-1.5 text-gray-300">
                      {anime.genres.slice(0, 2).join(' · ')}
                    </div>
                  )}
                </div>
              </div>
              <Dialog.Close className="absolute right-4 top-4 rounded-lg border border-gray-700 bg-transparent p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white focus:outline-none">
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
                    <div className="flex-1 h-[70px] animate-pulse rounded-xl bg-[#2a2a2d]"></div>
                    <div className="flex-1 h-[70px] animate-pulse rounded-xl bg-[#2a2a2d]"></div>
                    <div className="flex-1 h-[70px] animate-pulse rounded-xl bg-[#2a2a2d]"></div>
                    <div className="flex-1 h-[70px] animate-pulse rounded-xl bg-[#2a2a2d]"></div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-1 flex-col justify-center rounded-xl bg-[#2a2a2d] py-3">
                      <span className="text-[10px] font-semibold uppercase text-gray-500">MAL</span>
                      <span className="text-2xl font-bold text-white">{malScore || '-'}</span>
                    </div>
                    <div className="flex flex-1 flex-col justify-center rounded-xl bg-[#2a2a2d] py-3">
                      <span className="text-[10px] font-semibold uppercase text-gray-500">AniList</span>
                      <span className="text-2xl font-bold text-white">{anilistScore ? `${anilistScore}%` : '-'}</span>
                    </div>
                    <div className="flex flex-1 flex-col justify-center rounded-xl bg-[#2a2a2d] py-3">
                      <span className="text-[10px] font-semibold uppercase text-gray-500">Kitsu</span>
                      <span className="text-2xl font-bold text-white">{kitsuScore ? `${kitsuScore}%` : '-'}</span>
                    </div>
                    <div className="flex flex-1 flex-col justify-center rounded-xl bg-accent-600/20 border border-accent-500/30 py-3">
                      <span className="text-[10px] font-semibold uppercase text-accent-400">Average</span>
                      <span className="text-2xl font-bold text-white">{normalizedAverage || '-'}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Source Material Card */}
              {!loading && (
                <div className="flex items-center justify-between rounded-xl bg-[#2a2a2d] p-4">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-gray-400">Source Material</span>
                    {isOriginal ? (
                      <span className="text-sm font-semibold text-white">Anime original</span>
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
                    <div className="rounded-full bg-orange-500/20 px-2.5 py-1 text-[10px] font-bold text-orange-400 border border-orange-500/30">
                      Source rated higher
                    </div>
                  )}
                  {anime.trending && anime.trending > 0 && (
                    <div className="rounded-full bg-pink-500/20 px-2.5 py-1 text-[10px] font-bold text-pink-400 border border-pink-500/30 ml-2">
                      #{anime.trending} Trending
                    </div>
                  )}
                </div>
              )}


              {/* Related Anime */}
              {!loading && anime.relations?.edges && anime.relations.edges.filter(e => e.node?.type === 'ANIME').length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-300">Related Anime</h3>
                  <div className="flex flex-wrap gap-2">
                    {anime.relations.edges.filter(e => e.node?.type === 'ANIME').map(e => (
                      <button
                        key={e.node.id}
                        disabled={loadingRelationId !== null}
                        onClick={async () => {
                          if (onAnimeSelect) {
                            setLoadingRelationId(e.node.id);
                            try {
                              const fetched = await fetchAnimeByIds([e.node.id]);
                              if (fetched && fetched[0]) {
                                onAnimeSelect(fetched[0]);
                              }
                            } finally {
                              setLoadingRelationId(null);
                            }
                          }
                        }}
                        className="flex items-center gap-2 rounded-lg bg-[#2a2a2d] px-3 py-2 text-left transition-colors hover:bg-accent-500/20 hover:border-accent-500/50 border border-transparent disabled:opacity-50"
                      >
                        <div className="flex flex-col">
                          <span className="text-[10px] font-semibold uppercase text-accent-400">{e.relationType.replace('_', ' ')}</span>
                          <span className="text-xs font-medium text-white line-clamp-1">{e.node.title.userPreferred}</span>
                        </div>
                        {loadingRelationId === e.node.id && <Loader2 className="w-4 h-4 animate-spin text-accent-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Synopsis Section */}
              {loading ? (
                <div className="space-y-4 animate-pulse">
                  <div className="flex justify-between border-b border-gray-800 pb-2">
                    <div className="h-4 w-20 rounded bg-[#2a2a2d]"></div>
                    <div className="flex space-x-2">
                      <div className="h-6 w-12 rounded-full bg-[#2a2a2d]"></div>
                      <div className="h-6 w-16 rounded-full bg-[#2a2a2d]"></div>
                    </div>
                  </div>
                  <div className="space-y-2 rounded-xl bg-[#2a2a2d] p-4">
                    <div className="h-4 w-full rounded bg-gray-700"></div>
                    <div className="h-4 w-[90%] rounded bg-gray-700"></div>
                    <div className="h-4 w-[95%] rounded bg-gray-700"></div>
                  </div>
                </div>
              ) : tabs.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-300">Synopsis</h3>
                    <div className="flex space-x-2">
                      {tabs.map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={cn(
                            "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                            activeTab === tab.id
                              ? "bg-accent-600/20 border border-accent-500/40 text-accent-300"
                              : "border border-gray-700 text-gray-400 hover:text-gray-200"
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#2a2a2d] p-4 text-sm leading-relaxed text-gray-200 prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: activeContent }} />
                </div>
              )}

              {/* AI Summary */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-gray-800 bg-[#2a2a2d]/50">
                  <Loader2 className="h-6 w-6 animate-spin text-accent-400" />
                  <p className="mt-2 text-sm text-gray-400">Analyzing synopses...</p>
                </div>
              ) : details?.aiSummary ? (
                <div className="relative rounded-xl border border-accent-500/30 bg-[#242436] p-4">
                  <div className="mb-2 flex items-center space-x-2">
                    <Sparkles className="h-4 w-4 text-accent-400" />
                    <span className="text-xs font-semibold text-accent-400">AI summary</span>
                    <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">Spoiler-free</span>
                  </div>
                  <p className="text-sm leading-relaxed text-gray-200">
                    {details.aiSummary}
                  </p>
                </div>
              ) : null}

              {/* Community Pulse Section */}
              <div className="mt-2 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-300">Episodes</h3>
                </div>
                <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
                  {Array.from({ length: latestEpisode }, (_, i) => i + 1).map(ep => (
                    <button
                      key={ep}
                      onClick={() => setSelectedEpisode(ep)}
                      className={cn(
                        "shrink-0 flex items-center justify-center h-8 min-w-[2rem] px-2 rounded-lg text-xs font-medium transition-colors",
                        selectedEpisode === ep
                          ? "bg-accent-600 text-white"
                          : "bg-[#2a2a2d] text-gray-400 hover:text-white hover:bg-gray-700"
                      )}
                    >
                      {ep}
                    </button>
                  ))}
                </div>
              </div>
              {pulseState === 'idle' ? (
                <div className="flex flex-col items-center space-y-2 rounded-xl border border-gray-800 bg-[#2a2a2d]/50 p-5">
                  <button
                    onClick={loadPulse}
                    className="flex items-center space-x-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-500"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>Check community vibe</span>
                  </button>
                  <p className="text-xs text-gray-500">Searches r/anime discussion for episode {selectedEpisode}</p>
                </div>
              ) : pulseState === 'loading' ? (
                <div className="relative rounded-xl border border-gray-800 bg-[#2a2a2d]/50 p-4 animate-pulse">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="h-4 w-4 rounded-full bg-gray-700"></div>
                      <div className="h-4 w-32 rounded bg-gray-700"></div>
                    </div>
                    <div className="flex space-x-3">
                      <div className="h-3 w-10 rounded bg-gray-700"></div>
                      <div className="h-3 w-10 rounded bg-gray-700"></div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="h-3 w-full rounded bg-gray-700"></div>
                    <div className="h-3 w-4/5 rounded bg-gray-700"></div>
                  </div>
                </div>
              ) : pulseState === 'ok' && pulse ? (
                <div className={cn("relative rounded-xl border p-4",
                  pulse.indicator === 'positive' ? "bg-emerald-950/30 border-emerald-500/30" : 
                  pulse.indicator === 'negative' ? "bg-rose-950/30 border-rose-500/30" : 
                  "bg-pink-950/30 border-pink-500/30"
                )}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <MessageCircle className={cn("h-4 w-4", 
                        pulse.indicator === 'positive' ? "text-emerald-400" : 
                        pulse.indicator === 'negative' ? "text-rose-400" : 
                        "text-pink-400"
                      )} />
                      <span className={cn("text-xs font-semibold", 
                        pulse.indicator === 'positive' ? "text-emerald-400" : 
                        pulse.indicator === 'negative' ? "text-rose-400" : 
                        "text-pink-400"
                      )}>Community vibe (Ep {selectedEpisode})</span>
                      <span className="rounded-full bg-purple-950 px-2 py-0.5 text-[10px] font-semibold text-accent-300">Spoiler-free</span>
                    </div>
                    <div className={cn("flex items-center space-x-3 text-xs", 
                        pulse.indicator === 'positive' ? "text-emerald-300/80" : 
                        pulse.indicator === 'negative' ? "text-rose-300/80" : 
                        "text-pink-300/80"
                      )}>
                      {pulse.upvotes > 0 || pulse.comments > 0 ? (
                        <>
                          <span>↑ {pulse.upvotes}</span>
                          <span>💬 {pulse.comments}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <p className={cn("text-sm leading-relaxed text-gray-200", (pulse.goods?.length || pulse.bads?.length) ? "mb-3" : "")}>
                    {pulse.summary}
                  </p>
                  
                  {((pulse.goods && pulse.goods.length > 0) || (pulse.bads && pulse.bads.length > 0)) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-700/50">
                      {pulse.goods && pulse.goods.length > 0 && (
                        <div>
                          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Highlights</span>
                          <ul className="mt-1 space-y-1">
                            {pulse.goods.map((good, i) => (
                              <li key={i} className="text-xs text-gray-300 flex items-start">
                                <span className="text-emerald-500 mr-1.5">•</span>
                                <span>{good}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {pulse.bads && pulse.bads.length > 0 && (
                        <div>
                          <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">Critiques</span>
                          <ul className="mt-1 space-y-1">
                            {pulse.bads.map((bad, i) => (
                              <li key={i} className="text-xs text-gray-300 flex items-start">
                                <span className="text-rose-500 mr-1.5">•</span>
                                <span>{bad}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : pulseState === 'resting' ? (
                <div className="rounded-xl border border-gray-800 bg-[#2a2a2d]/50 p-5 text-center text-sm text-gray-500">
                  AI features are resting — try again tomorrow
                </div>
              ) : pulseState === 'no_key' ? (
                <div className="rounded-xl border border-gray-800 bg-[#2a2a2d]/50 p-5 text-center text-sm text-gray-500">
                  AI features are off in this deployment
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-3 rounded-xl border border-rose-500/30 bg-rose-950/30 p-5 text-center">
                  <p className="text-sm text-rose-200">Could not check the community vibe.</p>
                  <button
                    onClick={loadPulse}
                    className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>

                        {/* Advanced Overrides */}
            <div className="px-5 md:px-6 mb-4 flex flex-wrap gap-3 items-center">
              <button 
                onClick={() => {
                  splitFromSeries(anime.id);
                  alert('Show marked as standalone series.');
                }}
                className="text-xs text-gray-500 hover:text-white underline"
              >
                Split from series
              </button>
              <button 
                onClick={() => {
                  const target = prompt('Enter the AniList ID of the series to merge into:');
                  if (target && !isNaN(parseInt(target))) {
                    mergeIntoSeries(anime.id, parseInt(target));
                    alert('Show merged into target series.');
                  }
                }}
                className="text-xs text-gray-500 hover:text-white underline"
              >
                Merge into series
              </button>
              <button 
                onClick={() => {
                  const current = offsets[anime.id] || 0;
                  const res = prompt('Enter simulcast delay in minutes (e.g. 30 for half an hour later):', current.toString());
                  if (res !== null && !isNaN(parseInt(res))) {
                    setOffset(anime.id, parseInt(res));
                    alert('Delay updated! Please refresh the page to see changes.');
                  }
                }}
                className="text-xs text-gray-500 hover:text-white underline"
              >
                Adjust simulcast time
              </button>
            </div>
            {/* Footer Actions */}
            <div className="flex flex-wrap items-center gap-3 p-5 md:p-6 shrink-0 pt-0">
              <a
                href={`https://www.reddit.com/r/anime/search/?q=${encodeURIComponent(displayTitle(anime))}+episode+${anime.nextAiringEpisode ? anime.nextAiringEpisode.episode - 1 : 1}+discussion&restrict_sr=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center space-x-2 rounded-lg border border-gray-700 bg-transparent px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Episode discussion</span>
              </a>

              {anime.externalLinks.find(l => ['Crunchyroll', 'Netflix', 'HiDive', 'Hulu', 'Amazon', 'CustomSource'].some(s => l.site.toLowerCase().includes(s.toLowerCase()))) && (
                <a
                  href={anime.externalLinks.find(l => ['Crunchyroll', 'Netflix', 'HiDive', 'Hulu', 'Amazon', 'CustomSource'].some(s => l.site.toLowerCase().includes(s.toLowerCase())))!.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center space-x-2 rounded-lg border border-gray-700 bg-transparent px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Watch on {anime.externalLinks.find(l => ['Crunchyroll', 'Netflix', 'HiDive', 'Hulu', 'Amazon', 'CustomSource'].some(s => l.site.toLowerCase().includes(s.toLowerCase())))!.site}</span>
                </a>
              )}

              <div className="flex items-center gap-2">
                {libraryEntry && onUpdateEntry && (
                  <select
                    value={libraryEntry.status}
                    onChange={(e) => onUpdateEntry(anime.id, { status: e.target.value as any })}
                    className="rounded-lg border border-gray-700 bg-[#2a2a2d] px-3 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:border-gray-600 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  >
                    <option value="watching">Watching</option>
                    <option value="plan_to_watch">Plan to Watch</option>
                    <option value="on_hold">Shelved</option>
                    <option value="completed">Completed</option>
                    <option value="dropped">Dropped</option>
                  </select>
                )}
                <button
                  onClick={() => onToggleFavorite(anime.id)}
                  className={cn(
                    "flex items-center justify-center rounded-lg p-2.5 transition-colors border",
                    isFavorite
                      ? "bg-accent-600 border-accent-600 text-white"
                      : "bg-transparent border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
                  )}
                  title={isFavorite ? "Remove from watching" : "Add to watching"}
                >
                  <Bookmark className="h-5 w-5" fill={isFavorite ? "currentColor" : "none"} />
                  <span className="sr-only">Toggle Bookmark</span>
                </button>
              </div>
            </div>
            
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
