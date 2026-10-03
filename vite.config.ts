import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    clearMocks: true,
    // Bound jsdom worker memory usage on development machines.
    maxWorkers: 1,
  },
});
