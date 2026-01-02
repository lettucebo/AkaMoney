import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import LoginView from '../LoginView.vue';
import { useAuthStore } from '@/stores/auth';
import authService, { AuthConfigurationError } from '@/services/auth';

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

describe('LoginView', () => {
  let router: any;
  let pinia: any;

  beforeEach(() => {
    // Create a new pinia instance for each test
    pinia = createPinia();
    setActivePinia(pinia);

    // Create a mock router
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/login', name: 'Login', component: LoginView },
        { path: '/dashboard', name: 'Dashboard', component: { template: '<div>Dashboard</div>' } }
      ]
    });

    vi.clearAllMocks();
  });

  describe('onMounted redirect behavior', () => {
    it('should redirect authenticated users to dashboard on mount', async () => {
      // Setup: User is already authenticated
      const authStore = useAuthStore();
      authStore.isAuthenticated = true;
      authStore.initialized = true;
      
      const pushSpy = vi.spyOn(router, 'push');

      // Mount the component
      mount(LoginView, {
        global: {
          plugins: [pinia, router]
        }
      });

      await flushPromises();

      // Verify redirect was called
      expect(pushSpy).toHaveBeenCalledWith('/dashboard');
    });

    it('should wait for auth initialization before checking authentication', async () => {
      const authStore = useAuthStore();
      authStore.isAuthenticated = false;
      authStore.initialized = false;

      const initializeSpy = vi.spyOn(authStore, 'initialize').mockResolvedValue();
      
      mount(LoginView, {
        global: {
          plugins: [pinia, router]
        }
      });

      await flushPromises();

      // Verify initialize was called
      expect(initializeSpy).toHaveBeenCalled();
    });

    it('should not redirect if user is not authenticated after initialization', async () => {
      const authStore = useAuthStore();
      authStore.isAuthenticated = false;
      authStore.initialized = false;

      vi.spyOn(authStore, 'initialize').mockResolvedValue();
      const pushSpy = vi.spyOn(router, 'push');

      mount(LoginView, {
        global: {
          plugins: [pinia, router]
        }
      });

      await flushPromises();

      // Verify no redirect happened
      expect(pushSpy).not.toHaveBeenCalled();
    });

    it('should redirect to custom path from query parameter', async () => {
      const authStore = useAuthStore();
      authStore.isAuthenticated = true;
      authStore.initialized = true;

      // Set up router with redirect query
      await router.push('/login?redirect=/analytics/abc123');
      
      const pushSpy = vi.spyOn(router, 'push');

      mount(LoginView, {
        global: {
          plugins: [pinia, router]
        }
      });

      await flushPromises();

      // Verify redirect was called with custom path
      expect(pushSpy).toHaveBeenCalledWith('/analytics/abc123');
    });
  });

  describe('redirect validation (open redirect protection)', () => {
    it('should reject absolute URLs with protocol', async () => {
      const authStore = useAuthStore();
      authStore.isAuthenticated = true;
      authStore.initialized = true;

      await router.push('/login?redirect=https://evil.com');
      
      const pushSpy = vi.spyOn(router, 'push');

      mount(LoginView, {
        global: {
          plugins: [pinia, router]
        }
      });

      await flushPromises();

      // Should redirect to default dashboard instead of evil.com
      expect(pushSpy).toHaveBeenCalledWith('/dashboard');
    });

    it('should reject protocol-relative URLs', async () => {
      const authStore = useAuthStore();
      authStore.isAuthenticated = true;
      authStore.initialized = true;

      await router.push('/login?redirect=//evil.com');
      
      const pushSpy = vi.spyOn(router, 'push');

      mount(LoginView, {
        global: {
          plugins: [pinia, router]
        }
      });

      await flushPromises();

      // Should redirect to default dashboard
      expect(pushSpy).toHaveBeenCalledWith('/dashboard');
    });

    it('should accept valid internal paths', async () => {
      const authStore = useAuthStore();
      authStore.isAuthenticated = true;
      authStore.initialized = true;

      await router.push('/login?redirect=/stats');
      
      const pushSpy = vi.spyOn(router, 'push');

      mount(LoginView, {
        global: {
          plugins: [pinia, router]
        }
      });

      await flushPromises();

      // Should redirect to the internal path
      expect(pushSpy).toHaveBeenCalledWith('/stats');
    });

    it('should reject URLs containing protocol scheme', async () => {
      const authStore = useAuthStore();
      authStore.isAuthenticated = true;
      authStore.initialized = true;

      await router.push('/login?redirect=javascript:alert(1)');
      
      const pushSpy = vi.spyOn(router, 'push');

      mount(LoginView, {
        global: {
          plugins: [pinia, router]
        }
      });

      await flushPromises();

      // Should redirect to default dashboard
      expect(pushSpy).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('handleLogin', () => {
    it('should call loginRedirect when login button is clicked', async () => {
      const authStore = useAuthStore();
      authStore.isAuthenticated = false;
      authStore.initialized = true;

      vi.mocked(authService.loginRedirect).mockResolvedValue(undefined);

      const wrapper = mount(LoginView, {
        global: {
          plugins: [pinia, router]
        }
      });

      await flushPromises();

      // Find and click the login button
      const button = wrapper.find('button');
      await button.trigger('click');

      await flushPromises();

      expect(authService.loginRedirect).toHaveBeenCalled();
    });

    it('should show error message when login fails', async () => {
      const authStore = useAuthStore();
      authStore.isAuthenticated = false;
      authStore.initialized = true;

      const error = new Error('Login failed');
      vi.mocked(authService.loginRedirect).mockRejectedValue(error);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const wrapper = mount(LoginView, {
        global: {
          plugins: [pinia, router]
        }
      });

      await flushPromises();

      // Click login button
      const button = wrapper.find('button');
      await button.trigger('click');

      await flushPromises();

      // Check that error message is displayed
      expect(wrapper.text()).toContain('Failed to sign in');
    });

    it('should show configuration error message', async () => {
      const authStore = useAuthStore();
      authStore.isAuthenticated = false;
      authStore.initialized = true;

      const error = new AuthConfigurationError('Entra ID client is not configured');
      vi.mocked(authService.loginRedirect).mockRejectedValue(error);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const wrapper = mount(LoginView, {
        global: {
          plugins: [pinia, router]
        }
      });

      await flushPromises();

      // Click login button
      const button = wrapper.find('button');
      await button.trigger('click');

      await flushPromises();

      // Check that configuration error message is displayed
      expect(wrapper.text()).toContain('Entra ID client is not configured');
    });
  });
});
