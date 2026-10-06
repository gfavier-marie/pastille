import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// @pastille/shared est publié en TypeScript : on l'intègre au bundle au lieu de l'externaliser.
const externalizeDeps = { exclude: ['@pastille/shared'] };

export default defineConfig({
  main: {
    build: { externalizeDeps },
  },
  preload: {
    // Preload en CommonJS pour rester compatible avec le bac à sable des fenêtres.
    build: { externalizeDeps, rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          editor: resolve(import.meta.dirname, 'src/renderer/editor.html'),
          poc: resolve(import.meta.dirname, 'src/renderer/poc.html'),
          overlay: resolve(import.meta.dirname, 'src/renderer/overlay.html'),
        },
      },
    },
  },
});
