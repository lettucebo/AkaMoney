import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { Router } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import App from '@/App.vue';

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

const stub = (label: string) => ({ template: `<div class="stub">${label}</div>` });

const buildRouter = (): Router =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/dashboard' },
      { path: '/dashboard', name: 'Dashboard', component: stub('dashboard'), meta: { title: '連結' } },
      { path: '/stats', name: 'OverallStats', component: stub('stats'), meta: { title: '總覽統計' } },
      { path: '/login', name: 'Login', component: stub('login'), meta: { title: '登入' } }
    ]
  });

const mountApp = async (path: string, authenticated: boolean) => {
  const router = buildRouter();
  const authStore = useAuthStore();
  authStore.initialized = true;
  authStore.isAuthenticated = authenticated;

  await router.push(path);
  await router.isReady();

  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
};

describe('App', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders the login route standalone without the app shell', async () => {
    const wrapper = await mountApp('/login', false);

    expect(wrapper.find('.app-shell').exists()).toBe(false);
    expect(wrapper.get('.stub').text()).toBe('login');
    wrapper.unmount();
  });

  it('renders authenticated routes inside the app shell', async () => {
    const wrapper = await mountApp('/dashboard', true);

    expect(wrapper.find('.app-shell').exists()).toBe(true);
    expect(wrapper.get('.view-wrap').text()).toContain('dashboard');
    wrapper.unmount();
  });

  it('keeps the shell hidden for unauthenticated visitors', async () => {
    const wrapper = await mountApp('/dashboard', false);

    expect(wrapper.find('.app-shell').exists()).toBe(false);
    wrapper.unmount();
  });

  it('never renders the shell on the login route even when authenticated', async () => {
    const wrapper = await mountApp('/login', true);

    expect(wrapper.find('.app-shell').exists()).toBe(false);
    wrapper.unmount();
  });
});
