import { defineConfig } from 'vite';
import { resolve } from 'path';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    federation({
      name: 'mfeTelemetry',
      filename: 'remoteEntry.js',
      exposes: {
        // mount() is the single entry point the shell calls.
        // It subscribes to 'sentinel:render' and drives all safety-critical UI.
        './mount': './src/mount.js',
      },
      shared: {
        '@sentinel/shared': {
          singleton: true,
          requiredVersion: '4.3.0',
          eager: true,
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@sentinel/shared': resolve(__dirname, '../shared/index.js'),
    },
  },
  build: {
    outDir: 'dist',
    minify: false,
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      preserveEntrySignatures: 'strict',
    },
  },
  server: {
    port: 3001,
    cors: true,    // shell (port 3000) must fetch remoteEntry.js cross-origin
  },
  preview: {
    port: 3001,
    cors: true,
  },
});
