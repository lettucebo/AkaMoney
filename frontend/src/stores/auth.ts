import { defineStore } from 'pinia';
import type { AccountInfo } from '@azure/msal-browser';
import authService from '@/services/auth';

interface AuthState {
  user: AccountInfo | null;
  isAuthenticated: boolean;
  loading: boolean;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    isAuthenticated: false,
    loading: false
  }),

  getters: {
    userName: (state) => state.user?.name || state.user?.username || 'User',
    userEmail: (state) => state.user?.username || ''
  },

  actions: {
    async initialize() {
      this.loading = true;
      try {
        await authService.initialize();
        const account = authService.getAccount();
        if (account) {
          this.user = account;
          this.isAuthenticated = true;
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        this.loading = false;
      }
    },

    async login() {
      this.loading = true;
      try {
        const account = await authService.login();
        if (account) {
          this.user = account;
          this.isAuthenticated = true;
        }
      } catch (error) {
        console.error('Login error:', error);
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async logout() {
      this.loading = true;
      try {
        await authService.logout();
        this.user = null;
        this.isAuthenticated = false;
      } catch (error) {
        console.error('Logout error:', error);
      } finally {
        this.loading = false;
      }
    }
  }
});
