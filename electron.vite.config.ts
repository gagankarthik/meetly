import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron/main',
      lib: { entry: 'electron/main/index.ts' },
    },
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron/preload',
      lib: { entry: 'electron/preload/index.ts' },
    },
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'shared'),
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [react()],
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          hub:      path.resolve(__dirname, 'hub.html'),
          overlay:  path.resolve(__dirname, 'overlay.html'),
          auth:     path.resolve(__dirname, 'auth.html'),
          library:  path.resolve(__dirname, 'library.html'),
          settings: path.resolve(__dirname, 'settings.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, 'shared'),
      },
    },
    server: {
      port: 5173,
    },
  },
});
