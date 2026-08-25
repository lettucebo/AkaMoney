import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import NotFoundView from '../NotFoundView.vue';

describe('NotFoundView', () => {
  it('renders a Traditional Chinese 404 with a dashboard route', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/dashboard', component: { template: '<div />' } },
        { path: '/:pathMatch(.*)*', component: NotFoundView }
      ]
    });
    await router.push('/missing');
    await router.isReady();
    const wrapper = mount(NotFoundView, { global: { plugins: [router] } });

    expect(wrapper.text()).toContain('找不到這個頁面');
    expect(wrapper.get('a').attributes('href')).toBe('/dashboard');
    expect(wrapper.find('svg').exists()).toBe(true);
  });
});
