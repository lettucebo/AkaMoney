import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import type { App } from 'vue';
import type { Router } from 'vue-router';
import type { AuthInitializationResult } from '@/services/auth';
import { bootstrapApp, type BootstrapDependencies } from '@/bootstrap';

/** Never a real credential: proves callback data never survives a document. */
const CANARY = 'CANARY-authorization-code';
const ORIGIN = 'https://admin.aka.money';
const CLEAN_URL = `${ORIGIN}/dashboard`;
const CALLBACK_URL = `${CLEAN_URL}?code=${CANARY}&client_info=${CANARY}2&state=${CANARY}3`;

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
};

const authResult = (
  status: AuthInitializationResult['status'],
  callbackPresent = false
): AuthInitializationResult => ({ status, callbackPresent });

interface HarnessOptions {
  launchHref?: string;
  historyState?: unknown;
  accountId?: string | null;
  holdSentryUser?: boolean;
}

const createHarness = (options: HarnessOptions = {}) => {
  const ledger: string[] = [];
  const auth = createDeferred<AuthInitializationResult>();
  const sentryUserGate = createDeferred<void>();
  const replaceStateCalls: Array<{ state: unknown; url: string }> = [];
  const historyState = 'historyState' in options ? options.historyState : { position: 7 };
  const accountId = options.accountId === undefined ? 'home-account-id' : options.accountId;

  const router = { name: 'router' } as unknown as Router;
  const app = {
    use: vi.fn((plugin: unknown) => {
      ledger.push(plugin === router ? 'app.use(router)' : 'app.use(other)');
      return app;
    }),
    mount: vi.fn((selector: unknown) => {
      ledger.push(`app.mount(${String(selector)})`);
    })
  } as unknown as App<Element>;

  const deps: BootstrapDependencies = {
    readLaunchHref: vi.fn(() => {
      ledger.push('readLaunchHref');
      return options.launchHref ?? CLEAN_URL;
    }),
    readHistoryState: vi.fn(() => {
      ledger.push('readHistoryState');
      return historyState;
    }),
    replaceHistoryState: vi.fn((state: unknown, url: string) => {
      ledger.push('replaceHistoryState');
      replaceStateCalls.push({ state, url });
    }),
    reloadDocument: vi.fn(() => {
      ledger.push('reloadDocument');
    }),
    replaceLocation: vi.fn(() => {
      ledger.push('replaceLocation');
    }),
    createApp: vi.fn(() => {
      ledger.push('createApp');
      return app;
    }),
    initializeTheme: vi.fn(() => {
      ledger.push('initializeTheme');
    }),
    initializeAuth: vi.fn(() => {
      ledger.push('initializeAuth');
      return auth.promise;
    }),
    readAccountId: vi.fn(() => {
      ledger.push('readAccountId');
      return accountId;
    }),
    createRouter: vi.fn(async () => {
      ledger.push('createRouter');
      return router;
    }),
    initSentry: vi.fn(() => {
      ledger.push('initSentry');
    }),
    setSentryUser: vi.fn(async () => {
      ledger.push('setSentryUser');
      if (options.holdSentryUser) {
        await sentryUserGate.promise;
      }
    })
  };

  return { ledger, deps, app, router, auth, sentryUserGate, replaceStateCalls };
};

const spyOnConsole = () => ({
  error: vi.spyOn(console, 'error').mockImplementation(() => undefined),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => undefined),
  info: vi.spyOn(console, 'info').mockImplementation(() => undefined),
  log: vi.spyOn(console, 'log').mockImplementation(() => undefined),
  debug: vi.spyOn(console, 'debug').mockImplementation(() => undefined)
});

const consoleOutput = (spies: ReturnType<typeof spyOnConsole>): string =>
  JSON.stringify(Object.values(spies).map((spy) => spy.mock.calls));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('bootstrap before authentication completes', () => {
  it('creates no router, starts no telemetry and mounts nothing while auth is pending', async () => {
    const harness = createHarness();

    const run = bootstrapApp(harness.deps);
    await flushPromises();

    expect(harness.ledger).toEqual([
      'readLaunchHref',
      'readHistoryState',
      'createApp',
      'initializeTheme',
      'initializeAuth'
    ]);
    expect(harness.deps.createRouter).not.toHaveBeenCalled();
    expect(harness.deps.initSentry).not.toHaveBeenCalled();
    expect(harness.deps.setSentryUser).not.toHaveBeenCalled();
    expect(harness.app.mount).not.toHaveBeenCalled();

    harness.auth.resolve(authResult('none'));
    await run;
  });

  it('reads the launch URL and history state before any auth work', async () => {
    const harness = createHarness({ launchHref: CALLBACK_URL });

    const run = bootstrapApp(harness.deps);
    await flushPromises();
    harness.auth.resolve(authResult('handled', true));
    await run;

    expect(harness.ledger.indexOf('readLaunchHref')).toBeLessThan(
      harness.ledger.indexOf('initializeAuth')
    );
    expect(harness.ledger.indexOf('readHistoryState')).toBeLessThan(
      harness.ledger.indexOf('initializeAuth')
    );
  });
});

describe('bootstrap in a callback-shaped document', () => {
  const callbackLaunches: Array<[string, string]> = [
    ['query response', `${CLEAN_URL}?code=${CANARY}&state=${CANARY}2`],
    ['fragment response', `${CLEAN_URL}#code=${CANARY}&client_info=${CANARY}2&state=${CANARY}3`],
    ['hash route response', `${CLEAN_URL}#/section?code=${CANARY}&state=${CANARY}2`],
    ['slash-prefixed response', `${CLEAN_URL}#/code=${CANARY}&state=${CANARY}2`],
    [
      'slash-prefixed empty duplicate response',
      `${CLEAN_URL}#/code=&code=&client_info=${CANARY}`
    ],
    ['error response', `${CLEAN_URL}?error=access_denied&error_description=${CANARY}`],
    ['empty duplicate response', `${CLEAN_URL}?code=&code=&state=${CANARY}`]
  ];

  it.each(callbackLaunches)(
    'terminates without router, telemetry or mount for a %s launch',
    async (_form, launchHref) => {
      const harness = createHarness({ launchHref });

      const run = bootstrapApp(harness.deps);
      harness.auth.resolve(authResult('handled', true));
      const result = await run;

      expect(result).toEqual({ status: 'callback-terminated' });
      expect(harness.ledger).toEqual([
        'readLaunchHref',
        'readHistoryState',
        'createApp',
        'initializeTheme',
        'initializeAuth',
        'replaceHistoryState',
        'reloadDocument'
      ]);
      expect(harness.deps.createRouter).not.toHaveBeenCalled();
      expect(harness.deps.initSentry).not.toHaveBeenCalled();
      expect(harness.deps.setSentryUser).not.toHaveBeenCalled();
      expect(harness.app.use).not.toHaveBeenCalled();
      expect(harness.app.mount).not.toHaveBeenCalled();
    }
  );

  it('replaces the callback history entry with the saved state and a sanitized URL', async () => {
    const savedState = { position: 4, current: '/dashboard' };
    const harness = createHarness({
      launchHref: `${ORIGIN}/analytics/abc?page=2&code=${CANARY}&state=${CANARY}2#/tab?client_info=${CANARY}3`,
      historyState: savedState
    });

    const run = bootstrapApp(harness.deps);
    harness.auth.resolve(authResult('handled', true));
    await run;

    expect(harness.replaceStateCalls).toHaveLength(1);
    expect(harness.replaceStateCalls[0].state).toBe(savedState);
    expect(harness.replaceStateCalls[0].url).toBe(`${ORIGIN}/analytics/abc?page=2#/tab`);
    expect(harness.replaceStateCalls[0].url).not.toContain(CANARY);
  });

  it('sanitizes a slash-prefixed MSAL fragment response out of the history entry', async () => {
    const harness = createHarness({
      launchHref: `${CLEAN_URL}#/code=${CANARY}&client_info=${CANARY}2&state=${CANARY}3&session_state=${CANARY}4`
    });

    const run = bootstrapApp(harness.deps);
    harness.auth.resolve(authResult('handled', true));
    await run;

    expect(harness.replaceStateCalls).toHaveLength(1);
    expect(harness.replaceStateCalls[0].url).toBe(CLEAN_URL);
    expect(harness.replaceStateCalls[0].url).not.toContain(CANARY);
  });

  it.each([
    ['slash-prefixed response', `${CLEAN_URL}#/code=${CANARY}&state=${CANARY}2`],
    ['slash-prefixed empty response', `${CLEAN_URL}#/code=`],
    ['slash-prefixed duplicate response', `${CLEAN_URL}#/id_token=${CANARY}&id_token=${CANARY}2`],
    ['slash-prefixed error response', `${CLEAN_URL}#/error=access_denied&error_description=x`]
  ])(
    'terminates on a %s launch even when auth reports no callback',
    async (_form, launchHref) => {
      const harness = createHarness({ launchHref });

      const run = bootstrapApp(harness.deps);
      harness.auth.resolve(authResult('none', false));

      await expect(run).resolves.toEqual({ status: 'callback-terminated' });
      expect(harness.deps.replaceHistoryState).toHaveBeenCalledOnce();
      expect(harness.replaceStateCalls[0].url).toBe(CLEAN_URL);
      expect(harness.deps.reloadDocument).toHaveBeenCalledOnce();
      expect(harness.deps.createRouter).not.toHaveBeenCalled();
      expect(harness.deps.initSentry).not.toHaveBeenCalled();
      expect(harness.app.mount).not.toHaveBeenCalled();
    }
  );

  it('still starts the app for a true hash route that only looks like a response', async () => {
    const harness = createHarness({ launchHref: `${CLEAN_URL}#/analytics/code` });

    const run = bootstrapApp(harness.deps);
    harness.auth.resolve(authResult('none', false));

    await expect(run).resolves.toEqual({ status: 'app-started' });
    expect(harness.deps.replaceHistoryState).not.toHaveBeenCalled();
    expect(harness.deps.reloadDocument).not.toHaveBeenCalled();
    expect(harness.app.mount).toHaveBeenCalledWith('#app');
  });

  it('waits for auth to consume the callback before replacing the entry', async () => {
    const harness = createHarness({ launchHref: CALLBACK_URL });

    const run = bootstrapApp(harness.deps);
    await flushPromises();

    expect(harness.deps.replaceHistoryState).not.toHaveBeenCalled();
    expect(harness.deps.reloadDocument).not.toHaveBeenCalled();

    harness.auth.resolve(authResult('handled', true));
    await run;

    expect(harness.deps.replaceHistoryState).toHaveBeenCalledOnce();
    expect(harness.deps.reloadDocument).toHaveBeenCalledOnce();
  });

  it.each([
    ['failed', authResult('failed', true)],
    ['suspicious none', authResult('none', true)],
    ['none without recorded presence', authResult('none', false)]
  ])('still terminates when auth reports %s', async (_label, result) => {
    const harness = createHarness({ launchHref: CALLBACK_URL });

    const run = bootstrapApp(harness.deps);
    harness.auth.resolve(result);

    await expect(run).resolves.toEqual({ status: 'callback-terminated' });
    expect(harness.deps.replaceHistoryState).toHaveBeenCalledOnce();
    expect(harness.deps.reloadDocument).toHaveBeenCalledOnce();
    expect(harness.deps.initSentry).not.toHaveBeenCalled();
    expect(harness.app.mount).not.toHaveBeenCalled();
  });

  it('terminates when auth reports a callback that the launch snapshot missed', async () => {
    const harness = createHarness({ launchHref: CLEAN_URL });

    const run = bootstrapApp(harness.deps);
    harness.auth.resolve(authResult('handled', true));

    await expect(run).resolves.toEqual({ status: 'callback-terminated' });
    expect(harness.deps.reloadDocument).toHaveBeenCalledOnce();
    expect(harness.deps.initSentry).not.toHaveBeenCalled();
    expect(harness.app.mount).not.toHaveBeenCalled();
  });

  it('never logs callback values while leaving the callback document', async () => {
    const spies = spyOnConsole();
    const harness = createHarness({ launchHref: CALLBACK_URL });

    const run = bootstrapApp(harness.deps);
    harness.auth.resolve(authResult('handled', true));
    await run;

    expect(consoleOutput(spies)).not.toContain(CANARY);
  });
});

describe('bootstrap navigation failure containment', () => {
  it('never navigates from a dirty callback URL when the history entry cannot be replaced', async () => {
    const spies = spyOnConsole();
    const harness = createHarness({ launchHref: CALLBACK_URL });
    vi.mocked(harness.deps.replaceHistoryState).mockImplementation(() => {
      throw new Error(`replaceState blocked for ${CALLBACK_URL}`);
    });

    const run = bootstrapApp(harness.deps);
    harness.auth.resolve(authResult('handled', true));

    await expect(run).resolves.toEqual({ status: 'callback-terminated' });
    expect(harness.deps.reloadDocument).not.toHaveBeenCalled();
    expect(harness.deps.replaceLocation).not.toHaveBeenCalled();
    expect(harness.deps.replaceHistoryState).toHaveBeenCalledOnce();
    expect(harness.ledger).toEqual([
      'readLaunchHref',
      'readHistoryState',
      'createApp',
      'initializeTheme',
      'initializeAuth'
    ]);
    expect(harness.deps.createRouter).not.toHaveBeenCalled();
    expect(harness.deps.initSentry).not.toHaveBeenCalled();
    expect(harness.deps.setSentryUser).not.toHaveBeenCalled();
    expect(harness.app.use).not.toHaveBeenCalled();
    expect(harness.app.mount).not.toHaveBeenCalled();
    expect(spies.error).toHaveBeenCalledOnce();
    expect(spies.error.mock.calls[0]).toHaveLength(1);
    expect(typeof spies.error.mock.calls[0][0]).toBe('string');
    expect(consoleOutput(spies)).not.toContain(CANARY);
    expect(consoleOutput(spies)).not.toContain('code=');
  });

  it.each([
    ['query response', `${CLEAN_URL}?code=${CANARY}&state=${CANARY}2`],
    ['fragment response', `${CLEAN_URL}#code=${CANARY}&state=${CANARY}2`],
    ['slash-prefixed response', `${CLEAN_URL}#/code=${CANARY}&state=${CANARY}2`]
  ])(
    'keeps a %s in place instead of replacing the location when history is refused',
    async (_form, launchHref) => {
      spyOnConsole();
      const harness = createHarness({ launchHref });
      vi.mocked(harness.deps.replaceHistoryState).mockImplementation(() => {
        throw new Error('replaceState blocked');
      });

      const run = bootstrapApp(harness.deps);
      harness.auth.resolve(authResult('handled', true));

      await expect(run).resolves.toEqual({ status: 'callback-terminated' });
      expect(harness.deps.replaceLocation).not.toHaveBeenCalled();
      expect(harness.deps.reloadDocument).not.toHaveBeenCalled();
      expect(harness.app.mount).not.toHaveBeenCalled();
    }
  );

  it('falls back to a location replace of the already-clean URL when reloading throws', async () => {
    const spies = spyOnConsole();
    const harness = createHarness({ launchHref: CALLBACK_URL });
    vi.mocked(harness.deps.reloadDocument).mockImplementation(() => {
      throw new Error(`reload blocked for ${CALLBACK_URL}`);
    });

    const run = bootstrapApp(harness.deps);
    harness.auth.resolve(authResult('failed', true));

    await expect(run).resolves.toEqual({ status: 'callback-terminated' });
    expect(harness.replaceStateCalls).toHaveLength(1);
    expect(harness.replaceStateCalls[0].url).toBe(CLEAN_URL);
    expect(harness.deps.replaceLocation).toHaveBeenCalledOnce();
    expect(harness.deps.replaceLocation).toHaveBeenCalledWith(CLEAN_URL);
    expect(vi.mocked(harness.deps.replaceLocation).mock.calls[0][0]).not.toContain(CANARY);
    expect(harness.ledger.indexOf('replaceHistoryState')).toBeLessThan(
      harness.ledger.indexOf('replaceLocation')
    );
    expect(harness.deps.createRouter).not.toHaveBeenCalled();
    expect(harness.deps.initSentry).not.toHaveBeenCalled();
    expect(harness.app.mount).not.toHaveBeenCalled();
    expect(consoleOutput(spies)).not.toContain(CANARY);
  });

  it('terminates without mounting when the reload fallback also throws', async () => {
    const spies = spyOnConsole();
    const harness = createHarness({ launchHref: CALLBACK_URL });
    vi.mocked(harness.deps.reloadDocument).mockImplementation(() => {
      throw new Error(`reload blocked for ${CALLBACK_URL}`);
    });
    vi.mocked(harness.deps.replaceLocation).mockImplementation(() => {
      throw new Error(`replace blocked for ${CALLBACK_URL}`);
    });

    const run = bootstrapApp(harness.deps);
    harness.auth.resolve(authResult('handled', true));

    await expect(run).resolves.toEqual({ status: 'callback-terminated' });
    expect(harness.deps.createRouter).not.toHaveBeenCalled();
    expect(harness.deps.initSentry).not.toHaveBeenCalled();
    expect(harness.app.use).not.toHaveBeenCalled();
    expect(harness.app.mount).not.toHaveBeenCalled();
    expect(consoleOutput(spies)).not.toContain(CANARY);
  });

  it('logs only constant diagnostics for every callback navigation outcome', async () => {
    const outcomes: Array<(harness: ReturnType<typeof createHarness>) => void> = [
      () => undefined,
      (harness) =>
        vi.mocked(harness.deps.replaceHistoryState).mockImplementation(() => {
          throw new Error(`replaceState blocked for ${CALLBACK_URL}`);
        }),
      (harness) =>
        vi.mocked(harness.deps.reloadDocument).mockImplementation(() => {
          throw new Error(`reload blocked for ${CALLBACK_URL}`);
        }),
      (harness) => {
        vi.mocked(harness.deps.reloadDocument).mockImplementation(() => {
          throw new Error(`reload blocked for ${CALLBACK_URL}`);
        });
        vi.mocked(harness.deps.replaceLocation).mockImplementation(() => {
          throw new Error(`replace blocked for ${CALLBACK_URL}`);
        });
      }
    ];

    for (const applyOutcome of outcomes) {
      const spies = spyOnConsole();
      const harness = createHarness({ launchHref: CALLBACK_URL });
      applyOutcome(harness);

      const run = bootstrapApp(harness.deps);
      harness.auth.resolve(authResult('handled', true));
      await run;

      for (const call of spies.error.mock.calls) {
        expect(call).toHaveLength(1);
        expect(typeof call[0]).toBe('string');
      }
      expect(consoleOutput(spies)).not.toContain(CANARY);
      expect(consoleOutput(spies)).not.toContain(CLEAN_URL);
      vi.restoreAllMocks();
    }
  });
});

describe('bootstrap on a clean document', () => {
  it('runs auth, router creation, Sentry, user sync, router install and mount in order', async () => {
    const harness = createHarness();

    const run = bootstrapApp(harness.deps);
    harness.auth.resolve(authResult('none'));
    const result = await run;

    expect(result).toEqual({ status: 'app-started' });
    expect(harness.ledger).toEqual([
      'readLaunchHref',
      'readHistoryState',
      'createApp',
      'initializeTheme',
      'initializeAuth',
      'createRouter',
      'initSentry',
      'readAccountId',
      'setSentryUser',
      'app.use(router)',
      'app.mount(#app)'
    ]);
    expect(harness.deps.initSentry).toHaveBeenCalledWith(harness.app, harness.router);
    expect(harness.deps.setSentryUser).toHaveBeenCalledWith('home-account-id');
    expect(harness.deps.replaceHistoryState).not.toHaveBeenCalled();
    expect(harness.deps.reloadDocument).not.toHaveBeenCalled();
    expect(harness.deps.replaceLocation).not.toHaveBeenCalled();
  });

  it('treats a state parameter without a response key as a normal application URL', async () => {
    const harness = createHarness({ launchHref: `${CLEAN_URL}?state=saved-view&page=2` });

    const run = bootstrapApp(harness.deps);
    harness.auth.resolve(authResult('none'));

    await expect(run).resolves.toEqual({ status: 'app-started' });
    expect(harness.deps.initSentry).toHaveBeenCalledOnce();
    expect(harness.deps.reloadDocument).not.toHaveBeenCalled();
    expect(harness.app.mount).toHaveBeenCalledWith('#app');
  });

  it('installs the router and mounts only after the hashed user sync resolves', async () => {
    const harness = createHarness({ holdSentryUser: true });

    const run = bootstrapApp(harness.deps);
    harness.auth.resolve(authResult('none'));
    await flushPromises();

    expect(harness.deps.setSentryUser).toHaveBeenCalledOnce();
    expect(harness.app.use).not.toHaveBeenCalled();
    expect(harness.app.mount).not.toHaveBeenCalled();

    harness.sentryUserGate.resolve();
    await run;

    expect(harness.app.use).toHaveBeenCalledWith(harness.router);
    expect(harness.app.mount).toHaveBeenCalledWith('#app');
  });

  it('skips the user sync when no account was restored', async () => {
    const harness = createHarness({ accountId: null });

    const run = bootstrapApp(harness.deps);
    harness.auth.resolve(authResult('none'));

    await expect(run).resolves.toEqual({ status: 'app-started' });
    expect(harness.deps.setSentryUser).not.toHaveBeenCalled();
    expect(harness.app.mount).toHaveBeenCalledWith('#app');
  });
});

describe('bootstrap when auth initialization rejects', () => {
  it('still leaves a callback document with a constant log and no telemetry', async () => {
    const spies = spyOnConsole();
    const harness = createHarness({ launchHref: CALLBACK_URL });
    vi.mocked(harness.deps.initializeAuth).mockRejectedValue(
      new Error(`auth crashed for ?code=${CANARY}`)
    );

    await expect(bootstrapApp(harness.deps)).resolves.toEqual({ status: 'callback-terminated' });

    expect(harness.deps.replaceHistoryState).toHaveBeenCalledOnce();
    expect(harness.deps.reloadDocument).toHaveBeenCalledOnce();
    expect(harness.deps.createRouter).not.toHaveBeenCalled();
    expect(harness.deps.initSentry).not.toHaveBeenCalled();
    expect(harness.app.mount).not.toHaveBeenCalled();
    expect(spies.error).toHaveBeenCalledOnce();
    expect(spies.error.mock.calls[0]).toHaveLength(1);
    expect(consoleOutput(spies)).not.toContain(CANARY);
  });

  it('still starts the app on a clean document', async () => {
    const spies = spyOnConsole();
    const harness = createHarness();
    vi.mocked(harness.deps.initializeAuth).mockRejectedValue(new Error('auth crashed'));

    await expect(bootstrapApp(harness.deps)).resolves.toEqual({ status: 'app-started' });

    expect(harness.deps.initSentry).toHaveBeenCalledOnce();
    expect(harness.app.mount).toHaveBeenCalledWith('#app');
    expect(harness.deps.reloadDocument).not.toHaveBeenCalled();
    expect(spies.error).toHaveBeenCalledOnce();
  });
});

describe('bootstrap telemetry failure containment', () => {
  it('still installs the router and mounts when Sentry initialization throws', async () => {
    const spies = spyOnConsole();
    const harness = createHarness();
    vi.mocked(harness.deps.initSentry).mockImplementation(() => {
      throw new Error('sentry init failed');
    });

    const run = bootstrapApp(harness.deps);
    harness.auth.resolve(authResult('none'));

    await expect(run).resolves.toEqual({ status: 'app-started' });
    expect(harness.app.use).toHaveBeenCalledWith(harness.router);
    expect(harness.app.mount).toHaveBeenCalledWith('#app');
    expect(spies.error).toHaveBeenCalledOnce();
    expect(spies.error.mock.calls[0]).toHaveLength(1);
  });

  it('still mounts when the hashed user sync rejects', async () => {
    const spies = spyOnConsole();
    const harness = createHarness();
    vi.mocked(harness.deps.setSentryUser).mockRejectedValue(new Error('telemetry offline'));

    const run = bootstrapApp(harness.deps);
    harness.auth.resolve(authResult('none'));

    await expect(run).resolves.toEqual({ status: 'app-started' });
    expect(harness.app.mount).toHaveBeenCalledWith('#app');
    expect(spies.error).toHaveBeenCalledOnce();
  });
});
