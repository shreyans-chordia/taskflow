import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * In development the API is reached through Vite's proxy, so the browser sees one origin
 * (localhost:5173) and the session cookies stay first-party with SameSite=Lax.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: process.env.API_URL ?? 'http://localhost:4000', changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
