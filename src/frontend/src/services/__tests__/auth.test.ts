import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountInfo, AuthenticationResult } from '@azure/msal-browser';

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
  acquireTokenSilent: vi.fn()
};

vi.mock('@azure/msal-browser', () => ({
  PublicClientApplication: class {
    constructor() {
      return msal as unknown as InstanceType<typeof Object>;
    }
  }
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
  msal.handleRedirectPromise.mockResolvedValue(null);
  msal.getActiveAccount.mockReturnValue(null);
  msal.getAllAccounts.mockReturnValue([]);
  setLaunchUrl('/dashboard');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  localStorage.clear();
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

  it('reports "handled" and stores the access token after a valid redirect response', async () => {
    setLaunchUrl(`/dashboard?code=${CANARY}&client_info=${CANARY}2`);
    localStorage.setItem('akamoney_explicit_logout', 'true');
    msal.handleRedirectPromise.mockResolvedValue(redirectResponse('access-token'));
    const authService = await loadAuthService();

    await expect(authService.initialize()).resolves.toEqual({
      status: 'handled',
      callbackPresent: true
    });
    expect(msal.setActiveAccount).toHaveBeenCalledWith(account);
    expect(localStorage.getItem('auth_token')).toBe('access-token');
    expect(localStorage.getItem('akamoney_explicit_logout')).toBeNull();
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

  it('warns with a constant message when a redirect response has no access token', async () => {
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
    await Promise.resolve();
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
    msal.acquireTokenSilent.mockRejectedValue(rawAuthError());
    const authService = await loadAuthService();

    await expect(authService.getToken()).resolves.toBeNull();

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0][0]).toBe('[Auth] Silent token acquisition failed.');
    expect(JSON.stringify(error.mock.calls)).not.toContain(CANARY);
  });
});
