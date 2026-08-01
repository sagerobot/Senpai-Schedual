import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AnimeMedia } from '../../types';
import { useSearchQuery } from '../../queries/hooks';
import { Search, Loader2, Sparkles } from 'lucide-react';
import { AnimeCard } from '../../components/AnimeCard';
import { ErrorState, errorDetail } from '../../components/ErrorState';

interface SearchViewProps {
  onAnimeSelect: (anime: AnimeMedia) => void;
}

const QUERY_PARAM = 'q';
const DEBOUNCE_MS = 350;

/** Something to tap before the user has anything in mind: genres + evergreens. */
const SUGGESTED_SEARCHES = ['Action', 'Romance', 'Frieren', 'One Piece'];

export function SearchView({ onAnimeSelect }: SearchViewProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get(QUERY_PARAM) ?? '';

  // The input stays local so typing is never a round-trip through the router.
  // The URL holds the committed query and is the only thing the fetch reacts to.
  const [query, setQuery] = useState(urlQuery);
  const committed = useRef(urlQuery);

  const search = useSearchQuery(urlQuery);
  const results = search.data ?? [];
  const term = urlQuery.trim();
  const loading = term.length > 0 && search.isPending;

  const commit = useCallback(
    (value: string) => {
      committed.current = value;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value.trim()) next.set(QUERY_PARAM, value);
          else next.delete(QUERY_PARAM);
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  // Typing -> URL, debounced. Replace rather than push so Back doesn't walk
  // back through every keystroke.
  useEffect(() => {
    if (query === committed.current) return;
    const timer = setTimeout(() => commit(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, commit]);

  // URL -> input, for Back/Forward and cold-loaded /search?q=... links.
  useEffect(() => {
    if (urlQuery === committed.current) return;
    committed.current = urlQuery;
    setQuery(urlQuery);
  }, [urlQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    commit(query);
  };

  // A suggestion writes both the input and the URL immediately — the URL→input
  // sync effect skips values it already committed itself.
  const applySuggestion = (value: string) => {
    setQuery(value);
    commit(value);
  };

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Search</h1>
        <p className="text-gray-400 mt-2 text-sm">Find and add previous seasons, movies, or any anime to your watchlist.</p>
      </div>

      <form onSubmit={handleSubmit} className="relative w-full max-w-2xl mb-8">
        <div className="relative flex items-center">
          <Search className="absolute left-4 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by title (e.g., You and I Are Polar Opposites)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-[#0a0c16] border border-[#1e2336] rounded-xl py-4 pl-12 pr-24 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="absolute right-2 bg-purple-600 hover:bg-purple-500 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Search
          </button>
        </div>
      </form>

      {term.length === 0 ? (
        // Pre-search: a prompt plus somewhere to tap, never a blank page.
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-edge bg-surface-0 px-6 py-16 text-center">
          <Sparkles className="mb-4 h-8 w-8 text-accent-400" />
          <p className="font-medium text-gray-200">Look up any anime, past or present.</p>
          <p className="mt-1 text-sm text-gray-500">Try a genre or a title to get going:</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {SUGGESTED_SEARCHES.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => applySuggestion(suggestion)}
                className="rounded-full border border-edge bg-surface-1 px-4 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:border-accent-500/50 hover:bg-surface-2 hover:text-white"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        </div>
      ) : search.isError ? (
        // A failed search and a search that found nothing are different answers.
        <ErrorState
          title="Search failed."
          detail={errorDetail(search.error)}
          onRetry={() => void search.refetch()}
          className="min-h-64"
        />
      ) : search.isSuccess && results.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-800 bg-[#0a0c16]">
          <Search className="mb-4 h-8 w-8 text-gray-600" />
          <p className="text-gray-400">No results found for "{urlQuery}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {results.map((anime) => (
            <AnimeCard
              key={anime.id}
              anime={anime}
              onClick={() => onAnimeSelect(anime)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
