import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import basicSsl from '@vitejs/plugin-basic-ssl';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  base: '/starspeed/',
  plugins: [wasm(), topLevelAwait(), ...(isDev ? [basicSsl()] : [])],
  optimizeDeps: {
    exclude: ['@sparkjsdev/spark'],
  },
  server: {
    https: true,
    host: true,
  },
});
