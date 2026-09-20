import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountInfo } from '@azure/msal-browser';
import type { RouteLocationRaw, Router } from 'vue-router';
import type { AuthInitializationResult } from '@/services/auth';
import type { SessionExpiryReason } from '@/utils/sessionExpiry';
import { recordAuthRedirect } from '@/utils/sessionExpiry';

/** Counters survive `vi.resetModules()`, unlike spies created inside the factory. */
const vueRouterCalls = { createRouter: 0, createWebHistory: 0 };

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>();

  return {
    ...actual,
    createRouter: (...args: Parameters<typeof actual.createRouter>) => {
      vueRouterCalls.createRouter += 1;
      return actual.createRouter(...args);
    },
    createWebHistory: (...args: Parameters<typeof actual.createWebHistory>) => {
      vueRouterCalls.createWebHistory += 1;
      return actual.createWebHistory(...args);
    }
  };
});

/** Captures the handler the router registers with the API layer, without loading real axios/api plumbing. */
const capturedAuthFailureHandler = vi.hoisted(() => ({
  current: null as ((reason: SessionExpiryReason) => void) | null
}));

vi.mock('@/services/api', () => ({
  registerAuthFailureHandler: (handler: ((reason: SessionExpiryReason) => void) | null) => {
    capturedAuthFailureHandler.current = handler;
  }
}));

interface MockAuthService {
  initialize: ReturnType<typeof vi.fn<() => Promise<AuthInitializationResult>>>;
  login: ReturnType<typeof vi.fn<() => Promise<AccountInfo | undefined>>>;
  loginRedirect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  logout: ReturnType<typeof vi.fn<() => Promise<void>>>;
  getAccount: ReturnType<typeof vi.fn<() => AccountInfo | null>>;
  getToken: ReturnType<typeof vi.fn<() => Promise<string>>>;
}

const routeViewMocks = [
  '@/views/DashboardView.vue',
  '@/views/OverallStatsView.vue',
  '@/views/LoginView.vue',
  '@/views/AnalyticsView.vue',
  '@/views/NotFoundView.vue'
] as const;

const authenticatedAccount: AccountInfo = {
  homeAccountId: 'home-account-id',
  localAccountId: 'local-account-id',
  environment: 'login.microsoftonline.com',
  tenantId: 'tenant-id',
  username: 'user@example.com',
  name: 'Authenticated User'
};

const createAuthenticatedAuthService = (): MockAuthService => ({
  initialize: vi.fn(async () => ({ status: 'handled', callbackPresent: false }) as const),
  login: vi.fn(async () => authenticatedAccount),
  loginRedirect: vi.fn(async () => {}),
  logout: vi.fn(async () => {}),
  getAccount: vi.fn(() => authenticatedAccount),
  getToken: vi.fn(async () => 'test-token')
});

const mockRouteViews = () => {
  for (const viewPath of routeViewMocks) {
    vi.doMock(viewPath, () => ({
      default: { name: viewPath.split('/').pop()?.replace('.vue', '') ?? 'RouteViewStub' }
    }));
  }
};

const loadRouterModule = async () => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  vueRouterCalls.createRouter = 0;
  vueRouterCalls.createWebHistory = 0;
  capturedAuthFailureHandler.current = null;

  const authService = createAuthenticatedAuthService();
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
  mockRouteViews();

  const { createPinia, setActivePinia } = await import('pinia');
  setActivePinia(createPinia());

  return import('@/router');
};

const createAuthenticatedRouter = async (): Promise<Router> => {
  const { createAppRouter } = await loadRouterModule();
  return createAppRouter();
};

const navigateAsAuthenticatedUser = async (path: RouteLocationRaw): Promise<string> => {
  const router = await createAuthenticatedRouter();

  await router.push(path);
  await router.isReady();

  return router.currentRoute.value.fullPath;
};

const navigateFromAsAuthenticatedUser = async (
  initialPath: RouteLocationRaw,
  loginPath: RouteLocationRaw
): Promise<string> => {
  const router = await createAuthenticatedRouter();

  await router.push(initialPath);
  await router.isReady();
  await router.push(loginPath);

  return router.currentRoute.value.fullPath;
};

const createAuthenticatedRouterWithStore = async () => {
  const routerModule = await loadRouterModule();
  const { useAuthStore } = await import('@/stores/auth');
  const authStore = useAuthStore();
  const router = routerModule.createAppRouter();
  return { router, authStore };
};

afterEach(() => {
  for (const viewPath of routeViewMocks) {
    vi.doUnmock(viewPath);
  }
  vi.doUnmock('@/services/auth');
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

// Cold resetModules + dynamic imports make these integration suites pay bootstrap cost, not app behavior.
describe('router module lifecycle', { timeout: 15_000 }, () => {
  it('creates no router and reads no launch URL when the module is imported', async () => {
    const routerModule = await loadRouterModule();

    expect(vueRouterCalls.createWebHistory).toBe(0);
    expect(vueRouterCalls.createRouter).toBe(0);
    expect(routerModule).not.toHaveProperty('default');
    expect(typeof routerModule.createAppRouter).toBe('function');
  });

  it('creates an independent router with a fresh history on every call', async () => {
    const { createAppRouter } = await loadRouterModule();

    const first = createAppRouter();
    const second = createAppRouter();

    expect(vueRouterCalls.createWebHistory).toBe(2);
    expect(vueRouterCalls.createRouter).toBe(2);
    expect(first).not.toBe(second);
    expect(first.getRoutes().map((route) => route.name)).toEqual(
      second.getRoutes().map((route) => route.name)
    );
  });
});

describe('router auth guard redirect validation', { timeout: 15_000 }, () => {
  it.each([
    ['protocol-relative', '/login?redirect=//evil.example/path'],
    ['external', '/login?redirect=https%3A%2F%2Fevil.example%2Fpath']
  ])(
    'sends authenticated users with a %s redirect query to the dashboard',
    async (_description, loginPath) => {
      await expect(navigateAsAuthenticatedUser(loginPath)).resolves.toBe('/dashboard');
    }
  );

  it('preserves a valid internal redirect for authenticated users arriving at login', async () => {
    await expect(navigateAsAuthenticatedUser('/login?redirect=/stats')).resolves.toBe('/stats');
  });

  it('falls back to the dashboard for duplicate redirect query values', async () => {
    await expect(
      navigateFromAsAuthenticatedUser('/stats', {
        path: '/login',
        query: { redirect: ['/stats', '/analytics/abc123'] }
      })
    ).resolves.toBe('/dashboard');
  });
});

describe('router auth-failure handling', { timeout: 15_000 }, () => {
  it('registers an auth-failure handler with the API layer when the router is created', async () => {
    await createAuthenticatedRouterWithStore();

    expect(typeof capturedAuthFailureHandler.current).toBe('function');
  });

  it('expires the session and redirects to Login preserving the current route', async () => {
    const { router, authStore } = await createAuthenticatedRouterWithStore();

    await router.push('/stats');
    await router.isReady();

    capturedAuthFailureHandler.current!('interaction-required');
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('Login'));

    expect(authStore.sessionExpired).toBe(true);
    expect(authStore.expiryReason).toBe('interaction-required');
    expect(router.currentRoute.value.query.redirect).toBe('/stats');
  });

  it('does not expire the session or navigate again when already on Login', async () => {
    const { router, authStore } = await createAuthenticatedRouterWithStore();

    await router.push('/stats');
    await router.isReady();
    // Puts the store in an expired state first so the guard permits staying
    // on Login (an authenticated-but-valid session would otherwise bounce
    // straight back to the dashboard).
    authStore.expireSession('unauthorized');

    await router.push('/login');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('Login');

    capturedAuthFailureHandler.current!('interaction-required');
    await router.isReady();

    // The reason from the earlier expiry is preserved - the handler must not
    // re-run expireSession while already on Login.
    expect(authStore.expiryReason).toBe('unauthorized');
    expect(router.currentRoute.value.name).toBe('Login');
  });

  it('marks loop-detected and still lands safely on Login once the redirect fuse is exhausted', async () => {
    const { router, authStore } = await createAuthenticatedRouterWithStore();

    await router.push('/stats');
    await router.isReady();

    // Pre-exhaust the fuse (2 allowed redirects already recorded elsewhere)
    // so this handler invocation is the 3rd within the window.
    recordAuthRedirect();
    recordAuthRedirect();

    capturedAuthFailureHandler.current!('interaction-required');
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('Login'));

    expect(authStore.sessionExpired).toBe(true);
    expect(authStore.expiryReason).toBe('loop-detected');
  });
});

describe('router guard uses hasValidSession', { timeout: 15_000 }, () => {
  it('keeps an authenticated-but-expired user on Login instead of bouncing them to the dashboard', async () => {
    const { router, authStore } = await createAuthenticatedRouterWithStore();

    // Let the app finish its normal bootstrap/initialize() first so the
    // subsequent expireSession() is not overwritten by hydration.
    await router.push('/stats');
    await router.isReady();
    authStore.expireSession('unauthorized');

    await router.push('/login');
    await router.isReady();

    expect(router.currentRoute.value.name).toBe('Login');
  });

  it('redirects an authenticated-but-expired user away from a protected route', async () => {
    const { router, authStore } = await createAuthenticatedRouterWithStore();

    await router.push('/stats');
    await router.isReady();
    authStore.expireSession('unauthorized');

    await router.push('/dashboard');
    await router.isReady();

    expect(router.currentRoute.value.name).toBe('Login');
    expect(router.currentRoute.value.query.redirect).toBe('/dashboard');
  });
});
