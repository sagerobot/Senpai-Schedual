import React, { useState } from 'react';
import { AnimeMedia, LibraryEntry } from '../../types';
import { useRecommendations } from '../../hooks/useRecommendations';
import { AnimeCard } from '../../components/AnimeCard';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Sparkles, X, Filter, Moon, PowerOff, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ForYouViewProps {
  library: LibraryEntry[];
  favorites: number[];
  onToggleFavorite: (id: number) => void;
  onAnimeSelect: (anime: AnimeMedia) => void;
}

export function ForYouView({ library, favorites, onToggleFavorite, onAnimeSelect }: ForYouViewProps) {
  const { recommendations, loading, status, errorMessage, removeRecommendation, forceRecompute } = useRecommendations(library);
  const [filter, setFilter] = useState<'all' | 'season'>('all');

  const filteredRecs = recommendations.filter(rec => {
    if (filter === 'season') return rec.show.status === 'RELEASING';
    return true;
  });

  if (loading && recommendations.length === 0) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center space-y-4 text-purple-500">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm font-medium text-gray-400">Analyzing your library and discovering shows...</p>
      </div>
    );
  }

  if (library.filter(e => e.showScore !== null).length === 0) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center space-y-4 text-center">
        <Sparkles className="h-12 w-12 text-gray-700" />
        <h2 className="text-xl font-bold text-gray-300">Rate shows to get recommendations</h2>
        <p className="max-w-md text-sm text-gray-500">
          Once you add shows to your library and give them a score, Senpai will analyze your taste and find new anime for you to watch.
        </p>
      </div>
    );
  }

  if (recommendations.length === 0 && status === 'resting') {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center space-y-4 text-center">
        <Moon className="h-12 w-12 text-accent-400/60" />
        <h2 className="text-xl font-bold text-gray-300">AI recommendations are resting — back tomorrow</h2>
        <p className="max-w-md text-sm text-gray-500">
          The daily AI budget is spent. Your recommendations will refresh when it resets.
        </p>
      </div>
    );
  }

  if (recommendations.length === 0 && status === 'no_key') {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center space-y-4 text-center">
        <PowerOff className="h-12 w-12 text-gray-600" />
        <h2 className="text-xl font-bold text-gray-300">AI features are off in this deployment</h2>
        <p className="max-w-md text-sm text-gray-500">
          This server is running without an AI key, so recommendations can't be generated.
        </p>
      </div>
    );
  }

  if (recommendations.length === 0 && status === 'error') {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center space-y-4 text-center">
        <AlertTriangle className="h-12 w-12 text-rose-400/70" />
        <h2 className="text-xl font-bold text-gray-300">Couldn't build your recommendations</h2>
        <p className="max-w-md text-sm text-gray-500">{errorMessage ?? 'Something went wrong talking to the server.'}</p>
        <button
          onClick={forceRecompute}
          className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-500"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">For You</h1>
          <p className="text-sm text-gray-400">Personalized recommendations based on your highest-rated shows.</p>
        </div>
        
        <div className="flex items-center space-x-2 rounded-lg bg-[#1c1c1f] p-1 border border-gray-800 self-start sm:self-auto">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              filter === 'all' ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-200"
            )}
          >
            All Recommendations
          </button>
          <button
            onClick={() => setFilter('season')}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1",
              filter === 'season' ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-200"
            )}
          >
            <Filter className="h-3 w-3" />
            Currently Airing
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-purple-400 bg-purple-900/10 px-3 py-2 rounded-lg border border-purple-900/30 w-max">
          <Loader2 className="h-4 w-4 animate-spin" />
          Updating recommendations...
        </div>
      )}

      {!loading && status === 'error' && recommendations.length > 0 && (
        <div className="flex items-center gap-3 text-sm text-rose-300 bg-rose-950/20 px-3 py-2 rounded-lg border border-rose-900/40 w-max">
          <AlertTriangle className="h-4 w-4" />
          <span>Couldn't refresh recommendations — showing your last results.</span>
          <button onClick={forceRecompute} className="font-medium text-rose-200 underline hover:text-white">
            Retry
          </button>
        </div>
      )}

      {filteredRecs.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center space-y-2 text-center rounded-xl border border-gray-800 border-dashed bg-[#1c1c1f]/50">
          <p className="text-sm text-gray-400">No recommendations found for this filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          <AnimatePresence mode="popLayout">
            {filteredRecs.map((rec) => (
              <motion.div
                key={rec.show.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="group relative flex flex-col"
              >
                <button
                  onClick={() => removeRecommendation(rec.show.id)}
                  className="absolute -top-2 -right-2 z-20 hidden h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-transform hover:scale-110 group-hover:flex"
                  title="Not interested"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="flex-1">
                  <AnimeCard
                    anime={rec.show}
                    isFavorite={favorites.includes(rec.show.id)}
                    onToggleFavorite={() => onToggleFavorite(rec.show.id)}
                    onClick={() => onAnimeSelect(rec.show)}
                  />
                </div>
                <div className="mt-2 text-xs text-gray-400 bg-[#1c1c1f] p-2 rounded-lg border border-gray-800 relative z-10 flex-1">
                  <span className="text-purple-400 font-medium mr-1 flex items-center gap-1 mb-1">
                    <Sparkles className="h-3 w-3" />
                    Why:
                  </span>
                  <span className="line-clamp-3 leading-relaxed" title={rec.reason}>{rec.reason}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
