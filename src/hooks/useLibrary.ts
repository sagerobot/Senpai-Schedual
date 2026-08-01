import { selectLibraryArray, useUserData } from '../stores/userData';

/**
 * Facade over the userData store, kept for the handful of consumers that
 * predate it. Library mutations from the UI go through LibraryStatusMenu
 * or the store's actions directly.
 */
export function useLibrary() {
  const library = useUserData(selectLibraryArray);
  const updateEntry = useUserData((s) => s.upsertEntry);
  const setLibraryBulk = useUserData((s) => s.setLibraryBulk);

  return { library, updateEntry, setLibraryBulk };
}
