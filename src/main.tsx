import {PersistQueryClientProvider} from '@tanstack/react-query-persist-client';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {RouterProvider} from 'react-router/dom';
import {ThemedToaster} from './components/ThemedToaster';
import {applyTheme} from './lib/theme';
import {persistOptions, queryClient} from './queries/client';
import {router} from './routes/router';
import {useUserData} from './stores/userData';
import './index.css';

// The inline script in index.html stamped data-theme pre-paint; this refines
// (meta theme-color, per-theme fonts) and follows every later pref change.
applyTheme(useUserData.getState().uiPrefs);
useUserData.subscribe((state, prev) => {
  if (state.uiPrefs.theme !== prev.uiPrefs.theme || state.uiPrefs.customTheme !== prev.uiPrefs.customTheme) {
    applyTheme(state.uiPrefs);
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <RouterProvider router={router} />
      <ThemedToaster />
    </PersistQueryClientProvider>
  </StrictMode>,
);
