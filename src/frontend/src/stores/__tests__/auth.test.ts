import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../auth';
import authService from '@/services/auth';

// Mock the auth service
vi.mock('@/services/auth', () => ({
  default: {
    initialize: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getAccount: vi.fn()
  }
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
      const mockAccount = { name: 'John', username: 'john@example.com' };
      vi.mocked(authService.initialize).mockResolvedValue(undefined);
      vi.mocked(authService.getAccount).mockReturnValue(mockAccount as any);
      
      const store = useAuthStore();
      await store.initialize();
      
      expect(authService.initialize).toHaveBeenCalled();
      expect(store.user).toEqual(mockAccount);
      expect(store.isAuthenticated).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('should initialize with no user if no account', async () => {
      vi.mocked(authService.initialize).mockResolvedValue(undefined);
      vi.mocked(authService.getAccount).mockReturnValue(null);
      
      const store = useAuthStore();
      await store.initialize();
      
      expect(store.user).toBeNull();
      expect(store.isAuthenticated).toBe(false);
    });

    it('should handle initialization error', async () => {
      vi.mocked(authService.initialize).mockRejectedValue(new Error('Init failed'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const store = useAuthStore();
      await store.initialize();
      
      expect(store.loading).toBe(false);
      expect(store.user).toBeNull();
    });
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const mockAccount = { name: 'John', username: 'john@example.com' };
      vi.mocked(authService.login).mockResolvedValue(mockAccount as any);
      
      const store = useAuthStore();
      await store.login();
      
      expect(authService.login).toHaveBeenCalled();
      expect(store.user).toEqual(mockAccount);
      expect(store.isAuthenticated).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('should handle login returning no account', async () => {
      vi.mocked(authService.login).mockResolvedValue(undefined);
      
      const store = useAuthStore();
      await store.login();
      
      expect(store.user).toBeNull();
      expect(store.isAuthenticated).toBe(false);
    });

    it('should handle login error', async () => {
      const error = new Error('Login failed');
      vi.mocked(authService.login).mockRejectedValue(error);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const store = useAuthStore();
      
      await expect(store.login()).rejects.toThrow('Login failed');
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
      expect(store.loading).toBe(false);
    });

    it('should handle logout error', async () => {
      vi.mocked(authService.logout).mockRejectedValue(new Error('Logout failed'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const store = useAuthStore();
      store.user = { name: 'John' } as any;
      
      await store.logout();
      
      expect(store.loading).toBe(false);
    });
  });
});
