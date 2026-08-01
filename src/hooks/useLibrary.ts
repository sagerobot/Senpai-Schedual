import { useState, useEffect } from 'react';
import { LibraryEntry, LibraryStatus } from '../types';

export function useLibrary() {
  const [library, setLibrary] = useState<LibraryEntry[]>(() => {
    const savedLibrary = localStorage.getItem('anime_library');
    if (savedLibrary) {
      return JSON.parse(savedLibrary);
    }
    
    // Migrate old favorites
    const savedFavorites = localStorage.getItem('anime_favorites');
    if (savedFavorites) {
      const favs: number[] = JSON.parse(savedFavorites);
      const migrated: LibraryEntry[] = favs.map(id => ({
        showId: id,
        idMal: null,
        status: 'watching',
        showScore: null,
        source: 'manual',
      }));
      localStorage.setItem('anime_library', JSON.stringify(migrated));
      return migrated;
    }
    
    return [];
  });

  useEffect(() => {
    localStorage.setItem('anime_library', JSON.stringify(library));
  }, [library]);

  const updateEntry = (showId: number, update: Partial<LibraryEntry>) => {
    setLibrary(prev => {
      const existingIdx = prev.findIndex(e => e.showId === showId);
      if (existingIdx !== -1) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], ...update, updatedAt: Date.now() };
        return next;
      }
      return [
        ...prev,
        {
          showId,
          idMal: update.idMal || null,
          status: update.status || 'watching',
          showScore: update.showScore || null,
          source: update.source || 'manual',
          updatedAt: Date.now()
        }
      ];
    });
  };

  const toggleFavorite = (id: number) => {
    setLibrary(prev => {
      const existing = prev.find(e => e.showId === id);
      if (existing && existing.status === 'watching') {
        return prev.filter(e => e.showId !== id);
      } else if (existing) {
        const next = [...prev];
        const idx = next.findIndex(e => e.showId === id);
        next[idx] = { ...next[idx], status: 'watching', updatedAt: Date.now() };
        return next;
      } else {
        return [
          ...prev,
          {
            showId: id,
            idMal: null,
            status: 'watching',
            showScore: null,
            source: 'manual',
            updatedAt: Date.now()
          }
        ];
      }
    });
  };

  const isFavorite = (id: number) => {
    return library.some(e => e.showId === id && e.status === 'watching');
  };

  const setLibraryBulk = (entries: LibraryEntry[]) => {
    setLibrary(prev => {
      const next = [...prev];
      entries.forEach(newEntry => {
        const existingIdx = next.findIndex(e => e.showId === newEntry.showId);
        if (existingIdx >= 0) {
          next[existingIdx] = { ...next[existingIdx], ...newEntry };
        } else {
          next.push(newEntry);
        }
      });
      return next;
    });
  };

  return { library, updateEntry, toggleFavorite, isFavorite, setLibraryBulk };
}
