import { defineConfig } from 'vite';
import { resolve } from 'path';
import federation from '@originjs/vite-plugin-federation';

// Remote URLs — override via VITE_MFE_* env vars in production deployments
const TELEMETRY_URL = process.env.VITE_MFE_TELEMETRY_URL || 'http://localhost:3001/assets/remoteEntry.js';
const TWIN_URL      = process.env.VITE_MFE_TWIN_URL      || 'http://localhost:3002/assets/remoteEntry.js';
const CONFIG_URL    = process.env.VITE_MFE_CONFIG_URL     || 'http://localhost:3003/assets/remoteEntry.js';

export default defineConfig({
  root: '.',
  plugins: [
    federation({
      name: 'shell',
      remotes: {
        // mfe-telemetry: safety-critical — must be available before app renders
        mfeTelemetry: TELEMETRY_URL,
        // Non-critical: lazy-loaded with error boundaries in main.js
        mfe3dTwin:    TWIN_URL,
        mfeConfig:    CONFIG_URL,
      },
      shared: {
        '@sentinel/shared': {
          singleton: true,
          requiredVersion: '4.3.0',
          eager: true,      // telemetry can't wait for async resolution
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@sentinel/shared': resolve(__dirname, '../shared'),
    },
  },
  build: {
    outDir: 'dist',
    minify: true,
    emptyOutDir: true,
    target: 'esnext',   // required for top-level await in Module Federation
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html') },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
