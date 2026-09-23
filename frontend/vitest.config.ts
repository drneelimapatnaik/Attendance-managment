/**
 * Vitest configuration — reuses the Vite config (aliases) and runs the pure
 * domain/lib tests in a Node environment (no DOM needed).
 */
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }),
);
