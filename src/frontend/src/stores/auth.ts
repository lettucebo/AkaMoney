import { defineStore } from 'pinia';
import type { AccountInfo } from '@azure/msal-browser';
import authService from '@/services/auth';
import { clearSentryUser, setSentryUser } from '@/utils/sentry';

interface AuthState {
  user: AccountInfo | null;
  isAuthenticated: boolean;
  loading: boolean;
  initialized: boolean;
}

let initializePromise: Promise<void> | null = null;

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    isAuthenticated: false,
    loading: false,
    initialized: false
  }),

  getters: {
    userName: (state) => state.user?.name || state.user?.username || 'User',
    userEmail: (state) => state.user?.username || ''
  },

  actions: {
    async initialize() {
      if (this.initialized) {
        return;
      }

      if (initializePromise) {
        await initializePromise;
        return;
      }

      const promise = (async () => {
        this.loading = true;
        try {
          await authService.initialize();
          const account = authService.getAccount();
          if (account) {
            this.user = account;
            this.isAuthenticated = true;
            await setSentryUser(account.homeAccountId);
          }
        } catch (error) {
          console.error('Auth initialization error:', error);
        } finally {
          this.loading = false;
          this.initialized = true;
        }
      })();
      initializePromise = promise;

      try {
        await promise;
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
        console.error('Login error:', error);
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
        console.error('Login redirect error:', error);
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
        console.error('Logout error:', error);
      } finally {
        this.loading = false;
      }
    }
  }
});
