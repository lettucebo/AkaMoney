import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountInfo } from '@azure/msal-browser';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

/**
 * Integration coverage for the Blocking-1 finding: a `getToken()` silent
 * acquisition that resolves *after* a concurrent request's 401 has already
 * expired the session must not let the request interceptor attach a stale
 * Authorization header, invoke axios's adapter, or rewrite `auth_token`.
 *
 * This drives the *real* Axios request pipeline - real request/response
 * interceptors, real `dispatchRequest` - through genuine `ApiService.getUrl()`
 * calls. Only MSAL and the network transport (axios's adapter, replaced by a
 * controlled stand-in below) are mocked; `services/auth.ts` and
 * `services/api.ts` run unmocked, unlike `api.test.ts`, which mocks
 * `services/auth` entirely and so cannot observe this race.
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

interface AdapterCallRecord {
  readonly url: string | undefined;
  readonly authorization: string | undefined;
}

interface AdapterResponder {
  readonly status: number;
  readonly data?: unknown;
}

const { adapterCalls, adapterResponders } = vi.hoisted(() => ({
  adapterCalls: [] as AdapterCallRecord[],
  adapterResponders: [] as AdapterResponder[]
}));

// Real axios (interceptors, `dispatchRequest`, `AxiosHeaders`, error
// construction) is used unmodified; only the network transport - the
// adapter a real build would hand off to XHR/`http` - is replaced by a
// controlled stand-in that records every dispatched request and settles it
// exactly like axios's own adapters do: a real `AxiosError` carrying a
// `response` for non-2xx status, so the real response interceptor runs.
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  const AxiosErrorCtor = actual.default.AxiosError;

  const controlledAdapter = async (config: AxiosRequestConfig): Promise<AxiosResponse> => {
    const headers = config.headers as unknown as Record<string, unknown> | undefined;
    const authorization = typeof headers?.Authorization === 'string' ? (headers.Authorization as string) : undefined;
    adapterCalls.push({ url: config.url, authorization });

    const responder = adapterResponders.shift();
    if (!responder) {
      throw new Error(`Unexpected adapter dispatch for ${config.url ?? '(unknown url)'}`);
    }

    const response = {
      data: responder.data ?? {},
      status: responder.status,
      statusText: responder.status === 200 ? 'OK' : 'Unauthorized',
      headers: {},
      config,
      request: {}
    } as AxiosResponse;

    if (responder.status >= 200 && responder.status < 300) {
      return response;
    }

    throw new AxiosErrorCtor(
      `Request failed with status code ${responder.status}`,
      AxiosErrorCtor.ERR_BAD_REQUEST,
      config as AxiosResponse['config'],
      {},
      response
    );
  };

  return {
    ...actual,
    default: {
      ...actual.default,
      create: (config?: AxiosRequestConfig) => actual.default.create({ ...config, adapter: controlledAdapter })
    }
  };
});

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  adapterCalls.length = 0;
  adapterResponders.length = 0;
  vi.stubEnv('VITE_ENTRA_ID_CLIENT_ID', 'test-client-id');
  vi.stubEnv('VITE_ENTRA_ID_TENANT_ID', 'tenant-id');
  msal.initialize.mockResolvedValue(undefined);
  msal.handleRedirectPromise.mockResolvedValue(null);
  msal.getActiveAccount.mockReturnValue(account);
  msal.getAllAccounts.mockReturnValue([account]);
  msal.clearCache.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ApiService + real auth service: stale silent-acquisition race (real Axios pipeline)', () => {
  it('rejects request A before adapter dispatch when a concurrent request 401s and expires the session mid-flight', async () => {
    // Fresh module instances so `api.ts` registers its interceptors against
    // the controlled-adapter axios instance created above.
    const apiModule = await import('../api');
    const apiService = apiModule.default;
    const { AuthTokenUnavailableError } = apiModule;
    const { getSessionGeneration, readSessionExpiry } = await import('@/utils/sessionExpiry');

    let resolveSilentA!: (value: { accessToken: string }) => void;
    let acquireCallCount = 0;
    msal.acquireTokenSilent.mockImplementation(() => {
      acquireCallCount += 1;
      if (acquireCallCount === 1) {
        // Request A's silent acquisition: deliberately left pending.
        return new Promise((resolve) => {
          resolveSilentA = resolve;
        });
      }
      // Request B's silent acquisition: resolves immediately.
      return Promise.resolve({ accessToken: 'b-token' });
    });

    // Queued for whichever request reaches the controlled adapter first.
    adapterResponders.push({ status: 401, data: { message: 'unauthorized' } });

    const pendingA = apiService.getUrl('url-a');
    // Let request A's interceptor run past getAccount()/ensureMsalInitialized
    // and reach the still-pending acquireTokenSilent call.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(adapterCalls).toHaveLength(0);

    // Request B acquires a token and runs all the way through the real
    // pipeline to the controlled adapter, which returns a real Axios-shaped
    // 401 that the real response interceptor turns into a session expiry -
    // all while request A is still awaiting its own silent acquisition.
    const pendingB = apiService.getUrl('url-b');
    await expect(pendingB).rejects.toThrow();

    expect(adapterCalls).toHaveLength(1);
    expect(adapterCalls[0].url).toContain('url-b');
    expect(readSessionExpiry()).toBe('unauthorized');
    const generationAfterExpiry = getSessionGeneration();

    // Request A's deferred silent acquisition now "wins the race" and
    // resolves with what looks like a valid token, after the session was
    // already expired by request B's real 401 above.
    resolveSilentA({ accessToken: 'late-token' });

    await expect(pendingA).rejects.toBeInstanceOf(AuthTokenUnavailableError);

    // Request A must never have reached the adapter: only request B did.
    expect(adapterCalls).toHaveLength(1);
    expect(adapterCalls[0].url).toContain('url-b');
    expect(localStorage.getItem('auth_token')).toBeNull();
    // The stale completion must not invalidate anything further: the
    // session generation is unchanged since request B's real 401.
    expect(getSessionGeneration()).toBe(generationAfterExpiry);
  });

  it('does not clear the account cache for a stale silent-acquisition failure after the session was already refreshed by a newer login (real Axios pipeline)', async () => {
    const apiModule = await import('../api');
    const apiService = apiModule.default;
    const { clearSessionExpiry, getSessionGeneration, readSessionExpiry } = await import('@/utils/sessionExpiry');

    let rejectSilentA!: (error: unknown) => void;
    msal.acquireTokenSilent.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectSilentA = reject;
        })
    );

    const pendingA = apiService.getUrl('url-a');
    // Let request A's interceptor reach the still-pending acquireTokenSilent
    // call before interleaving the newer, already-successful session.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A newer, already-successful auth clears expiry while request A's
    // silent acquisition is still in flight.
    clearSessionExpiry();
    const generationAfterRefresh = getSessionGeneration();

    rejectSilentA(new MockInteractionRequiredAuthError('interaction_required', 'stale'));

    await expect(pendingA).rejects.toThrow();

    expect(msal.clearCache).not.toHaveBeenCalled();
    expect(readSessionExpiry()).toBeNull();
    expect(getSessionGeneration()).toBe(generationAfterRefresh);
    // The stale failure must never have reached the network layer either.
    expect(adapterCalls).toHaveLength(0);
  });
});
