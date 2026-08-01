import {PersistQueryClientProvider} from '@tanstack/react-query-persist-client';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {RouterProvider} from 'react-router/dom';
import {Toaster} from 'sonner';
import {persistOptions, queryClient} from './queries/client';
import {router} from './routes/router';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <RouterProvider router={router} />
      <Toaster richColors position="bottom-right" theme="dark" />
    </PersistQueryClientProvider>
  </StrictMode>,
);
