import { defineConfig } from 'vite';
import { resolve } from 'path';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    federation({
      name: 'mfeConfig',
      filename: 'remoteEntry.js',
      exposes: {
        './mount': './src/mount.js',
      },
      shared: {
        '@sentinel/shared': {
          singleton: true,
          requiredVersion: '4.3.0',
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
    port: 3003,
    cors: true,
  },
  preview: {
    port: 3003,
    cors: true,
  },
});
