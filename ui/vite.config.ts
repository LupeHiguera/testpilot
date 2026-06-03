import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The dashboard is a separate app from demo/. It builds to ui/dist (served by the
// live server) and, in dev, proxies API/SSE/artifacts to the live server on :4000.
export default defineConfig({
  plugins: [react()],
  root: 'ui',
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5180,
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/artifacts': 'http://127.0.0.1:4000',
      '/events': { target: 'http://127.0.0.1:4000', changeOrigin: true }
    }
  }
});
