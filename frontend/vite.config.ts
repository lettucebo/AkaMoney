/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true
      }
    }
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts', 
        'src/main.ts', 
        'src/vite-env.d.ts', 
        'src/shims-vue.d.ts',
        'src/router/**', // Router configuration
        'src/services/api.ts', // API service - needs integration testing
        'src/services/auth.ts', // Auth service - needs MSAL mocking
        'src/**/__tests__/**' // Exclude test files
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      }
    },
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts']
  }
});
