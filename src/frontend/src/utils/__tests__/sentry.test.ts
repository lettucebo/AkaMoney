import { afterEach, describe, expect, it, vi } from 'vitest';

const sentryIntegrationCalls = {
  browserTracing: [] as unknown[],
  replay: [] as unknown[],
  consoleLogging: [] as unknown[],
  captureConsole: [] as unknown[]
};

const sentryInit = vi.fn();
const sentrySetUser = vi.fn();

vi.mock('@sentry/vue', () => ({
  init: sentryInit,
  setUser: sentrySetUser,
  browserTracingIntegration: vi.fn((options) => {
    sentryIntegrationCalls.browserTracing.push(options);
    return { name: 'BrowserTracing', options };
  }),
  replayIntegration: vi.fn((options) => {
    sentryIntegrationCalls.replay.push(options);
    return { name: 'Replay', options };
  }),
  consoleLoggingIntegration: vi.fn((options) => {
    sentryIntegrationCalls.consoleLogging.push(options);
    return { name: 'ConsoleLogging', options };
  }),
  captureConsoleIntegration: vi.fn((options) => {
    sentryIntegrationCalls.captureConsole.push(options);
    return { name: 'CaptureConsole', options };
  })
}));

const loadSentry = async () => {
  vi.resetModules();
  return import('../sentry');
};

describe('Sentry frontend utility', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    sentryIntegrationCalls.browserTracing = [];
    sentryIntegrationCalls.replay = [];
    sentryIntegrationCalls.consoleLogging = [];
    sentryIntegrationCalls.captureConsole = [];
  });

  it('does not initialize without a DSN', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const { initSentry } = await loadSentry();

    initSentry({ name: 'app' } as never, { name: 'router' } as never);

    expect(sentryInit).not.toHaveBeenCalled();
    expect(sentryIntegrationCalls.browserTracing).toHaveLength(0);
  });

  it('does not initialize outside a browser window', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.ingest.sentry.io/123');
    vi.stubGlobal('window', undefined);
    const { initSentry } = await loadSentry();

    initSentry({ name: 'app' } as never, { name: 'router' } as never);

    expect(sentryInit).not.toHaveBeenCalled();
  });

  it('initializes once with exact integrations, sample rates, and trace targets', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.ingest.sentry.io/123');
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'staging');
    vi.stubEnv('VITE_API_URL', 'https://api.example.com');
    vi.stubEnv('DEV', false);
    const { initSentry } = await loadSentry();
    const app = { name: 'app' };
    const router = { name: 'router' };

    initSentry(app as never, router as never);
    initSentry(app as never, router as never);

    expect(sentryInit).toHaveBeenCalledOnce();
    expect(sentryIntegrationCalls.browserTracing).toEqual([{ router }]);
    expect(sentryIntegrationCalls.replay).toEqual([undefined]);
    expect(sentryIntegrationCalls.consoleLogging).toEqual([{ levels: ['warn', 'error'] }]);
    expect(sentryIntegrationCalls.captureConsole).toEqual([{ levels: ['error'] }]);
    expect(sentryInit).toHaveBeenCalledWith({
      app,
      dsn: 'https://public@example.ingest.sentry.io/123',
      environment: 'staging',
      sendDefaultPii: true,
      integrations: [
        { name: 'BrowserTracing', options: { router } },
        { name: 'Replay', options: undefined },
        { name: 'ConsoleLogging', options: { levels: ['warn', 'error'] } },
        { name: 'CaptureConsole', options: { levels: ['error'] } }
      ],
      enableLogs: true,
      tracesSampleRate: 0.2,
      tracePropagationTargets: ['localhost', 'https://api.example.com'],
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0
    });
  });

  it('uses dev tracing, mode fallback environment, trims empty API targets, and disables error replay by env flag', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.ingest.sentry.io/123');
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', '');
    vi.stubEnv('VITE_SENTRY_REPLAY_ENABLED', 'false');
    vi.stubEnv('VITE_API_URL', '   ');
    vi.stubEnv('DEV', true);
    vi.stubEnv('MODE', 'test');
    const { initSentry } = await loadSentry();

    initSentry({ name: 'app' } as never, { name: 'router' } as never);

    const options = sentryInit.mock.calls[0][0];
    expect(options.environment).toBe('test');
    expect(options.tracesSampleRate).toBe(1.0);
    expect(options.tracePropagationTargets).toEqual(['localhost']);
    expect(options.replaysOnErrorSampleRate).toBe(0);
  });

  it('does not hash or set a user when Sentry is not initialized without a DSN', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');
    const { initSentry, setSentryUser, clearSentryUser } = await loadSentry();

    initSentry({ name: 'app' } as never, { name: 'router' } as never);
    await setSentryUser('entra-account-id');
    clearSentryUser();

    expect(digest).not.toHaveBeenCalled();
    expect(sentrySetUser).not.toHaveBeenCalled();
  });

  it('resolves and logs a safe warning when hashing a Sentry user fails', async () => {
    const rawUserId = 'raw-entra-account-id';
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.ingest.sentry.io/123');
    vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValueOnce(
      new Error(`digest failed for ${rawUserId}`)
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { initSentry, setSentryUser } = await loadSentry();

    initSentry({ name: 'app' } as never, { name: 'router' } as never);
    await expect(setSentryUser(rawUserId)).resolves.toBeUndefined();

    expect(sentrySetUser).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(rawUserId);
  });

  it('resolves and logs a safe warning when Sentry rejects setting a user', async () => {
    const rawUserId = 'raw-entra-account-id';
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.ingest.sentry.io/123');
    sentrySetUser.mockImplementationOnce(() => {
      throw new Error(`Sentry failed for ${rawUserId}`);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { initSentry, setSentryUser } = await loadSentry();

    initSentry({ name: 'app' } as never, { name: 'router' } as never);
    await expect(setSentryUser(rawUserId)).resolves.toBeUndefined();

    expect(sentrySetUser).toHaveBeenCalledWith({
      id: 'f782b8bc41d015ac1ad32d0a5d3a1f5327bbf0f47a9b71913f947211c60826de'
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(rawUserId);
  });

  it('does not throw or expose identifiers when Sentry rejects clearing a user', async () => {
    const rawUserId = 'raw-entra-account-id';
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.ingest.sentry.io/123');
    sentrySetUser.mockImplementationOnce(() => {
      throw new Error(`Sentry failed for ${rawUserId}`);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { initSentry, clearSentryUser } = await loadSentry();

    initSentry({ name: 'app' } as never, { name: 'router' } as never);

    expect(() => clearSentryUser()).not.toThrow();
    expect(sentrySetUser).toHaveBeenCalledWith(null);
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(rawUserId);
  });

  it('sets only a deterministic SHA-256 user ID and clears it', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.ingest.sentry.io/123');
    const { initSentry, setSentryUser, clearSentryUser } = await loadSentry();

    initSentry({ name: 'app' } as never, { name: 'router' } as never);
    await setSentryUser('entra-account-id');
    clearSentryUser();

    expect(sentrySetUser).toHaveBeenNthCalledWith(1, {
      id: '3f1d4a17e224637d5dcda9c2b87011389a3a784daabd11ae01a33532cb2810fb'
    });
    expect(sentrySetUser.mock.calls[0][0]).not.toMatchObject({
      id: 'entra-account-id',
      email: expect.anything(),
      username: expect.anything()
    });
    expect(sentrySetUser).toHaveBeenNthCalledWith(2, null);
  });
});
