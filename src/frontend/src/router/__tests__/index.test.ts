import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountInfo } from '@azure/msal-browser';
import type { RouteLocationRaw, Router } from 'vue-router';

interface MockAuthService {
  initialize: ReturnType<typeof vi.fn<() => Promise<void>>>;
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
  initialize: vi.fn(async () => {}),
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

const createAuthenticatedRouter = async (): Promise<Router> => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');

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

  const { default: router } = await import('@/router');
  return router;
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

describe('router auth guard redirect validation', () => {
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
