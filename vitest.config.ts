import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The PWA register module is a Vite virtual module; tests that render
      // the root layout reach it through queries/serverWake.ts.
      'virtual:pwa-register': path.resolve(__dirname, 'src/test/pwaRegister.stub.ts'),
    },
  },
  test: {
    environment: 'node',
    // scripts/ is included for the pure halves of the scheduled-task scripts
    // (scripts/vibeWork.ts) — the CLIs around them stay untested by design.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
