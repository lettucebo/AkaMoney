import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useThemeStore } from '../theme';

describe('Theme Store', () => {
  // Mock localStorage
  const localStorageMock = {
    store: {} as Record<string, string>,
    getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      localStorageMock.store[key] = value;
    }),
    clear: vi.fn(() => {
      localStorageMock.store = {};
    })
  };

  // Mock matchMedia
  let matchMediaListeners: ((e: { matches: boolean }) => void)[] = [];
  const matchMediaMock = vi.fn((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)',
    media: query,
    onchange: null,
    addEventListener: vi.fn((event: string, listener: (e: { matches: boolean }) => void) => {
      if (event === 'change') {
        matchMediaListeners.push(listener);
      }
    }),
    removeEventListener: vi.fn()
  }));

  // Mock document.documentElement.setAttribute
  const setAttributeMock = vi.fn();

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorageMock.clear();
    matchMediaListeners = [];

    // Setup mocks
    Object.defineProperty(window, 'localStorage', { value: localStorageMock });
    Object.defineProperty(window, 'matchMedia', { value: matchMediaMock, writable: true });
    Object.defineProperty(document.documentElement, 'setAttribute', { 
      value: setAttributeMock, 
      writable: true 
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const store = useThemeStore();
      
      expect(store.theme).toBe('light');
      expect(store.initialized).toBe(false);
    });
  });

  describe('getters', () => {
    it('should return isDark as true when theme is dark', () => {
      const store = useThemeStore();
      store.theme = 'dark';
      
      expect(store.isDark).toBe(true);
    });

    it('should return isDark as false when theme is light', () => {
      const store = useThemeStore();
      store.theme = 'light';
      
      expect(store.isDark).toBe(false);
    });

    it('should return sun icon when in dark mode', () => {
      const store = useThemeStore();
      store.theme = 'dark';
      
      expect(store.toggleIcon).toBe('bi-sun-fill');
    });

    it('should return moon icon when in light mode', () => {
      const store = useThemeStore();
      store.theme = 'light';
      
      expect(store.toggleIcon).toBe('bi-moon-fill');
    });
  });

  describe('initialize', () => {
    it('should use stored theme from localStorage if available', () => {
      localStorageMock.store['akamoney-theme'] = 'dark';
      
      const store = useThemeStore();
      store.initialize();
      
      expect(store.theme).toBe('dark');
      expect(store.initialized).toBe(true);
      expect(setAttributeMock).toHaveBeenCalledWith('data-bs-theme', 'dark');
    });

    it('should use OS preference when no stored theme', () => {
      // matchMedia mock returns matches: true for dark scheme
      (window.matchMedia as any) = vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn()
      }));
      
      const store = useThemeStore();
      store.initialize();
      
      expect(store.theme).toBe('dark');
    });

    it('should use light theme when OS prefers light', () => {
      (window.matchMedia as any) = vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn()
      }));
      
      const store = useThemeStore();
      store.initialize();
      
      expect(store.theme).toBe('light');
    });

    it('should not initialize twice', () => {
      const store = useThemeStore();
      store.initialize();
      store.initialize();
      
      // setAttributeMock should only be called once
      expect(setAttributeMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('setTheme', () => {
    it('should set theme and persist to localStorage', () => {
      const store = useThemeStore();
      store.setTheme('dark');
      
      expect(store.theme).toBe('dark');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('akamoney-theme', 'dark');
      expect(setAttributeMock).toHaveBeenCalledWith('data-bs-theme', 'dark');
    });

    it('should set theme without persisting when persist is false', () => {
      const store = useThemeStore();
      store.setTheme('dark', false);
      
      expect(store.theme).toBe('dark');
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
      expect(setAttributeMock).toHaveBeenCalledWith('data-bs-theme', 'dark');
    });
  });

  describe('toggleTheme', () => {
    it('should toggle from light to dark', () => {
      const store = useThemeStore();
      store.theme = 'light';
      store.toggleTheme();
      
      expect(store.theme).toBe('dark');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('akamoney-theme', 'dark');
    });

    it('should toggle from dark to light', () => {
      const store = useThemeStore();
      store.theme = 'dark';
      store.toggleTheme();
      
      expect(store.theme).toBe('light');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('akamoney-theme', 'light');
    });
  });
});
