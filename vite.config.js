// vite.config.js — CORE-SENTINEL HMI Build Configuration
// For air-gapped deployment: `npm run build` produces dist/ bundle
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  // P5 convergence: single source of truth for shared code lives in packages/shared.
  // The monolith imports it via @shared (mirrors the real layout) instead of keeping
  // private copies: @shared/src/<module>.js for core modules, @shared/utils.js for utils.
  // NOTE: deep-import specific modules; do NOT use the packages/shared barrel (index.js),
  // which re-exports the MFE-adapted reducer (no direct render()).
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'packages/shared'),
    },
  },
  build: {
    outDir: 'dist',
    minify: 'oxc',
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
    port: Number(process.env.PORT) || 3000,
    strictPort: false,
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
