import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts', 
        'src/global.d.ts',
        'src/index.ts', // Main entry point - requires integration testing
        'src/**/__tests__/**' // Exclude test files from coverage
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
