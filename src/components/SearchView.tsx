import React, { useState } from 'react';
import { AnimeMedia } from '../types';
import { searchAnime } from '../api/anilist';
import { Search, Loader2 } from 'lucide-react';
import { AnimeCard } from './AnimeCard';

interface SearchViewProps {
  favorites: number[];
  onToggleFavorite: (id: number) => void;
  onAnimeSelect: (anime: AnimeMedia) => void;
}

export function SearchView({ favorites, onToggleFavorite, onAnimeSelect }: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AnimeMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const data = await searchAnime(query.trim());
      setResults(data);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight">Search</h2>
        <p className="text-gray-400 mt-2 text-sm">Find and add previous seasons, movies, or any anime to your watchlist.</p>
      </div>

      <form onSubmit={handleSearch} className="relative w-full max-w-2xl mb-8">
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

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        </div>
      ) : searched && results.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-800 bg-[#0a0c16]">
          <Search className="mb-4 h-8 w-8 text-gray-600" />
          <p className="text-gray-400">No results found for "{query}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {results.map((anime) => (
            <AnimeCard
              key={anime.id}
              anime={anime}
              isFavorite={favorites.includes(anime.id)}
              onToggleFavorite={() => onToggleFavorite(anime.id)}
              onClick={() => onAnimeSelect(anime)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
