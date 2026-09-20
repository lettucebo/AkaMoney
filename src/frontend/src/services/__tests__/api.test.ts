import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TokenResult } from '../auth';
import { readSessionExpiry } from '@/utils/sessionExpiry';

const { requestHandlers, responseHandlers } = vi.hoisted(() => ({
  requestHandlers: {} as {
    fulfilled?: (config: any) => any;
    rejected?: (error: any) => any;
  },
  responseHandlers: {} as {
    fulfilled?: (response: any) => any;
    rejected?: (error: any) => any;
  }
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
          use: vi.fn((fulfilled, rejected) => {
            responseHandlers.fulfilled = fulfilled;
            responseHandlers.rejected = rejected;
          })
        }
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn()
    }))
  }
}));

vi.mock('@/services/auth', () => ({
  default: {
    getToken: vi.fn()
  },
  isAuthSkipped: vi.fn(() => false)
}));

const acquired = (token: string): TokenResult => ({ status: 'acquired', token });

// Imported after the mocks above so the singleton `ApiService` picks them up
// when it registers its interceptors.
import authService from '@/services/auth';
import apiModule, { registerAuthFailureHandler, AuthTokenUnavailableError } from '../api';

describe('api interceptors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    registerAuthFailureHandler(null);
  });

  describe('request interceptor', () => {
    it('attaches the Authorization header and syncs localStorage when a token is acquired', async () => {
      vi.mocked(authService.getToken).mockResolvedValue(acquired('fresh-token'));

      const config: any = { headers: {} };
      const result = await requestHandlers.fulfilled!(config);

      expect(result.headers.Authorization).toBe('Bearer fresh-token');
      expect(localStorage.getItem('auth_token')).toBe('fresh-token');
    });

    it('rejects before the adapter runs and never falls back to a cached token', async () => {
      localStorage.setItem('auth_token', 'stale-cached-token');
      vi.mocked(authService.getToken).mockResolvedValue({ status: 'no-account' });

      const config: any = { headers: {} };

      await expect(requestHandlers.fulfilled!(config)).rejects.toBeInstanceOf(AuthTokenUnavailableError);
      expect(config.headers.Authorization).toBeUndefined();
    });

    it('does not trigger auth-failure handling for a transient/unavailable failure', async () => {
      vi.mocked(authService.getToken).mockResolvedValue({ status: 'unavailable' });
      const handler = vi.fn();
      registerAuthFailureHandler(handler);

      await expect(requestHandlers.fulfilled!({ headers: {} })).rejects.toBeInstanceOf(AuthTokenUnavailableError);

      expect(handler).not.toHaveBeenCalled();
      expect(readSessionExpiry()).toBeNull();
    });

    it('triggers auth-failure handling with interaction-required', async () => {
      vi.mocked(authService.getToken).mockResolvedValue({ status: 'interaction-required' });
      const handler = vi.fn();
      registerAuthFailureHandler(handler);

      await expect(requestHandlers.fulfilled!({ headers: {} })).rejects.toBeInstanceOf(AuthTokenUnavailableError);

      expect(handler).toHaveBeenCalledWith('interaction-required');
    });

    it('maps a no-account result to the unauthorized reason', async () => {
      vi.mocked(authService.getToken).mockResolvedValue({ status: 'no-account' });
      const handler = vi.fn();
      registerAuthFailureHandler(handler);

      await expect(requestHandlers.fulfilled!({ headers: {} })).rejects.toBeInstanceOf(AuthTokenUnavailableError);

      expect(handler).toHaveBeenCalledWith('unauthorized');
    });

    it('triggers auth-failure handling with initialization-failed', async () => {
      vi.mocked(authService.getToken).mockResolvedValue({ status: 'initialization-failed' });
      const handler = vi.fn();
      registerAuthFailureHandler(handler);

      await expect(requestHandlers.fulfilled!({ headers: {} })).rejects.toBeInstanceOf(AuthTokenUnavailableError);

      expect(handler).toHaveBeenCalledWith('initialization-failed');
    });

    it('coalesces concurrent auth failures into a single handler call', async () => {
      vi.mocked(authService.getToken).mockResolvedValue({ status: 'interaction-required' });
      const handler = vi.fn();
      registerAuthFailureHandler(handler);

      await Promise.all([
        requestHandlers.fulfilled!({ headers: {} }).catch(() => undefined),
        requestHandlers.fulfilled!({ headers: {} }).catch(() => undefined)
      ]);

      expect(handler).toHaveBeenCalledTimes(1);

      // Allow the in-flight flag to reset before the next distinct failure.
      await Promise.resolve();
      await Promise.resolve();

      await requestHandlers.fulfilled!({ headers: {} }).catch(() => undefined);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('only persists expiry (no navigation) when no handler is registered yet', async () => {
      vi.mocked(authService.getToken).mockResolvedValue({ status: 'interaction-required' });

      await requestHandlers.fulfilled!({ headers: {} }).catch(() => undefined);

      expect(readSessionExpiry()).toBe('interaction-required');
      expect(sessionStorage.getItem('redirect_after_login')).toBeNull();
    });
  });

  describe('response interceptor', () => {
    it('removes auth_token and triggers unauthorized handling on a 401 matching the current token', async () => {
      localStorage.setItem('auth_token', 'current-token');
      const handler = vi.fn();
      registerAuthFailureHandler(handler);
      const error = {
        response: { status: 401 },
        config: { headers: { Authorization: 'Bearer current-token' } }
      };

      await expect(responseHandlers.rejected!(error)).rejects.toBe(error);

      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(handler).toHaveBeenCalledWith('unauthorized');
      expect(sessionStorage.getItem('redirect_after_login')).toBeNull();
    });

    it('rejects normally without invalidating the session on a stale 401 for an old token', async () => {
      localStorage.setItem('auth_token', 'new-token');
      const handler = vi.fn();
      registerAuthFailureHandler(handler);
      const error = {
        response: { status: 401 },
        config: { headers: { Authorization: 'Bearer old-token' } }
      };

      await expect(responseHandlers.rejected!(error)).rejects.toBe(error);

      expect(localStorage.getItem('auth_token')).toBe('new-token');
      expect(handler).not.toHaveBeenCalled();
    });

    it('passes through non-401 errors unchanged', async () => {
      localStorage.setItem('auth_token', 'current-token');
      const handler = vi.fn();
      registerAuthFailureHandler(handler);
      const error = { response: { status: 500 }, config: { headers: {} } };

      await expect(responseHandlers.rejected!(error)).rejects.toBe(error);

      expect(localStorage.getItem('auth_token')).toBe('current-token');
      expect(handler).not.toHaveBeenCalled();
    });

    it('passes successful responses through unchanged', () => {
      const response = { data: { ok: true } };
      expect(responseHandlers.fulfilled!(response)).toBe(response);
    });
  });
});

// Referenced to keep the default export import used (avoids an unused-import
// lint/type error) and to document that the module still exposes the
// service singleton for the rest of the application.
void apiModule;
