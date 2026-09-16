import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
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
