// vite.config.js — CORE-SENTINEL HMI Build Configuration
// For air-gapped deployment: `npm run build` produces dist/ bundle
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
    // Chunk splitting for better caching
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 3000,
    open: true,
  },
  preview: {
    port: 3001,
  },
  // ── Vitest configuration ─────────────────────────────────────────────
  // globals:true injects describe/test/expect/beforeEach into every test file
  // so that tests without explicit vitest imports also work.
  // The test file already has explicit imports, but this future-proofs the suite.
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
