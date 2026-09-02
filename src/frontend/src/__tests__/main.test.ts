import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const bootstrapApp = vi.fn(async () => ({ status: 'app-started' as const }));

vi.mock('@/bootstrap', () => ({ bootstrapApp }));

const mainSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../main.ts'),
  'utf8'
);

const importMain = async () => {
  vi.resetModules();
  await import('@/main');
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('application entry point', () => {
  it('starts the production bootstrap exactly once with the default dependencies', async () => {
    await importMain();

    expect(bootstrapApp).toHaveBeenCalledOnce();
    expect(bootstrapApp).toHaveBeenCalledWith();
  });

  it('contains a failed bootstrap with a constant log instead of an unhandled rejection', async () => {
    const canary = 'CANARY-authorization-code';
    bootstrapApp.mockRejectedValueOnce(new Error(`bootstrap failed for ?code=${canary}`));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await importMain();
    await Promise.resolve();
    await Promise.resolve();

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]).toHaveLength(1);
    expect(JSON.stringify(error.mock.calls)).not.toContain(canary);
  });

  it('never imports the router or initializes telemetry itself', () => {
    expect(mainSource).not.toMatch(/from\s+['"](\.\/router|@\/router)/);
    expect(mainSource).not.toMatch(/initSentry/);
    expect(mainSource).not.toMatch(/createRouter|createWebHistory|createAppRouter/);
  });
});
