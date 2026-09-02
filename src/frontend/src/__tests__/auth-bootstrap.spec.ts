import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import type { AccountInfo } from '@azure/msal-browser';
import type { App as VueApp } from 'vue';
import { START_LOCATION } from 'vue-router';
import type { Router } from 'vue-router';
import type { AuthInitializationResult } from '@/services/auth';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
}

interface MockAuthService {
  initialize: ReturnType<typeof vi.fn<() => Promise<AuthInitializationResult>>>;
  login: ReturnType<typeof vi.fn<() => Promise<AccountInfo | undefined>>>;
  loginRedirect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  logout: ReturnType<typeof vi.fn<() => Promise<void>>>;
  getAccount: ReturnType<typeof vi.fn<() => AccountInfo | null>>;
  getToken: ReturnType<typeof vi.fn<() => Promise<string>>>;
}

interface BootstrapScenario {
  app: VueApp<Element>;
  authInitialization: Deferred<void>;
  router: Router;
}

const mountedApps: VueApp<Element>[] = [];
const pendingAuthInitializations: Deferred<void>[] = [];

const account: AccountInfo = {
  homeAccountId: 'home-account-id',
  localAccountId: 'local-account-id',
  environment: 'login.microsoftonline.com',
  tenantId: 'tenant-id',
  username: 'user@example.com',
  name: 'Authenticated User'
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
};

const createAuthServiceMock = (authInitialization: Deferred<void>): MockAuthService => {
  let initialized = false;

  return {
    initialize: vi.fn(async (): Promise<AuthInitializationResult> => {
      await authInitialization.promise;
      initialized = true;
      return { status: 'none', callbackPresent: false };
    }),
    login: vi.fn(async () => account),
    loginRedirect: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    getAccount: vi.fn(() => (initialized ? account : null)),
    getToken: vi.fn(async () => 'test-token')
  };
};

const letRouterGuardRunWhileAuthIsPending = async () => {
  await Promise.resolve();
  await flushPromises();
  await Promise.resolve();
};

const finishAuthAndSettleRouter = async (authInitialization: Deferred<void>, router: Router) => {
  authInitialization.resolve();
  await router.isReady();
  await flushPromises();
  await Promise.resolve();
};

const bootstrapRealAppAt = async (path: string): Promise<BootstrapScenario> => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState({}, '', path);

  const authInitialization = createDeferred<void>();
  pendingAuthInitializations.push(authInitialization);
  const authService = createAuthServiceMock(authInitialization);

  vi.doMock('@/services/auth', () => ({
    default: authService,
    AuthConfigurationError: class AuthConfigurationError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'AuthConfigurationError';
      }
    },
    isAuthSkipped: () => false
  }));
  vi.doMock('@/services/api', () => ({
    default: {
      getUrls: vi.fn(async () => ({
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          total_pages: 0
        }
      }))
    }
  }));

  const [{ createApp }, { createPinia }, { default: App }, { createAppRouter }] = await Promise.all([
    import('vue'),
    import('pinia'),
    import('@/App.vue'),
    import('@/router')
  ]);

  const app = createApp(App);
  const pinia = createPinia();
  const router = createAppRouter();

  app.use(pinia);
  app.use(router);
  app.mount('#app');
  mountedApps.push(app);

  return { app, authInitialization, router };
};

afterEach(async () => {
  for (const authInitialization of pendingAuthInitializations.splice(0)) {
    authInitialization.resolve();
  }
  await flushPromises();
  for (const app of mountedApps.splice(0)) {
    app.unmount();
  }
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  vi.doUnmock('@/services/auth');
  vi.doUnmock('@/services/api');
  vi.resetModules();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('auth bootstrap routing', () => {
  it('redirects an authenticated bootstrap from /login to /dashboard after auth initialization resolves', async () => {
    const { authInitialization, router } = await bootstrapRealAppAt('/login');

    await letRouterGuardRunWhileAuthIsPending();
    await finishAuthAndSettleRouter(authInitialization, router);

    expect(router.currentRoute.value.fullPath).toBe('/dashboard');
  });

  it('keeps an authenticated bootstrap on /dashboard instead of bouncing to /login', async () => {
    const { authInitialization, router } = await bootstrapRealAppAt('/dashboard');

    await letRouterGuardRunWhileAuthIsPending();
    await finishAuthAndSettleRouter(authInitialization, router);

    expect(router.currentRoute.value.fullPath).toBe('/dashboard');
  });

  it('does not commit a protected-route redirect while auth initialization is still pending', async () => {
    const { router } = await bootstrapRealAppAt('/dashboard');

    await letRouterGuardRunWhileAuthIsPending();

    expect(router.currentRoute.value).toBe(START_LOCATION);
    expect(router.currentRoute.value.path).not.toBe('/login');
    expect(router.currentRoute.value.query.redirect).not.toBe('/dashboard');
  });
});
