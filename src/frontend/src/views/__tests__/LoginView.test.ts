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
    sessionStorage.clear();

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
    sessionStorage.clear();
  });

  describe('non-skip-auth mount boundary', () => {
    it('does not initialize auth or navigate on normal mount', async () => {
      await setRoute('/login?redirect=/stats');
      const authStore = useAuthStore();
      authStore.isAuthenticated = true;
      authStore.initialized = false;
      const initializeSpy = vi
        .spyOn(authStore, 'initialize')
        .mockResolvedValue({ status: 'none', callbackPresent: false });
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
      const canary = 'CANARY-authorization-code';
      const error = Object.assign(new Error(`Skip-auth login failed ${canary}`), {
        name: 'BrowserAuthError'
      });
      const loginSpy = vi.spyOn(authStore, 'login').mockRejectedValue(error);
      const pushSpy = vi.spyOn(router, 'push');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const wrapper = mountLoginView();

      await flushPromises();

      expect(loginSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Auth] Auto-login failed.', {
        name: 'BrowserAuthError'
      });
      expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(canary);
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

      const canary = 'CANARY-authorization-code';
      const error = Object.assign(new Error(`Login failed ${canary}`), {
        name: 'BrowserAuthError'
      });
      vi.mocked(authService.loginRedirect).mockRejectedValue(error);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const wrapper = mountLoginView();

      await flushPromises();

      const button = wrapper.find('button');
      await button.trigger('click');

      await flushPromises();

      expect(wrapper.text()).toContain('登入失敗，請再試一次。');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Auth] Login failed.', {
        name: 'BrowserAuthError'
      });
      expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(canary);
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

  describe('session-expiry messaging', () => {
    it('shows a generic re-login message for an interaction-required expiry', async () => {
      await setRoute('/login');
      const authStore = useAuthStore();
      authStore.isAuthenticated = false;
      authStore.initialized = true;
      authStore.expireSession('interaction-required');

      const wrapper = mountLoginView();
      await flushPromises();

      expect(wrapper.text()).toContain('登入已逾時，請重新登入。');
    });

    it('shows the same generic re-login message for an unauthorized expiry', async () => {
      await setRoute('/login');
      const authStore = useAuthStore();
      authStore.isAuthenticated = false;
      authStore.initialized = true;
      authStore.expireSession('unauthorized');

      const wrapper = mountLoginView();
      await flushPromises();

      expect(wrapper.text()).toContain('登入已逾時，請重新登入。');
    });

    it('shows a distinct message for an initialization failure', async () => {
      await setRoute('/login');
      const authStore = useAuthStore();
      authStore.isAuthenticated = false;
      authStore.initialized = true;
      authStore.expireSession('initialization-failed');

      const wrapper = mountLoginView();
      await flushPromises();

      expect(wrapper.text()).toContain('驗證服務初始化失敗，請重新整理頁面或稍後再試。');
    });

    it('shows a distinct message when a redirect loop was detected', async () => {
      await setRoute('/login');
      const authStore = useAuthStore();
      authStore.isAuthenticated = false;
      authStore.initialized = true;
      authStore.expireSession('loop-detected');

      const wrapper = mountLoginView();
      await flushPromises();

      expect(wrapper.text()).toContain('偵測到重複的登入失敗，請確認網路連線後再試一次。');
    });

    it('shows no expiry banner when the session was never marked expired', async () => {
      await setRoute('/login');
      const authStore = useAuthStore();
      authStore.isAuthenticated = false;
      authStore.initialized = true;

      const wrapper = mountLoginView();
      await flushPromises();

      expect(wrapper.text()).not.toContain('登入已逾時，請重新登入。');
      expect(wrapper.text()).not.toContain('驗證服務初始化失敗，請重新整理頁面或稍後再試。');
      expect(wrapper.text()).not.toContain('偵測到重複的登入失敗，請確認網路連線後再試一次。');
    });

    it('does not show the generic failure message when the store already reports session expiry', async () => {
      await setRoute('/login');
      const authStore = useAuthStore();
      authStore.isAuthenticated = false;
      authStore.initialized = true;
      // Simulates the service having persisted an expiry marker before
      // rejecting (re-synced onto the store by loginRedirect()'s catch).
      authStore.expireSession('interaction-required');

      const error = new Error('redirect could not start');
      vi.mocked(authService.loginRedirect).mockRejectedValue(error);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const wrapper = mountLoginView();
      await flushPromises();

      const button = wrapper.find('button');
      await button.trigger('click');
      await flushPromises();

      expect(wrapper.text()).not.toContain('登入失敗，請再試一次。');
      expect(wrapper.text()).toContain('登入已逾時，請重新登入。');
    });
  });
});
