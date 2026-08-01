import { toast } from 'sonner';
import { LibraryStatus } from '../types';
import { selectLibraryArray, useUserData } from '../stores/userData';

/**
 * Facade over the userData store. Keeps the pre-store hook API so no
 * component changes, but toggleFavorite is no longer destructive: every
 * branch gets a toast with an Undo action, and removal snapshots the entry
 * plus its episode logs for restore.
 */
export function useLibrary() {
  const library = useUserData(selectLibraryArray);
  const updateEntry = useUserData((s) => s.upsertEntry);
  const setLibraryBulk = useUserData((s) => s.setLibraryBulk);

  const toggleFavorite = (id: number) => {
    const store = useUserData.getState();
    const existing = store.library[id];

    if (existing === undefined) {
      store.addToLibrary(id);
      toast('Added to Library — Watching', {
        action: { label: 'Undo', onClick: () => useUserData.getState().removeFromLibrary(id) },
      });
    } else if (existing.status === 'watching') {
      const snapshot = store.removeFromLibrary(id);
      toast(
        'Removed from Library',
        snapshot
          ? { action: { label: 'Undo', onClick: () => useUserData.getState().restoreSnapshot(snapshot) } }
          : undefined,
      );
    } else {
      const previousStatus: LibraryStatus = existing.status;
      store.setStatus(id, 'watching');
      toast('Moved to Watching', {
        action: { label: 'Undo', onClick: () => useUserData.getState().setStatus(id, previousStatus) },
      });
    }
  };

  const isFavorite = (id: number) => {
    return library.some((e) => e.showId === id && e.status === 'watching');
  };

  return { library, updateEntry, toggleFavorite, isFavorite, setLibraryBulk };
}
