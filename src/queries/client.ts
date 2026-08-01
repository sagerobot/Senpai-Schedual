import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient, type Query } from '@tanstack/react-query';
import { removeOldestQuery } from '@tanstack/react-query-persist-client';
import { QUERY_CACHE_KEY } from '../stores/storage';
import { isPersistedKey } from './keys';

/** Bump to discard every persisted query after a shape change. */
const BUSTER = 'v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The AniList client already retries 429s internally (4 attempts,
      // honoring Retry-After) behind a global rate limiter. One retry here
      // covers a transient network blip without multiplying that budget.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: typeof window === 'undefined' ? undefined : window.localStorage,
  key: QUERY_CACHE_KEY,
  // Under quota pressure, drop the oldest query and retry rather than losing
  // the whole cache — this blob is the first thing storage.ts evicts anyway.
  retry: removeOldestQuery,
});

export const persistOptions = {
  persister,
  buster: BUSTER,
  maxAge: MAX_AGE_MS,
  dehydrateOptions: {
    /** Only settled data, and only the families keys.ts marks as worth keeping. */
    shouldDehydrateQuery: (query: Query) =>
      query.state.status === 'success' && isPersistedKey(query.queryKey),
  },
};
