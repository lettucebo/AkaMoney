import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../auth';
import authService, { AuthConfigurationError, type AuthInitializationResult } from '@/services/auth';
import { clearSentryUser, setSentryUser } from '@/utils/sentry';

const authResult = (
  status: AuthInitializationResult['status'],
  callbackPresent = false
): AuthInitializationResult => ({ status, callbackPresent });

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
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
  }
}));

vi.mock('@/utils/sentry', () => ({
  setSentryUser: vi.fn(async () => {}),
  clearSentryUser: vi.fn()
}));

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const store = useAuthStore();
      
      expect(store.user).toBeNull();
      expect(store.isAuthenticated).toBe(false);
      expect(store.loading).toBe(false);
      expect(store.initialized).toBe(false);
    });
  });

  describe('getters', () => {
    it('should return userName from user.name', () => {
      const store = useAuthStore();
      store.user = { name: 'John Doe', username: 'john@example.com' } as any;
      
      expect(store.userName).toBe('John Doe');
    });

    it('should return userName from user.username when name is not available', () => {
      const store = useAuthStore();
      store.user = { username: 'john@example.com' } as any;
      
      expect(store.userName).toBe('john@example.com');
    });

    it('should return "User" when no user', () => {
      const store = useAuthStore();
      
      expect(store.userName).toBe('User');
    });

    it('should return userEmail from user.username', () => {
      const store = useAuthStore();
      store.user = { username: 'john@example.com' } as any;
      
      expect(store.userEmail).toBe('john@example.com');
    });

    it('should return empty string when no user email', () => {
      const store = useAuthStore();
      
      expect(store.userEmail).toBe('');
    });
  });

  describe('initialize', () => {
    it('should initialize and set user if account exists', async () => {
      const mockAccount = { homeAccountId: 'home-account-id', name: 'John', username: 'john@example.com' };
      vi.mocked(authService.initialize).mockResolvedValue(authResult('handled', true));
      vi.mocked(authService.getAccount).mockReturnValue(mockAccount as any);
      
      const store = useAuthStore();
      await store.initialize();
      
      expect(authService.initialize).toHaveBeenCalled();
      expect(store.user).toEqual(mockAccount);
      expect(store.isAuthenticated).toBe(true);
      expect(setSentryUser).toHaveBeenCalledWith('home-account-id');
      expect(store.loading).toBe(false);
      expect(store.initialized).toBe(true);
    });

    it('should initialize with no user if no account', async () => {
      vi.mocked(authService.initialize).mockResolvedValue(authResult('none'));
      vi.mocked(authService.getAccount).mockReturnValue(null);
      
      const store = useAuthStore();
      await store.initialize();
      
      expect(store.user).toBeNull();
      expect(store.isAuthenticated).toBe(false);
      expect(store.initialized).toBe(true);
      expect(setSentryUser).not.toHaveBeenCalled();
    });

    it('should handle initialization error', async () => {
      vi.mocked(authService.initialize).mockRejectedValue(new Error('Init failed'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const store = useAuthStore();
      await store.initialize();
      
      expect(store.loading).toBe(false);
      expect(store.user).toBeNull();
      expect(store.initialized).toBe(true);
      expect(setSentryUser).not.toHaveBeenCalled();
    });

    it('should not initialize again if already initialized', async () => {
      vi.mocked(authService.initialize).mockResolvedValue(authResult('none'));
      vi.mocked(authService.getAccount).mockReturnValue(null);
      
      const store = useAuthStore();
      await store.initialize();
      await store.initialize(); // Call again
      
      expect(authService.initialize).toHaveBeenCalledTimes(1);
      expect(setSentryUser).not.toHaveBeenCalled();
    });

    it('returns the discriminated service result and caches the same object for later callers', async () => {
      const serviceResult = authResult('handled', true);
      vi.mocked(authService.initialize).mockResolvedValue(serviceResult);
      vi.mocked(authService.getAccount).mockReturnValue(null);

      const store = useAuthStore();
      const first = await store.initialize();
      const second = await store.initialize();

      expect(first).toEqual({ status: 'handled', callbackPresent: true });
      expect(second).toBe(first);
      expect(store.initializationResult).toBe(first);
      expect(authService.initialize).toHaveBeenCalledTimes(1);
    });

    it('returns a failed result with a constant log when initialization throws', async () => {
      const canary = 'CANARY-authorization-code';
      vi.mocked(authService.initialize).mockRejectedValue(
        new Error(`hash_empty_error /dashboard?code=${canary}`)
      );
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = useAuthStore();
      const result = await store.initialize();

      expect(result).toEqual({ status: 'failed', callbackPresent: false });
      expect(error).toHaveBeenCalledOnce();
      expect(error.mock.calls[0]).toHaveLength(1);
      expect(JSON.stringify(error.mock.calls)).not.toContain(canary);
    });

    it('still returns the service result when Sentry user synchronization rejects', async () => {
      const mockAccount = { homeAccountId: 'home-account-id', name: 'John', username: 'john@example.com' };
      vi.mocked(authService.initialize).mockResolvedValue(authResult('handled', true));
      vi.mocked(authService.getAccount).mockReturnValue(mockAccount as any);
      vi.mocked(setSentryUser).mockRejectedValueOnce(new Error('telemetry offline'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = useAuthStore();
      const result = await store.initialize();

      expect(result).toEqual({ status: 'handled', callbackPresent: true });
      expect(store.initialized).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('should share one in-flight initialization between concurrent callers on the same store', async () => {
      const mockAccount = { homeAccountId: 'home-account-id', name: 'John', username: 'john@example.com' };
      const deferred = createDeferred<AuthInitializationResult>();
      vi.mocked(authService.initialize).mockReturnValue(deferred.promise);
      vi.mocked(authService.getAccount).mockReturnValue(mockAccount as any);

      const store = useAuthStore();
      let firstResult: AuthInitializationResult | null = null;
      let secondResult: AuthInitializationResult | null = null;

      const firstInitialize = store.initialize().then((result) => {
        firstResult = result;
      });
      const secondInitialize = store.initialize().then((result) => {
        secondResult = result;
      });

      await Promise.resolve();

      expect(authService.initialize).toHaveBeenCalledTimes(1);
      expect(firstResult).toBeNull();
      expect(secondResult).toBeNull();
      expect(store.initialized).toBe(false);

      deferred.resolve(authResult('handled', true));
      await Promise.all([firstInitialize, secondInitialize]);

      expect(firstResult).toEqual({ status: 'handled', callbackPresent: true });
      expect(secondResult).toBe(firstResult);
      expect(store.user).toEqual(mockAccount);
      expect(store.isAuthenticated).toBe(true);
      expect(setSentryUser).toHaveBeenCalledTimes(1);
      expect(setSentryUser).toHaveBeenCalledWith('home-account-id');
      expect(store.initialized).toBe(true);
      expect(store.loading).toBe(false);
    });
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const mockAccount = { homeAccountId: 'home-account-id', name: 'John', username: 'john@example.com' };
      vi.mocked(authService.login).mockResolvedValue(mockAccount as any);
      
      const store = useAuthStore();
      await store.login();
      
      expect(authService.login).toHaveBeenCalled();
      expect(store.user).toEqual(mockAccount);
      expect(store.isAuthenticated).toBe(true);
      expect(setSentryUser).toHaveBeenCalledWith('home-account-id');
      expect(store.loading).toBe(false);
    });

    it('should handle login returning no account', async () => {
      vi.mocked(authService.login).mockResolvedValue(undefined);
      
      const store = useAuthStore();
      await store.login();
      
      expect(store.user).toBeNull();
      expect(store.isAuthenticated).toBe(false);
      expect(setSentryUser).not.toHaveBeenCalled();
    });

    it('should handle login error', async () => {
      const error = new Error('Login failed');
      vi.mocked(authService.login).mockRejectedValue(error);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const store = useAuthStore();
      
      await expect(store.login()).rejects.toThrow('Login failed');
      expect(store.loading).toBe(false);
      expect(setSentryUser).not.toHaveBeenCalled();
    });

    it('should handle AuthConfigurationError', async () => {
      const error = new AuthConfigurationError('Entra ID client is not configured');
      vi.mocked(authService.login).mockRejectedValue(error);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const store = useAuthStore();
      
      try {
        await store.login();
        expect.fail('Expected AuthConfigurationError to be thrown');
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(AuthConfigurationError);
        expect((thrownError as AuthConfigurationError).name).toBe('AuthConfigurationError');
        expect((thrownError as AuthConfigurationError).message).toBe('Entra ID client is not configured');
      }
      expect(store.loading).toBe(false);
    });
  });

  describe('loginRedirect', () => {
    it('should call loginRedirect on auth service', async () => {
      vi.mocked(authService.loginRedirect).mockResolvedValue(undefined);
      
      const store = useAuthStore();
      await store.loginRedirect();
      
      expect(authService.loginRedirect).toHaveBeenCalled();
      expect(store.loading).toBe(true); // Loading stays true since redirect happens
    });

    it('should handle loginRedirect error', async () => {
      const error = new Error('Redirect failed');
      vi.mocked(authService.loginRedirect).mockRejectedValue(error);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const store = useAuthStore();
      
      await expect(store.loginRedirect()).rejects.toThrow('Redirect failed');
      expect(store.loading).toBe(false);
    });

    it('should handle AuthConfigurationError on redirect', async () => {
      const error = new AuthConfigurationError('Entra ID client is not configured');
      vi.mocked(authService.loginRedirect).mockRejectedValue(error);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const store = useAuthStore();
      
      try {
        await store.loginRedirect();
        expect.fail('Expected AuthConfigurationError to be thrown');
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(AuthConfigurationError);
        expect((thrownError as AuthConfigurationError).name).toBe('AuthConfigurationError');
        expect((thrownError as AuthConfigurationError).message).toBe('Entra ID client is not configured');
      }
      expect(store.loading).toBe(false);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      vi.mocked(authService.logout).mockResolvedValue(undefined);
      
      const store = useAuthStore();
      store.user = { name: 'John' } as any;
      store.isAuthenticated = true;
      
      await store.logout();
      
      expect(authService.logout).toHaveBeenCalled();
      expect(store.user).toBeNull();
      expect(store.isAuthenticated).toBe(false);
      expect(clearSentryUser).toHaveBeenCalledOnce();
      expect(store.loading).toBe(false);
    });

    it('should handle logout error', async () => {
      vi.mocked(authService.logout).mockRejectedValue(new Error('Logout failed'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const store = useAuthStore();
      store.user = { name: 'John' } as any;
      
      await store.logout();
      
      expect(store.loading).toBe(false);
      expect(clearSentryUser).not.toHaveBeenCalled();
    });
  });

  describe('error logging safety', () => {
    const canary = 'CANARY-authorization-code';
    const rawAuthError = () =>
      Object.assign(new Error(`interaction_required: ${canary}`), {
        name: 'BrowserAuthError',
        claims: canary
      });

    it('logs a login failure without the raw error value', async () => {
      vi.mocked(authService.login).mockRejectedValue(rawAuthError());
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = useAuthStore();
      await expect(store.login()).rejects.toThrow();

      expect(error).toHaveBeenCalledOnce();
      expect(error.mock.calls[0][0]).toBe('[Auth] Login failed.');
      expect(JSON.stringify(error.mock.calls)).not.toContain(canary);
    });

    it('logs a login redirect failure without the raw error value', async () => {
      vi.mocked(authService.loginRedirect).mockRejectedValue(rawAuthError());
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = useAuthStore();
      await expect(store.loginRedirect()).rejects.toThrow();

      expect(error).toHaveBeenCalledOnce();
      expect(error.mock.calls[0][0]).toBe('[Auth] Login redirect failed.');
      expect(JSON.stringify(error.mock.calls)).not.toContain(canary);
    });

    it('logs a logout failure without the raw error value', async () => {
      vi.mocked(authService.logout).mockRejectedValue(rawAuthError());
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = useAuthStore();
      await store.logout();

      expect(error).toHaveBeenCalledOnce();
      expect(error.mock.calls[0][0]).toBe('[Auth] Logout failed.');
      expect(JSON.stringify(error.mock.calls)).not.toContain(canary);
    });
  });
});
