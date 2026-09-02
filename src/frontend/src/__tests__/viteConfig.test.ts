import { afterEach, describe, expect, it, vi } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfigFromFile } from 'vite';

/**
 * Hidden source maps must never be produced by an untrusted or manual build.
 *
 * `npm run build` followed by a manual `wrangler pages deploy` publishes the
 * `dist/` directory as-is, so a `.map` file generated outside CI - where no
 * Sentry token exists to upload and delete it - would be served publicly.
 *
 * The real `vite.config.ts` is loaded through Vite's own config loader so the
 * assertions cover the shipped configuration rather than a copy of its logic.
 */
type BuildConfig = { build?: { sourcemap?: boolean | 'inline' | 'hidden' }; plugins?: unknown[] };

const configPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../vite.config.ts');

const loadViteConfig = async (): Promise<BuildConfig> => {
  const loaded = await loadConfigFromFile(
    { command: 'build', mode: 'production' },
    configPath,
    undefined,
    'silent'
  );
  if (!loaded) {
    throw new Error(`Unable to load ${configPath}`);
  }
  return loaded.config as BuildConfig;
};

const clearBuildEnvironment = () => {
  vi.stubEnv('GITHUB_ACTIONS', undefined);
  vi.stubEnv('SENTRY_AUTH_TOKEN', undefined);
};

describe('vite build source maps', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('disables source maps for a local build with no CI and no upload token', async () => {
    clearBuildEnvironment();

    const config = await loadViteConfig();

    expect(config.build?.sourcemap).toBe(false);
  });

  it('emits hidden source maps inside GitHub Actions even without an upload token', async () => {
    clearBuildEnvironment();
    vi.stubEnv('GITHUB_ACTIONS', 'true');

    const config = await loadViteConfig();

    expect(config.build?.sourcemap).toBe('hidden');
  });

  it('emits hidden source maps for a trusted token build outside GitHub Actions', async () => {
    clearBuildEnvironment();
    vi.stubEnv('SENTRY_AUTH_TOKEN', 'test-token');

    const config = await loadViteConfig();

    expect(config.build?.sourcemap).toBe('hidden');
  });

  it('treats blank build environment values as absent', async () => {
    clearBuildEnvironment();
    vi.stubEnv('GITHUB_ACTIONS', '   ');
    vi.stubEnv('SENTRY_AUTH_TOKEN', '');

    const config = await loadViteConfig();

    expect(config.build?.sourcemap).toBe(false);
  });

  it('activates the Sentry upload plugin only when an upload token is present', async () => {
    clearBuildEnvironment();
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    const withoutToken = await loadViteConfig();

    vi.stubEnv('SENTRY_AUTH_TOKEN', 'test-token');
    const withToken = await loadViteConfig();

    expect(withToken.plugins?.length).toBe((withoutToken.plugins?.length ?? 0) + 1);
  });
});
