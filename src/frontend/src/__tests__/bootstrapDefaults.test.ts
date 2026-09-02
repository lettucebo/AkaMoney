import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import type { AuthInitializationResult } from '@/services/auth';
import { bootstrapApp } from '@/bootstrap';

/**
 * Exercises the bootstrap with its real default dependencies - the actual
 * browser, Vue, Pinia, theme, auth-store and router-factory wiring that ships -
 * overriding only the calls that would navigate the test document away.
 */
const CANARY = 'CANARY-authorization-code';

const { authService } = vi.hoisted(() => {
  const hoistedAccount = {
    homeAccountId: 'home-account-id',
    localAccountId: 'local-account-id',
    environment: 'login.microsoftonline.com',
    tenantId: 'tenant-id',
    username: 'user@example.com',
    name: 'Authenticated User'
  };

  return {
    authService: {
      initialize: vi.fn(async () => ({ status: 'none', callbackPresent: false })),
      login: vi.fn(async () => hoistedAccount),
      loginRedirect: vi.fn(async () => {}),
      logout: vi.fn(async () => {}),
      getAccount: vi.fn(() => hoistedAccount),
      getToken: vi.fn(async () => 'test-token')
    }
  };
});

vi.mock('@/services/auth', () => ({
  default: authService,
  AuthConfigurationError: class AuthConfigurationError extends Error {},
  isAuthSkipped: () => false
}));

vi.mock('@/services/api', () => ({
  default: {
    getUrls: vi.fn(async () => ({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, total_pages: 0 }
    }))
  }
}));

for (const view of [
  '@/views/DashboardView.vue',
  '@/views/OverallStatsView.vue',
  '@/views/LoginView.vue',
  '@/views/AnalyticsView.vue',
  '@/views/NotFoundView.vue'
]) {
  vi.doMock(view, () => ({
    default: { name: 'RouteViewStub', template: '<div class="route-view-stub"></div>' }
  }));
}

const appHtml = (): string => document.querySelector('#app')?.innerHTML ?? '';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('bootstrap default wiring on a clean document', () => {
  it('creates the real app and router, starts telemetry and mounts', async () => {
    window.history.replaceState({ position: 3 }, '', '/dashboard');
    const initSentry = vi.fn();
    const setSentryUser = vi.fn(async () => {});

    const result = await bootstrapApp({ initSentry, setSentryUser });
    await flushPromises();

    expect(result).toEqual({ status: 'app-started' });
    expect(authService.initialize).toHaveBeenCalledOnce();
    expect(initSentry).toHaveBeenCalledOnce();
    const [app, router] = initSentry.mock.calls[0];
    expect(typeof (app as { mount?: unknown }).mount).toBe('function');
    expect(typeof (router as { getRoutes?: unknown }).getRoutes).toBe('function');
    expect(setSentryUser).toHaveBeenCalledWith('home-account-id');
    expect(appHtml()).not.toBe('');
    expect(window.location.pathname).toBe('/dashboard');
    expect(document.documentElement.getAttribute('data-theme')).toBeTruthy();
  });
});

describe('bootstrap default wiring in a callback document', () => {
  it('rewrites the real history entry to a sanitized URL and never mounts', async () => {
    const savedState = { position: 9, replaced: false };
    window.history.replaceState(
      savedState,
      '',
      `/dashboard?page=2&code=${CANARY}&state=${CANARY}2`
    );
    const initSentry = vi.fn();
    const reloadDocument = vi.fn();
    const replaceLocation = vi.fn();

    const result = await bootstrapApp({ initSentry, reloadDocument, replaceLocation });
    await flushPromises();

    expect(result).toEqual({ status: 'callback-terminated' });
    expect(window.location.href).toBe(`${window.location.origin}/dashboard?page=2`);
    expect(window.location.href).not.toContain(CANARY);
    expect(window.history.state).toEqual(savedState);
    expect(reloadDocument).toHaveBeenCalledOnce();
    expect(replaceLocation).not.toHaveBeenCalled();
    expect(initSentry).not.toHaveBeenCalled();
    expect(appHtml()).toBe('');
  });

  it('reads the launch URL from the real document before auth clears it', async () => {
    window.history.replaceState({}, '', `/dashboard#code=${CANARY}&client_info=${CANARY}2`);
    authService.initialize.mockImplementationOnce(async () => {
      window.history.replaceState({}, '', '/dashboard#code=');
      return { status: 'handled', callbackPresent: true } as AuthInitializationResult;
    });
    const reloadDocument = vi.fn();

    const result = await bootstrapApp({ reloadDocument, replaceLocation: vi.fn() });

    expect(result).toEqual({ status: 'callback-terminated' });
    expect(window.location.href).toBe(`${window.location.origin}/dashboard`);
    expect(reloadDocument).toHaveBeenCalledOnce();
    expect(appHtml()).toBe('');
  });

  it('sanitizes a slash-prefixed MSAL fragment response from the real history entry', async () => {
    window.history.replaceState(
      { position: 2 },
      '',
      `/dashboard#/code=${CANARY}&client_info=${CANARY}2&state=${CANARY}3`
    );
    const initSentry = vi.fn();
    const reloadDocument = vi.fn();
    const replaceLocation = vi.fn();

    const result = await bootstrapApp({ initSentry, reloadDocument, replaceLocation });
    await flushPromises();

    expect(result).toEqual({ status: 'callback-terminated' });
    expect(window.location.href).toBe(`${window.location.origin}/dashboard`);
    expect(window.location.href).not.toContain(CANARY);
    expect(reloadDocument).toHaveBeenCalledOnce();
    expect(replaceLocation).not.toHaveBeenCalled();
    expect(initSentry).not.toHaveBeenCalled();
    expect(appHtml()).toBe('');
  });

  it('never navigates the real document when the history entry cannot be replaced', async () => {
    const callbackUrl = `/dashboard?code=${CANARY}&state=${CANARY}2`;
    window.history.replaceState({ position: 1 }, '', callbackUrl);
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new Error(`replaceState blocked for ${callbackUrl}`);
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const initSentry = vi.fn();
    const reloadDocument = vi.fn();
    const replaceLocation = vi.fn();

    const result = await bootstrapApp({ initSentry, reloadDocument, replaceLocation });
    await flushPromises();

    expect(result).toEqual({ status: 'callback-terminated' });
    expect(replaceLocation).not.toHaveBeenCalled();
    expect(reloadDocument).not.toHaveBeenCalled();
    expect(initSentry).not.toHaveBeenCalled();
    expect(appHtml()).toBe('');
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]).toHaveLength(1);
    expect(JSON.stringify(error.mock.calls)).not.toContain(CANARY);
  });
});
