/**
 * Vite configuration.
 * - `@/` resolves to `src/` so imports stay short and move-safe.
 * - When VITE_API_URL is set (see .env.example), `/api` is proxied to the
 *   backend in dev; otherwise the app runs on the local demo store.
 * - Vendor code is split into stable chunks for better caching.
 */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: env.VITE_API_URL ? { '/api': { target: env.VITE_API_URL, changeOrigin: true } } : undefined,
    },
    build: {
      target: 'es2020',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            state: ['zustand'],
          },
        },
      },
    },
  };
});
