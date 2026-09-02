import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import type { AccountInfo } from '@azure/msal-browser';
import authService, { type AuthInitializationResult } from '@/services/auth';
import { toSafeErrorContext } from '@/utils/safeError';
import { clearSentryUser, setSentryUser } from '@/utils/sentry';

interface AuthState {
  user: AccountInfo | null;
  isAuthenticated: boolean;
  loading: boolean;
  initialized: boolean;
  initializationResult: AuthInitializationResult | null;
}

/**
 * Used only when initialization throws before the service reports an outcome.
 * Callers must treat an unknown outcome as a failure, never as a clean load.
 */
const UNKNOWN_INITIALIZATION_FAILURE: AuthInitializationResult = markRaw({
  status: 'failed',
  callbackPresent: false
});

/** Constant: an auth error object can carry the callback URL or raw fragment. */
const INITIALIZATION_FAILED_MESSAGE = '[Auth] Initialization failed.';

let initializePromise: Promise<AuthInitializationResult> | null = null;

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    isAuthenticated: false,
    loading: false,
    initialized: false,
    initializationResult: null
  }),

  getters: {
    userName: (state) => state.user?.name || state.user?.username || 'User',
    userEmail: (state) => state.user?.username || ''
  },

  actions: {
    /**
     * Runs redirect-callback handling exactly once per page load and reports
     * the outcome. Every caller - the bootstrap and the router guard - receives
     * the identical result, so the callback decision is made from one fact.
     */
    async initialize(): Promise<AuthInitializationResult> {
      if (this.initialized) {
        return this.initializationResult ?? UNKNOWN_INITIALIZATION_FAILURE;
      }

      if (initializePromise) {
        return initializePromise;
      }

      const promise = (async (): Promise<AuthInitializationResult> => {
        this.loading = true;
        let result: AuthInitializationResult = UNKNOWN_INITIALIZATION_FAILURE;
        try {
          result = markRaw(await authService.initialize());
          const account = authService.getAccount();
          if (account) {
            this.user = account;
            this.isAuthenticated = true;
            await setSentryUser(account.homeAccountId);
          }
        } catch {
          console.error(INITIALIZATION_FAILED_MESSAGE);
        } finally {
          this.loading = false;
          this.initialized = true;
          this.initializationResult = result;
        }

        return result;
      })();
      initializePromise = promise;

      try {
        return await promise;
      } finally {
        if (initializePromise === promise) {
          initializePromise = null;
        }
      }
    },

    async login() {
      this.loading = true;
      try {
        const account = await authService.login();
        if (account) {
          this.user = account;
          this.isAuthenticated = true;
          await setSentryUser(account.homeAccountId);
        }
      } catch (error) {
        console.error('[Auth] Login failed.', toSafeErrorContext(error));
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async loginRedirect() {
      this.loading = true;
      try {
        await authService.loginRedirect();
        // Page will redirect, code after this won't execute
      } catch (error) {
        console.error('[Auth] Login redirect failed.', toSafeErrorContext(error));
        this.loading = false;
        throw error;
      }
    },

    async logout() {
      this.loading = true;
      try {
        await authService.logout();
        this.user = null;
        this.isAuthenticated = false;
        clearSentryUser();
      } catch (error) {
        console.error('[Auth] Logout failed.', toSafeErrorContext(error));
      } finally {
        this.loading = false;
      }
    }
  }
});
