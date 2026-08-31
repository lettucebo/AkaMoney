import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import LoginView from '../LoginView.vue';
import { useAuthStore } from '@/stores/auth';
import authService, { AuthConfigurationError, isAuthSkipped } from '@/services/auth';

const mockAccount = {
  homeAccountId: 'mock-home-account-id',
  localAccountId: 'mock-local-account-id',
  environment: 'development.local',
  tenantId: 'mock-tenant-id',
  username: 'dev@localhost',
  name: 'Development User'
};

// Mock the auth service
vi.mock('@/services/auth', () => ({
  default: {
    initialize: vi.fn(),
    login: vi.fn(),
    loginRedirect: vi.fn(),
    logout: vi.fn(),
    getAccount: vi.fn()
  },
  AuthConfigurationError: class AuthConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AuthConfigurationError';
    }
  },
  isAuthSkipped: vi.fn(() => false)
}));

vi.mock('@/utils/sentry', () => ({
  setSentryUser: vi.fn(async () => {}),
  clearSentryUser: vi.fn()
}));

describe('LoginView', () => {
  let router: ReturnType<typeof createRouter>;
  let pinia: ReturnType<typeof createPinia>;

  const setRoute = async (path: string) => {
    await router.push(path);
    await router.isReady();
  };

  const mountLoginView = () =>
    mount(LoginView, {
      global: {
        plugins: [pinia, router]
      }
    });

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);

    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', redirect: '/dashboard' },
        { path: '/login', name: 'Login', component: LoginView },
        { path: '/dashboard', name: 'Dashboard', component: { template: '<div>Dashboard</div>' } },
        { path: '/stats', name: 'OverallStats', component: { template: '<div>Stats</div>' } },
        {
          path: '/analytics/:shortCode',
          name: 'Analytics',
          component: { template: '<div>Analytics</div>' }
        }
      ]
    });

    vi.mocked(isAuthSkipped).mockReturnValue(false);
    vi.mocked(authService.login).mockResolvedValue(mockAccount);
    vi.mocked(authService.loginRedirect).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('non-skip-auth mount boundary', () => {
    it('does not initialize auth or navigate on normal mount', async () => {
      await setRoute('/login?redirect=/stats');
      const authStore = useAuthStore();
      authStore.isAuthenticated = true;
      authStore.initialized = false;
      const initializeSpy = vi.spyOn(authStore, 'initialize').mockResolvedValue();
      const pushSpy = vi.spyOn(router, 'push');

      mountLoginView();

      await flushPromises();

      expect(initializeSpy).not.toHaveBeenCalled();
      expect(pushSpy).not.toHaveBeenCalled();
    });
  });

  describe('skip-auth auto-login', () => {
    it('logs in and navigates to a valid redirect query target', async () => {
      vi.mocked(isAuthSkipped).mockReturnValue(true);
      await setRoute('/login?redirect=/analytics/abc123');
      const authStore = useAuthStore();
      const loginSpy = vi.spyOn(authStore, 'login');
      const pushSpy = vi.spyOn(router, 'push');

      mountLoginView();

      await flushPromises();

      expect(loginSpy).toHaveBeenCalledOnce();
      expect(pushSpy).toHaveBeenCalledWith('/analytics/abc123');
    });

    it('logs in and navigates to the shared default when redirect targets login', async () => {
      vi.mocked(isAuthSkipped).mockReturnValue(true);
      await setRoute('/login?redirect=/login?next=/dashboard');
      const authStore = useAuthStore();
      const loginSpy = vi.spyOn(authStore, 'login');
      const pushSpy = vi.spyOn(router, 'push');

      mountLoginView();

      await flushPromises();

      expect(loginSpy).toHaveBeenCalledOnce();
      expect(pushSpy).toHaveBeenCalledWith('/dashboard');
    });

    it('logs in and navigates to the default dashboard without a redirect query', async () => {
      vi.mocked(isAuthSkipped).mockReturnValue(true);
      await setRoute('/login');
      const authStore = useAuthStore();
      const loginSpy = vi.spyOn(authStore, 'login');
      const pushSpy = vi.spyOn(router, 'push');

      mountLoginView();

      await flushPromises();

      expect(loginSpy).toHaveBeenCalledOnce();
      expect(pushSpy).toHaveBeenCalledWith('/dashboard');
    });

    it('shows the development configuration error and stays on login when auto-login fails', async () => {
      vi.mocked(isAuthSkipped).mockReturnValue(true);
      await setRoute('/login?redirect=/stats');
      const authStore = useAuthStore();
      const error = new Error('Skip-auth login failed');
      const loginSpy = vi.spyOn(authStore, 'login').mockRejectedValue(error);
      const pushSpy = vi.spyOn(router, 'push');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const wrapper = mountLoginView();

      await flushPromises();

      expect(loginSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Auto-login failed:', error);
      expect(pushSpy).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain(
        '開發環境設定錯誤：略過驗證模式的自動登入失敗，請查看主控台。'
      );
      expect(wrapper.find('button').attributes('disabled')).toBeUndefined();
    });
  });

  describe('handleLogin', () => {
    it('should call loginRedirect when login button is clicked', async () => {
      await setRoute('/login');
      const authStore = useAuthStore();
      authStore.isAuthenticated = false;
      authStore.initialized = true;

      const wrapper = mountLoginView();

      await flushPromises();

      const button = wrapper.find('button');
      await button.trigger('click');

      await flushPromises();

      expect(authService.loginRedirect).toHaveBeenCalled();
    });

    it('should show error message when login fails', async () => {
      await setRoute('/login');
      const authStore = useAuthStore();
      authStore.isAuthenticated = false;
      authStore.initialized = true;

      const error = new Error('Login failed');
      vi.mocked(authService.loginRedirect).mockRejectedValue(error);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const wrapper = mountLoginView();

      await flushPromises();

      const button = wrapper.find('button');
      await button.trigger('click');

      await flushPromises();

      expect(wrapper.text()).toContain('登入失敗，請再試一次。');
    });

    it('should show configuration error message', async () => {
      await setRoute('/login');
      const authStore = useAuthStore();
      authStore.isAuthenticated = false;
      authStore.initialized = true;

      const error = new AuthConfigurationError('Entra ID client is not configured');
      vi.mocked(authService.loginRedirect).mockRejectedValue(error);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const wrapper = mountLoginView();

      await flushPromises();

      const button = wrapper.find('button');
      await button.trigger('click');

      await flushPromises();

      expect(wrapper.text()).toContain('Entra ID client is not configured');
    });
  });
});
