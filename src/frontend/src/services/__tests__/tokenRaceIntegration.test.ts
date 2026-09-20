import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountInfo } from '@azure/msal-browser';

/**
 * Integration coverage for the Blocking-1 finding: a `getToken()` silent
 * acquisition that resolves *after* a concurrent request's 401 has already
 * expired the session must not let the request interceptor attach a stale
 * Authorization header, invoke axios's adapter, or rewrite `auth_token`.
 *
 * This intentionally exercises the *real* `services/auth.ts` and
 * `services/api.ts` together (only MSAL and axios are mocked) - unlike
 * `api.test.ts`, which mocks `services/auth` entirely and so cannot observe
 * this race.
 */

const account: AccountInfo = {
  homeAccountId: 'home-account-id',
  localAccountId: 'local-account-id',
  environment: 'login.microsoftonline.com',
  tenantId: 'tenant-id',
  username: 'user@example.com',
  name: 'Authenticated User'
};

class MockInteractionRequiredAuthError extends Error {
  errorCode: string;
  constructor(errorCode: string, message: string) {
    super(message);
    this.name = 'InteractionRequiredAuthError';
    this.errorCode = errorCode;
  }
}

const msal = {
  initialize: vi.fn(async () => {}),
  handleRedirectPromise: vi.fn(async () => null),
  setActiveAccount: vi.fn(),
  getActiveAccount: vi.fn((): AccountInfo | null => account),
  getAllAccounts: vi.fn((): AccountInfo[] => [account]),
  loginPopup: vi.fn(),
  loginRedirect: vi.fn(),
  acquireTokenSilent: vi.fn(),
  clearCache: vi.fn(async () => {})
};

vi.mock('@azure/msal-browser', () => ({
  PublicClientApplication: class {
    constructor() {
      return msal as unknown as InstanceType<typeof Object>;
    }
  },
  InteractionRequiredAuthError: MockInteractionRequiredAuthError
}));

const { requestHandlers, adapterCalls } = vi.hoisted(() => ({
  requestHandlers: {} as { fulfilled?: (config: any) => any; rejected?: (error: any) => any },
  adapterCalls: { get: 0, post: 0, put: 0, delete: 0 }
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: {
          use: vi.fn((fulfilled, rejected) => {
            requestHandlers.fulfilled = fulfilled;
            requestHandlers.rejected = rejected;
          })
        },
        response: {
          use: vi.fn()
        }
      },
      // Standing in for axios's adapter/network dispatch: a request that is
      // aborted in the request interceptor must never reach these.
      get: vi.fn(async () => {
        adapterCalls.get += 1;
        return { data: {} };
      }),
      post: vi.fn(async () => {
        adapterCalls.post += 1;
        return { data: {} };
      }),
      put: vi.fn(async () => {
        adapterCalls.put += 1;
        return { data: {} };
      }),
      delete: vi.fn(async () => {
        adapterCalls.delete += 1;
        return { data: {} };
      })
    }))
  }
}));

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  adapterCalls.get = 0;
  adapterCalls.post = 0;
  adapterCalls.put = 0;
  adapterCalls.delete = 0;
  vi.stubEnv('VITE_ENTRA_ID_CLIENT_ID', 'test-client-id');
  vi.stubEnv('VITE_ENTRA_ID_TENANT_ID', 'tenant-id');
  msal.initialize.mockResolvedValue(undefined);
  msal.handleRedirectPromise.mockResolvedValue(null);
  msal.getActiveAccount.mockReturnValue(account);
  msal.getAllAccounts.mockReturnValue([account]);
  msal.clearCache.mockResolvedValue(undefined);

  // Loading api.ts (fresh module instance) registers its interceptors
  // against the mocked axios instance created above.
  await import('../api');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('request interceptor + real auth service: stale silent acquisition race', () => {
  it('rejects before the adapter runs and never restores auth_token when a concurrent 401 expires the session mid-flight', async () => {
    const { markSessionExpired } = await import('@/utils/sessionExpiry');

    let resolveSilent!: (value: { accessToken: string }) => void;
    msal.acquireTokenSilent.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSilent = resolve;
        })
    );

    const config: any = { headers: {} };
    const pending = requestHandlers.fulfilled!(config);
    // Let the request interceptor's getToken() clear SDK-readiness and reach
    // the acquireTokenSilent call before interleaving the concurrent 401.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Another request's 401 handler expires the session synchronously while
    // this request's silent acquisition is still awaiting MSAL.
    markSessionExpired('unauthorized');

    // The deferred silent acquisition now "wins the race" and resolves with
    // what looks like a valid token.
    resolveSilent({ accessToken: 'late-token' });

    await expect(pending).rejects.toThrow();
    expect(config.headers.Authorization).toBeUndefined();
    expect(localStorage.getItem('auth_token')).toBeNull();

    // Prove the adapter/network layer was never reached for this request.
    expect(adapterCalls.get).toBe(0);
    expect(adapterCalls.post).toBe(0);
  });

  it('does not clear the account cache for a stale silent-acquisition failure after the session was already refreshed by a newer login', async () => {
    const { clearSessionExpiry, readSessionExpiry } = await import('@/utils/sessionExpiry');

    let rejectSilent!: (error: unknown) => void;
    msal.acquireTokenSilent.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectSilent = reject;
        })
    );

    const config: any = { headers: {} };
    const pending = requestHandlers.fulfilled!(config);
    // Let the request interceptor's getToken() clear SDK-readiness and reach
    // the acquireTokenSilent call before interleaving the newer session.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A newer, already-successful auth clears expiry while this request's
    // silent acquisition is still in flight.
    clearSessionExpiry();
    rejectSilent(new MockInteractionRequiredAuthError('interaction_required', 'stale'));

    await expect(pending).rejects.toThrow();
    expect(msal.clearCache).not.toHaveBeenCalled();
    expect(readSessionExpiry()).toBeNull();
    expect(adapterCalls.get).toBe(0);
  });
});
