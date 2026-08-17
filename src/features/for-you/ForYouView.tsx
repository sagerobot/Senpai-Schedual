import { useState } from 'react';
import { Link } from 'react-router';
import { AnimeMedia, LibraryEntry } from '../../types';
import { useRecommendations } from '../../hooks/useRecommendations';
import { AnimeCard } from '../../components/AnimeCard';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Sparkles, X, Filter, Moon, PowerOff, AlertTriangle } from 'lucide-react';
import { displayTitle } from '../../lib/displayTitle';
import { cn } from '../../lib/utils';

interface ForYouViewProps {
  library: LibraryEntry[];
  onAnimeSelect: (anime: AnimeMedia) => void;
}

export function ForYouView({ library, onAnimeSelect }: ForYouViewProps) {
  const { recommendations, loading, status, errorMessage, scoredCount, removeRecommendation, forceRecompute } = useRecommendations(library);
  const [filter, setFilter] = useState<'all' | 'season'>('all');

  const filteredRecs = recommendations.filter(rec => {
    if (filter === 'season') return rec.show.status === 'RELEASING';
    return true;
  });

  if (loading && recommendations.length === 0) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center space-y-4 text-accent-500">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm font-medium text-fg-muted">Analyzing your library and discovering shows...</p>
      </div>
    );
  }

  if (scoredCount === 0) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center space-y-4 text-center">
        <Sparkles className="h-12 w-12 text-fg-faint" />
        <h1 className="text-xl font-bold text-fg-secondary">Nothing here yet</h1>
        <p className="max-w-md text-sm text-fg-faint">
          Rate a show — or just a few episodes — and Senpai will find your next watch.
        </p>
        <Link
          to="/library"
          className="rounded-field bg-accent-600 px-4 py-2.5 text-sm font-medium text-fg-inverse transition-colors hover:bg-accent-500"
        >
          Go to your Library
        </Link>
      </div>
    );
  }

  if (recommendations.length === 0 && status === 'resting') {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center space-y-4 text-center">
        <Moon className="h-12 w-12 text-accent-400/60" />
        <h1 className="text-xl font-bold text-fg-secondary">AI recommendations are resting — back tomorrow</h1>
        <p className="max-w-md text-sm text-fg-faint">
          The daily AI budget is spent. Your recommendations will refresh when it resets.
        </p>
      </div>
    );
  }

  if (recommendations.length === 0 && status === 'no_key') {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center space-y-4 text-center">
        <PowerOff className="h-12 w-12 text-fg-faint" />
        <h1 className="text-xl font-bold text-fg-secondary">AI features are off in this deployment</h1>
        <p className="max-w-md text-sm text-fg-faint">
          This server is running without an AI key, so recommendations can't be generated.
        </p>
      </div>
    );
  }

  if (recommendations.length === 0 && status === 'error') {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center space-y-4 text-center">
        <AlertTriangle className="h-12 w-12 text-danger-400/70" />
        <h1 className="text-xl font-bold text-fg-secondary">Couldn't build your recommendations</h1>
        <p className="max-w-md text-sm text-fg-faint">{errorMessage ?? 'Something went wrong talking to the server.'}</p>
        <button
          onClick={forceRecompute}
          className="rounded-field bg-accent-600 px-4 py-2 text-sm font-medium text-fg-inverse transition-colors hover:bg-accent-500"
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
          <h1 className="text-2xl font-bold tracking-tight text-fg">For You</h1>
          <p className="text-sm text-fg-muted">Personalized recommendations based on your highest-rated shows.</p>
        </div>

        <div className="flex items-center space-x-2 rounded-field bg-surface-1 p-1 border border-edge self-start sm:self-auto">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-xs transition-colors",
              filter === 'all' ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg-secondary"
            )}
          >
            All Recommendations
          </button>
          <button
            onClick={() => setFilter('season')}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-xs transition-colors flex items-center gap-1",
              filter === 'season' ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg-secondary"
            )}
          >
            <Filter className="h-3 w-3" />
            Currently Airing
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-accent-400 bg-accent-600/10 px-3 py-2 rounded-field border border-accent-500/30 w-max">
          <Loader2 className="h-4 w-4 animate-spin" />
          Updating recommendations...
        </div>
      )}

      {!loading && status === 'error' && recommendations.length > 0 && (
        <div className="flex items-center gap-3 text-sm text-danger-300 bg-danger-600/10 px-3 py-2 rounded-field border border-danger-500/40 w-max">
          <AlertTriangle className="h-4 w-4" />
          <span>Couldn't refresh recommendations — showing your last results.</span>
          <button onClick={forceRecompute} className="font-medium text-danger-300 underline hover:text-fg">
            Retry
          </button>
        </div>
      )}

      {filteredRecs.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center space-y-2 text-center rounded-inner border border-edge border-dashed bg-surface-1/50">
          <p className="text-sm text-fg-muted">No recommendations found for this filter.</p>
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
                  aria-label={`Not interested in ${displayTitle(rec.show)}`}
                  title="Not interested"
                  className="group/dismiss absolute -top-3 -right-3 z-20 flex h-11 w-11 items-center justify-center"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-edge bg-surface-3 text-fg-secondary shadow-e2 transition-all group-hover/dismiss:scale-110 group-hover/dismiss:bg-danger-600 group-hover/dismiss:text-fg-inverse">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </button>
                <div className="flex-1">
                  <AnimeCard
                    anime={rec.show}
                    onClick={() => onAnimeSelect(rec.show)}
                  />
                </div>
                <div className="mt-2 text-xs text-fg-muted bg-surface-1 p-2 rounded-field border border-edge relative z-10 flex-1">
                  <span className="text-accent-400 font-medium mr-1 flex items-center gap-1 mb-1">
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
