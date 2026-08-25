import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { Router } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import AppShell from '../AppShell.vue';

vi.mock('@/services/auth', () => ({
  default: {
    initialize: vi.fn(async () => {}),
    login: vi.fn(),
    loginRedirect: vi.fn(),
    logout: vi.fn(async () => {}),
    getAccount: vi.fn(() => null),
    getToken: vi.fn(async () => 'token')
  },
  AuthConfigurationError: class AuthConfigurationError extends Error {},
  isAuthSkipped: () => false
}));

const stub = (label: string) => ({ template: `<div>${label}</div>` });

const createTestRouter = (): Router =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/dashboard' },
      { path: '/dashboard', name: 'Dashboard', component: stub('dashboard'), meta: { title: '連結' } },
      { path: '/stats', name: 'OverallStats', component: stub('stats'), meta: { title: '總覽統計' } },
      {
        path: '/analytics/:shortCode',
        name: 'Analytics',
        component: stub('analytics'),
        meta: { title: '成效分析' }
      },
      { path: '/login', name: 'Login', component: stub('login') }
    ]
  });

const mountShell = async (path = '/dashboard') => {
  const router = createTestRouter();
  await router.push(path);
  await router.isReady();

  const wrapper = mount(AppShell, {
    global: { plugins: [router] },
    slots: { default: '<p>view content</p>' },
    attachTo: document.body
  });
  await flushPromises();
  return { wrapper, router };
};

describe('AppShell', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const authStore = useAuthStore();
    authStore.initialized = true;
    authStore.isAuthenticated = true;
  });

  it('renders the routed content inside the shell', async () => {
    const { wrapper } = await mountShell();

    expect(wrapper.find('.app-shell').exists()).toBe(true);
    expect(wrapper.get('.view-wrap').text()).toContain('view content');
  });

  it('links navigation to the real dashboard and stats routes', async () => {
    const { wrapper } = await mountShell();
    const links = wrapper.findAll('.nav .nav-item');

    expect(links.map((link) => link.attributes('href'))).toEqual(['/dashboard', '/stats']);
    expect(links.map((link) => link.text())).toEqual(['連結', '總覽統計']);
  });

  it('marks the active route in the sidebar', async () => {
    const { wrapper } = await mountShell('/stats');

    const active = wrapper.findAll('.nav .nav-item').filter((link) => link.classes().includes('is-active'));
    expect(active).toHaveLength(1);
    expect(active[0].text()).toBe('總覽統計');
  });

  it('shows the current route title in the breadcrumb', async () => {
    const { wrapper } = await mountShell('/analytics/abc123');

    expect(wrapper.get('.crumbs').text()).toContain('成效分析');
  });

  it('collapses and expands the sidebar', async () => {
    const { wrapper } = await mountShell();
    const toggle = wrapper.get('[data-testid="sidebar-collapse"]');

    expect(wrapper.get('.app-shell').classes()).not.toContain('is-collapsed');

    await toggle.trigger('click');
    expect(wrapper.get('.app-shell').classes()).toContain('is-collapsed');

    await toggle.trigger('click');
    expect(wrapper.get('.app-shell').classes()).not.toContain('is-collapsed');
  });

  it('opens the mobile drawer and closes it from the scrim', async () => {
    const { wrapper } = await mountShell();

    expect(wrapper.find('.drawer-scrim').exists()).toBe(false);

    await wrapper.get('[data-testid="drawer-open"]').trigger('click');
    expect(wrapper.get('.app-shell').classes()).toContain('is-drawer-open');

    await wrapper.get('.drawer-scrim').trigger('click');
    expect(wrapper.get('.app-shell').classes()).not.toContain('is-drawer-open');
  });

  it('closes the mobile drawer after navigating', async () => {
    const { wrapper, router } = await mountShell();

    await wrapper.get('[data-testid="drawer-open"]').trigger('click');
    expect(wrapper.get('.app-shell').classes()).toContain('is-drawer-open');

    await router.push('/stats');
    await flushPromises();

    expect(wrapper.get('.app-shell').classes()).not.toContain('is-drawer-open');
  });

  it('toggles the colour theme and swaps the icon', async () => {
    const themeStore = useThemeStore();
    const { wrapper } = await mountShell();

    expect(wrapper.find('[data-icon="moon"]').exists()).toBe(true);

    await wrapper.get('[data-testid="theme-toggle"]').trigger('click');

    expect(themeStore.theme).toBe('dark');
    expect(wrapper.find('[data-icon="sun"]').exists()).toBe(true);
  });

  it('opens the user menu and logs out through the auth store', async () => {
    const authStore = useAuthStore();
    const logoutSpy = vi.spyOn(authStore, 'logout').mockResolvedValue();
    const { wrapper, router } = await mountShell();

    expect(wrapper.find('.user-menu-panel').exists()).toBe(false);

    await wrapper.get('[data-testid="user-menu-toggle"]').trigger('click');
    expect(wrapper.find('.user-menu-panel').exists()).toBe(true);

    await wrapper.get('[data-testid="logout"]').trigger('click');
    await flushPromises();

    expect(logoutSpy).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.path).toBe('/login');
  });

  it('closes the user menu when Escape is pressed', async () => {
    const { wrapper } = await mountShell();

    await wrapper.get('[data-testid="user-menu-toggle"]').trigger('click');
    expect(wrapper.find('.user-menu-panel').exists()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();

    expect(wrapper.find('.user-menu-panel').exists()).toBe(false);
  });

  it('uses no Bootstrap markup hooks', async () => {
    const { wrapper } = await mountShell();
    const html = wrapper.html();

    expect(html).not.toContain('data-bs-');
    expect(html).not.toContain('bi-');
    expect(html).not.toContain('navbar');
  });
});
