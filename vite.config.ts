import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Precaches the app shell so returning visitors open the app instantly
      // from their own device — even while the free-tier host is spun down or
      // they are offline. Data freshness is the query layer's job, not the
      // service worker's: /api/* and cross-origin requests are deliberately
      // never cached here.
      VitePWA({
        registerType: 'autoUpdate',
        // Registration is inlined into the hashed entry chunk so no
        // un-hashed root script needs its own cache policy.
        injectRegister: 'inline',
        workbox: {
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          // Google Fonts: standard cache-first recipe so the offline shell
          // keeps its typography. Everything else non-precached passes
          // through to the network untouched.
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
              handler: 'StaleWhileRevalidate',
              options: {cacheName: 'google-fonts-styles'},
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365},
              },
            },
          ],
        },
        manifest: {
          name: 'Senpai Schedule',
          short_name: 'Senpai',
          description:
            'Track upcoming anime releases, view daily schedules with countdowns, and manage your watchlist.',
          theme_color: '#0b0b0e',
          background_color: '#0b0b0e',
          display: 'standalone',
          icons: [{src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any'}],
        },
      }),
    ],
    build: {
      outDir: 'dist/client',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
