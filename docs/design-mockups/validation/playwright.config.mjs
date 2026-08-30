import { defineConfig } from '@playwright/test';

const port = Number(process.env.VALIDATION_PORT ?? 41739);

export default defineConfig({
  testDir: '.',
  testMatch: 'proposals.spec.mjs',
  fullyParallel: false,
  timeout: 90_000,
  expect: {
    timeout: 7_000,
  },
  outputDir: 'test-results',
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node server.mjs --port ${port}`,
    url: `http://127.0.0.1:${port}/validation/fixtures/valid.html`,
    reuseExistingServer: false,
    timeout: 15_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
});
