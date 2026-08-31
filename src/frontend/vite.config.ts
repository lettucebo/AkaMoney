/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

export default defineConfig({
  build: {
    sourcemap: 'hidden'
  },
  plugins: [
    vue(),
    tailwindcss(),
    ...(sentryAuthToken
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG ?? 'money-5c',
            project: process.env.SENTRY_PROJECT ?? 'akamoney-web',
            authToken: sentryAuthToken,
            sourcemaps: {
              filesToDeleteAfterUpload: ['./**/*.map']
            }
          })
        ]
      : [])
  ],
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
        'src/router/**',
        'src/services/api.ts',
        'src/services/auth.ts',
        'src/**/__tests__/**'
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
