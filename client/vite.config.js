import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  // Vercel proxies /api to the VPS; ignore obsolete tunnel URLs in its environment.
  define: process.env.VERCEL ? { 'import.meta.env.VITE_API_URL': JSON.stringify('') } : {},
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    pool: 'threads',
    maxWorkers: 1,
    testTimeout: 15000,
  },
  server: {
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true, timeout: 0, proxyTimeout: 0 },
    },
  },
});
