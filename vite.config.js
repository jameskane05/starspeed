import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  base: '/starspeed/',  // GitHub Pages subdirectory
  plugins: [wasm(), topLevelAwait(), basicSsl()],
  optimizeDeps: {
    exclude: ['@sparkjsdev/spark'],
  },
  server: {
    https: true,
    host: true,
  },
});
