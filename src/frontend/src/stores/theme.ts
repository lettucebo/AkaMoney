import { defineStore } from 'pinia';

export type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  initialized: boolean;
}

const STORAGE_KEY = 'akamoney-theme';

/**
 * Detects the user's OS color scheme preference.
 * @returns 'dark' if the user prefers dark mode, 'light' otherwise.
 */
const getSystemTheme = (): Theme => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
};

/**
 * Retrieves the stored theme from localStorage.
 * @returns The stored theme or null if not set.
 */
const getStoredTheme = (): Theme | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  }
  return null;
};

/**
 * Stores the theme preference in localStorage.
 * @param theme - The theme to store.
 */
const storeTheme = (theme: Theme): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(STORAGE_KEY, theme);
  }
};

/**
 * Applies the theme to the document by setting the data-bs-theme attribute.
 * This leverages Bootstrap 5's built-in dark mode support.
 * @param theme - The theme to apply.
 */
const applyThemeToDocument = (theme: Theme): void => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-bs-theme', theme);
  }
};

export const useThemeStore = defineStore('theme', {
  state: (): ThemeState => ({
    theme: 'light',
    initialized: false
  }),

  getters: {
    /**
     * Returns true if the current theme is dark.
     */
    isDark: (state): boolean => state.theme === 'dark',

    /**
     * Returns the icon class for the theme toggle button.
     * Shows sun icon when in dark mode (click to switch to light).
     * Shows moon icon when in light mode (click to switch to dark).
     */
    toggleIcon: (state): string => state.theme === 'dark' ? 'bi-sun-fill' : 'bi-moon-fill'
  },

  actions: {
    /**
     * Initializes the theme store by:
     * 1. Checking localStorage for a stored preference
     * 2. Falling back to the OS preference
     * 3. Applying the theme to the document
     * 4. Setting up a listener for OS theme changes
     */
    initialize(): void {
      if (this.initialized) return;

      // Priority: localStorage > OS preference
      const storedTheme = getStoredTheme();
      const initialTheme = storedTheme ?? getSystemTheme();

      this.theme = initialTheme;
      applyThemeToDocument(initialTheme);

      // Listen for OS theme changes (only if no manual preference is stored)
      if (typeof window !== 'undefined' && window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', (e) => {
          // Only auto-switch if user hasn't set a manual preference
          if (!getStoredTheme()) {
            this.setTheme(e.matches ? 'dark' : 'light', false);
          }
        });
      }

      this.initialized = true;
    },

    /**
     * Sets the theme and optionally stores it in localStorage.
     * @param theme - The theme to set.
     * @param persist - Whether to persist the preference to localStorage (default: true).
     */
    setTheme(theme: Theme, persist: boolean = true): void {
      this.theme = theme;
      applyThemeToDocument(theme);
      if (persist) {
        storeTheme(theme);
      }
    },

    /**
     * Toggles between light and dark themes.
     * Always persists the preference.
     */
    toggleTheme(): void {
      const newTheme: Theme = this.theme === 'dark' ? 'light' : 'dark';
      this.setTheme(newTheme, true);
    }
  }
});
