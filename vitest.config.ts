import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // scripts/ is included for the pure halves of the scheduled-task scripts
    // (scripts/vibeWork.ts) — the CLIs around them stay untested by design.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
