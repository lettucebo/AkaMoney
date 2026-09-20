import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountInfo, AuthenticationResult } from '@azure/msal-browser';
import { clearSessionExpiry, markSessionExpired, readSessionExpiry } from '@/utils/sessionExpiry';

const account: AccountInfo = {
  homeAccountId: 'home-account-id',
  localAccountId: 'local-account-id',
  environment: 'login.microsoftonline.com',
  tenantId: 'tenant-id',
  username: 'user@example.com',
  name: 'Authenticated User'
};

/** Never a real credential: proves callback values never reach a log. */
const CANARY = 'CANARY-authorization-code';

const msal = {
  initialize: vi.fn(async () => {}),
  handleRedirectPromise: vi.fn(async (): Promise<AuthenticationResult | null> => null),
  setActiveAccount: vi.fn(),
  getActiveAccount: vi.fn((): AccountInfo | null => null),
  getAllAccounts: vi.fn((): AccountInfo[] => []),
  loginPopup: vi.fn(),
  loginRedirect: vi.fn(),
  acquireTokenSilent: vi.fn(),
  clearCache: vi.fn(async () => {})
};

class MockInteractionRequiredAuthError extends Error {
  errorCode: string;
  constructor(errorCode: string, message: string) {
    super(message);
    this.name = 'InteractionRequiredAuthError';
    this.errorCode = errorCode;
  }
}

vi.mock('@azure/msal-browser', () => ({
  PublicClientApplication: class {
    constructor() {
      return msal as unknown as InstanceType<typeof Object>;
    }
  },
  InteractionRequiredAuthError: MockInteractionRequiredAuthError
}));

const redirectResponse = (accessToken: string | null): AuthenticationResult =>
  ({ account, accessToken }) as unknown as AuthenticationResult;

const loadAuthService = async (clientId = 'test-client-id') => {
  vi.resetModules();
  vi.stubEnv('VITE_ENTRA_ID_CLIENT_ID', clientId);
  vi.stubEnv('VITE_ENTRA_ID_TENANT_ID', 'tenant-id');
  const module = await import('../auth');
  return module.default;
};

const setLaunchUrl = (path: string) => {
  window.history.replaceState({}, '', path);
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  msal.initialize.mockResolvedValue(undefined);
  msal.handleRedirectPromise.mockResolvedValue(null);
  msal.getActiveAccount.mockReturnValue(null);
  msal.getAllAccounts.mockReturnValue([]);
  msal.clearCache.mockResolvedValue(undefined);
  setLaunchUrl('/dashboard');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('authService.initialize result contract', () => {
  it('reports "none" for a clean launch without a redirect response', async () => {
    const authService = await loadAuthService();

    await expect(authService.initialize()).resolves.toEqual({
      status: 'none',
      callbackPresent: false
    });
    expect(msal.handleRedirectPromise).toHaveBeenCalledOnce();
  });

  it('reports "handled", stores the access token, and clears any prior expiry after a valid redirect response', async () => {
    setLaunchUrl(`/dashboard?code=${CANARY}&client_info=${CANARY}2`);
    localStorage.setItem('akamoney_explicit_logout', 'true');
    markSessionExpired('interaction-required');
    msal.handleRedirectPromise.mockResolvedValue(redirectResponse('access-token'));
    const authService = await loadAuthService();

    await expect(authService.initialize()).resolves.toEqual({
      status: 'handled',
      callbackPresent: true
    });
    expect(msal.setActiveAccount).toHaveBeenCalledWith(account);
    expect(localStorage.getItem('auth_token')).toBe('access-token');
    expect(localStorage.getItem('akamoney_explicit_logout')).toBeNull();
    expect(readSessionExpiry()).toBeNull();
  });

  it('records callback presence before MSAL consumes and clears the URL', async () => {
    setLaunchUrl(`/dashboard#code=${CANARY}&state=${CANARY}2`);
    msal.initialize.mockImplementationOnce(async () => {
      setLaunchUrl('/dashboard');
    });
    msal.handleRedirectPromise.mockResolvedValue(redirectResponse('access-token'));
    const authService = await loadAuthService();

    await expect(authService.initialize()).resolves.toEqual({
      status: 'handled',
      callbackPresent: true
    });
  });

  it('reports "none" when a callback-shaped launch yields no redirect response', async () => {
    setLaunchUrl(`/dashboard?code=${CANARY}`);
    const authService = await loadAuthService();

    await expect(authService.initialize()).resolves.toEqual({
      status: 'none',
      callbackPresent: true
    });
  });

  it('reports "handled" only when the redirect response carries an account', async () => {
    setLaunchUrl(`/dashboard?code=${CANARY}`);
    msal.handleRedirectPromise.mockResolvedValue({ account: null } as unknown as AuthenticationResult);
    const authService = await loadAuthService();

    await expect(authService.initialize()).resolves.toEqual({
      status: 'none',
      callbackPresent: true
    });
    expect(msal.setActiveAccount).not.toHaveBeenCalled();
  });

  it('warns and does not restore a valid session when a redirect response has no access token', async () => {
    setLaunchUrl(`/dashboard?code=${CANARY}`);
    msal.handleRedirectPromise.mockResolvedValue(redirectResponse(null));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const authService = await loadAuthService();

    await expect(authService.initialize()).resolves.toEqual({
      status: 'handled',
      callbackPresent: true
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(CANARY);
    expect(msal.setActiveAccount).not.toHaveBeenCalled();
    expect(authService.getAccount()).toBeNull();
    expect(readSessionExpiry()).toBe('interaction-required');
  });

  it('reports "failed" with a constant log and no callback values when MSAL throws', async () => {
    setLaunchUrl(`/dashboard?code=${CANARY}&state=${CANARY}2`);
    localStorage.setItem('auth_token', 'stale-token');
    msal.handleRedirectPromise.mockRejectedValue(
      new Error(`hash_empty_error: ${CANARY} at /dashboard?code=${CANARY}`)
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const authService = await loadAuthService();

    await expect(authService.initialize()).resolves.toEqual({
      status: 'failed',
      callbackPresent: true
    });
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]).toHaveLength(1);
    expect(JSON.stringify(error.mock.calls)).not.toContain(CANARY);
    expect(JSON.stringify(error.mock.calls)).not.toContain('hash_empty_error');
    expect(readSessionExpiry()).toBe('initialization-failed');
  });

  it('persists initialization-failed so a cached account cannot restore validity on a clean reload after a callback throw', async () => {
    setLaunchUrl(`/dashboard?code=${CANARY}`);
    localStorage.setItem('auth_token', 'stale-token');
    msal.handleRedirectPromise.mockRejectedValue(new Error('hash_empty_error'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const authService = await loadAuthService();

    await authService.initialize();

    // The expiry marker must survive in sessionStorage exactly like a real
    // reload: it is not cleared by loading a fresh module instance below.
    expect(readSessionExpiry()).toBe('initialization-failed');

    // Simulate a clean reload: a new module instance, no callback in the URL
    // this time, but MSAL's local cache still has the previously
    // authenticated account (it was never cleared by the throw).
    setLaunchUrl('/dashboard');
    msal.getActiveAccount.mockReturnValue(null);
    msal.getAllAccounts.mockReturnValue([account]);
    const reloadedAuthService = await loadAuthService();

    expect(reloadedAuthService.getAccount()).toBeNull();
    expect(msal.setActiveAccount).not.toHaveBeenCalled();
  });

  it('separates SDK readiness from callback handling: a readiness failure never calls handleRedirectPromise', async () => {
    setLaunchUrl(`/dashboard?code=${CANARY}`);
    msal.initialize.mockRejectedValueOnce(new Error('sdk-init-failed'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const authService = await loadAuthService();

    await expect(authService.initialize()).resolves.toEqual({
      status: 'failed',
      callbackPresent: true
    });
    expect(msal.handleRedirectPromise).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    expect(readSessionExpiry()).toBe('initialization-failed');
  });

  it('caches the first result and never re-runs redirect handling', async () => {
    setLaunchUrl(`/dashboard?code=${CANARY}`);
    msal.handleRedirectPromise.mockResolvedValue(redirectResponse('access-token'));
    const authService = await loadAuthService();

    const first = await authService.initialize();
    setLaunchUrl('/dashboard');
    const second = await authService.initialize();

    expect(second).toBe(first);
    expect(msal.handleRedirectPromise).toHaveBeenCalledOnce();
    expect(msal.initialize).toHaveBeenCalledOnce();
  });

  it('shares one in-flight initialization between concurrent callers', async () => {
    let release!: () => void;
    msal.handleRedirectPromise.mockImplementation(
      () =>
        new Promise<AuthenticationResult | null>((resolve) => {
          release = () => resolve(null);
        })
    );
    const authService = await loadAuthService();

    const first = authService.initialize();
    const second = authService.initialize();
    // Readiness (ensureMsalInitialized) now resolves through its own awaited
    // IIFE before callback handling runs, adding microtask hops beyond a
    // single tick; a macrotask flush reliably clears all of them.
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(secondResult).toBe(firstResult);
    expect(msal.handleRedirectPromise).toHaveBeenCalledOnce();
  });

  it('reports "none" with recorded presence when the client is not configured', async () => {
    setLaunchUrl(`/dashboard?error=access_denied&error_description=${CANARY}`);
    const authService = await loadAuthService('');

    await expect(authService.initialize()).resolves.toEqual({
      status: 'none',
      callbackPresent: true
    });
    expect(msal.initialize).not.toHaveBeenCalled();
  });
});

describe('authService error logging safety', () => {
  const rawAuthError = () =>
    Object.assign(
      new Error(`interaction_required: ${CANARY} correlation_id=${CANARY}-correlation`),
      { name: 'BrowserAuthError', errorCode: 'interaction_required', claims: CANARY }
    );

  it('logs a login failure without the raw error value', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    msal.loginPopup.mockRejectedValue(rawAuthError());
    const authService = await loadAuthService();

    await expect(authService.login()).rejects.toThrow();

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0][0]).toBe('[Auth] Login failed.');
    expect(JSON.stringify(error.mock.calls)).not.toContain(CANARY);
  });

  it('logs a login redirect failure without the raw error value', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    msal.loginRedirect.mockRejectedValue(rawAuthError());
    const authService = await loadAuthService();

    await expect(authService.loginRedirect()).rejects.toThrow();

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0][0]).toBe('[Auth] Login redirect failed.');
    expect(JSON.stringify(error.mock.calls)).not.toContain(CANARY);
  });

  it('logs a silent token failure without the raw error value', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    msal.getActiveAccount.mockReturnValue(account);
    msal.acquireTokenSilent.mockRejectedValue(
      Object.assign(new Error(`network_error: ${CANARY} correlation_id=${CANARY}-correlation`), {
        name: 'BrowserAuthError',
        errorCode: 'network_error',
        claims: CANARY
      })
    );
    const authService = await loadAuthService();

    await expect(authService.getToken()).resolves.toEqual({ status: 'unavailable' });

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0][0]).toBe('[Auth] Silent token acquisition failed.');
    expect(JSON.stringify(error.mock.calls)).not.toContain(CANARY);
  });
});

describe('authService.getToken discriminated result', () => {
  it('returns no-account without ever attempting acquisition when there is no account', async () => {
    const authService = await loadAuthService();

    await expect(authService.getToken()).resolves.toEqual({ status: 'no-account' });
    expect(msal.acquireTokenSilent).not.toHaveBeenCalled();
  });

  it('returns acquired with the token on success', async () => {
    const authService = await loadAuthService();
    msal.getActiveAccount.mockReturnValue(account);
    msal.acquireTokenSilent.mockResolvedValue({ accessToken: 'fresh-token' });

    await expect(authService.getToken()).resolves.toEqual({ status: 'acquired', token: 'fresh-token' });
  });

  it('returns unavailable when the silent response carries no access token', async () => {
    const authService = await loadAuthService();
    msal.getActiveAccount.mockReturnValue(account);
    msal.acquireTokenSilent.mockResolvedValue({ accessToken: '' });

    await expect(authService.getToken()).resolves.toEqual({ status: 'unavailable' });
  });

  it('returns initialization-failed without attempting acquisition when SDK readiness fails', async () => {
    msal.initialize.mockRejectedValueOnce(new Error('sdk-init-failed'));
    const authService = await loadAuthService();
    msal.getActiveAccount.mockReturnValue(account);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(authService.getToken()).resolves.toEqual({ status: 'initialization-failed' });
    expect(msal.acquireTokenSilent).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an InteractionRequiredAuthError instance',
      () => new MockInteractionRequiredAuthError('interaction_required', `need interaction ${CANARY}`)
    ],
    [
      'an interaction_required error code',
      () => Object.assign(new Error(`x ${CANARY}`), { errorCode: 'interaction_required' })
    ],
    [
      'a login_required error code',
      () => Object.assign(new Error(`x ${CANARY}`), { errorCode: 'login_required' })
    ],
    [
      'a consent_required error code',
      () => Object.assign(new Error(`x ${CANARY}`), { errorCode: 'consent_required' })
    ],
    [
      'a no_account_error error code',
      () => Object.assign(new Error(`x ${CANARY}`), { errorCode: 'no_account_error' })
    ]
  ])(
    'classifies %s as interaction-required, clears auth_token, and clears only the affected account cache without logging the raw error',
    async (_label, buildError) => {
      const authService = await loadAuthService();
      localStorage.setItem('auth_token', 'stale-token');
      msal.getActiveAccount.mockReturnValue(account);
      msal.acquireTokenSilent.mockRejectedValue(buildError());
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(authService.getToken()).resolves.toEqual({ status: 'interaction-required' });

      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(msal.clearCache).toHaveBeenCalledWith({ account });
      expect(readSessionExpiry()).toBe('interaction-required');
      expect(error).not.toHaveBeenCalled();
    }
  );

  it('rejects a stale successful silent acquisition as unavailable instead of restoring it, when the session was invalidated by another request while it was in flight', async () => {
    const authService = await loadAuthService();
    // `loadAuthService()` calls `vi.resetModules()`, so the freshly-loaded
    // `auth.ts` bundles its own fresh `sessionExpiry.ts` instance with its
    // own in-memory generation counter, distinct from this file's
    // top-level, pre-reset import. Re-import it here so the marker call
    // below bumps the *same* generation counter `getToken()` reads.
    const { markSessionExpired: markExpiredInService } = await import('@/utils/sessionExpiry');
    msal.getActiveAccount.mockReturnValue(account);
    let resolveSilent!: (value: { accessToken: string }) => void;
    msal.acquireTokenSilent.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSilent = resolve;
        })
    );

    const pending = authService.getToken();
    // Let getToken() clear SDK-readiness and reach the acquireTokenSilent
    // call before we interleave the concurrent expiry below.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Simulate another request's 401 synchronously expiring the session
    // while this silent acquisition is still awaiting MSAL.
    markExpiredInService('unauthorized');
    resolveSilent({ accessToken: 'late-token' });

    await expect(pending).resolves.toEqual({ status: 'unavailable' });
    expect(readSessionExpiry()).toBe('unauthorized');
  });

  it('does not invalidate a newer, already-successful session when a stale silent acquisition later fails with interaction-required', async () => {
    const authService = await loadAuthService();
    // Same module-instance concern as above: use the `sessionExpiry.ts`
    // instance freshly loaded alongside this `auth.ts` instance.
    const { clearSessionExpiry: clearExpiryInService } = await import('@/utils/sessionExpiry');
    msal.getActiveAccount.mockReturnValue(account);
    let rejectSilent!: (error: unknown) => void;
    msal.acquireTokenSilent.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectSilent = reject;
        })
    );

    const pending = authService.getToken();
    // Let getToken() clear SDK-readiness and reach the acquireTokenSilent
    // call before we interleave the newer, already-successful session below.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Meanwhile a newer, successful auth (e.g. a completed login/callback)
    // clears any prior expiry: the session generation moves on before this
    // call's silent acquisition settles.
    clearExpiryInService();
    rejectSilent(new MockInteractionRequiredAuthError('interaction_required', 'stale'));

    await expect(pending).resolves.toEqual({ status: 'unavailable' });
    expect(msal.clearCache).not.toHaveBeenCalled();
    expect(readSessionExpiry()).toBeNull();
  });
});

describe('authService.getAccount and expiry', () => {
  it('does not repopulate a cached account while an expiry marker exists', async () => {
    const authService = await loadAuthService();
    msal.getActiveAccount.mockReturnValue(null);
    msal.getAllAccounts.mockReturnValue([account]);
    markSessionExpired('interaction-required');

    expect(authService.getAccount()).toBeNull();
    expect(msal.setActiveAccount).not.toHaveBeenCalled();
  });

  it('falls back to the first cached account when no expiry marker exists', async () => {
    const authService = await loadAuthService();
    msal.getActiveAccount.mockReturnValue(null);
    msal.getAllAccounts.mockReturnValue([account]);

    expect(authService.getAccount()).toEqual(account);
    expect(msal.setActiveAccount).toHaveBeenCalledWith(account);
  });
});

describe('authService.login (popup) restores a session only with an access token', () => {
  it('clears any prior expiry and returns the account when a token is present', async () => {
    const authService = await loadAuthService();
    markSessionExpired('interaction-required');
    msal.loginPopup.mockResolvedValue(redirectResponse('popup-token'));

    await expect(authService.login()).resolves.toEqual(account);

    expect(readSessionExpiry()).toBeNull();
    expect(localStorage.getItem('auth_token')).toBe('popup-token');
    expect(msal.setActiveAccount).toHaveBeenCalledWith(account);
  });

  it('does not restore a valid session when the popup response has no access token', async () => {
    const authService = await loadAuthService();
    markSessionExpired('interaction-required');
    msal.loginPopup.mockResolvedValue(redirectResponse(null));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(authService.login()).resolves.toBeUndefined();

    expect(readSessionExpiry()).toBe('interaction-required');
    expect(msal.setActiveAccount).not.toHaveBeenCalled();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('persists an expiry marker and clears the affected account cache even when no marker existed before the tokenless response', async () => {
    const authService = await loadAuthService();
    msal.loginPopup.mockResolvedValue(redirectResponse(null));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(readSessionExpiry()).toBeNull();

    await expect(authService.login()).resolves.toBeUndefined();

    expect(readSessionExpiry()).toBe('interaction-required');
    expect(msal.clearCache).toHaveBeenCalledWith({ account });
    expect(msal.setActiveAccount).not.toHaveBeenCalled();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('prevents a cached account from restoring a valid session after a tokenless popup response and a clean reload', async () => {
    const authService = await loadAuthService();
    msal.loginPopup.mockResolvedValue(redirectResponse(null));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await authService.login();
    expect(readSessionExpiry()).toBe('interaction-required');

    // Simulate a clean reload: a new module instance, no callback in the
    // URL, but MSAL's local cache still holds the previously-seen account
    // (clearCache is best-effort local cleanup, not guaranteed to remove
    // every trace from getAllAccounts()).
    setLaunchUrl('/dashboard');
    msal.getActiveAccount.mockReturnValue(null);
    msal.getAllAccounts.mockReturnValue([account]);
    const reloadedAuthService = await loadAuthService();

    expect(reloadedAuthService.getAccount()).toBeNull();
    expect(reloadedAuthService.isAuthenticated()).toBe(false);
    expect(msal.setActiveAccount).not.toHaveBeenCalled();
  });
});

describe('authService.loginRedirect: readiness retry and expiry safety', () => {
  it('does not touch expiry when loginRedirect merely starts successfully', async () => {
    const authService = await loadAuthService();
    markSessionExpired('interaction-required');
    msal.loginRedirect.mockResolvedValue(undefined);

    await authService.loginRedirect();

    expect(readSessionExpiry()).toBe('interaction-required');
  });

  it('does not clear expiry when loginRedirect fails to start', async () => {
    const authService = await loadAuthService();
    markSessionExpired('interaction-required');
    msal.loginRedirect.mockRejectedValue(new Error('popup_window_error'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(authService.loginRedirect()).rejects.toThrow();

    expect(readSessionExpiry()).toBe('interaction-required');
  });

  it('retries SDK readiness on a later call after an initialization failure, and never reruns callback handling', async () => {
    clearSessionExpiry();
    msal.initialize.mockRejectedValueOnce(new Error('sdk-init-failed'));
    const authService = await loadAuthService();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(authService.loginRedirect()).rejects.toThrow();
    expect(msal.loginRedirect).not.toHaveBeenCalled();
    expect(readSessionExpiry()).toBe('initialization-failed');

    msal.loginRedirect.mockResolvedValue(undefined);
    await expect(authService.loginRedirect()).resolves.toBeUndefined();

    expect(msal.initialize).toHaveBeenCalledTimes(2);
    expect(msal.loginRedirect).toHaveBeenCalledTimes(1);
    expect(msal.handleRedirectPromise).not.toHaveBeenCalled();
  });
});
