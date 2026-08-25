import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { UrlResponse } from '@/types';
import UrlTable from '../UrlTable.vue';

const buildUrl = (overrides: Partial<UrlResponse> = {}): UrlResponse => ({
  id: 'url-1',
  short_code: 'demo1',
  original_url: 'https://example.com/very-long-url',
  // The Admin API formats `short_url` without a base URL, so it is the bare code.
  short_url: 'demo1',
  title: 'Demo title',
  created_at: 1700000000000,
  updated_at: 1700000000000,
  is_active: true,
  click_count: 42,
  ...overrides
});

async function mountTable(urls: UrlResponse[], copiedId: string | null = null) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/analytics/:shortCode', name: 'Analytics', component: { template: '<div />' } }
    ]
  });
  await router.push('/');
  await router.isReady();

  return mount(UrlTable, {
    props: { urls, copiedId },
    global: { plugins: [router] }
  });
}

describe('UrlTable', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders one dense row per url with code, url, clicks and status', async () => {
    const wrapper = await mountTable([
      buildUrl({ id: 'a', short_code: 'alpha', click_count: 7 }),
      buildUrl({ id: 'b', short_code: 'beta', is_active: false, click_count: 3 })
    ]);

    const rows = wrapper.findAll('.row');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('aka.money/alpha');
    expect(rows[0].text()).toContain('7');
    expect(rows[0].get('.badge').text()).toContain('作用中');
    expect(rows[1].get('.badge').text()).toContain('已封存');
  });

  it('shows an expired badge for an active url past its expiry', async () => {
    const wrapper = await mountTable([buildUrl({ expires_at: Date.now() - 1000, is_active: true })]);

    expect(wrapper.get('.badge').text()).toContain('已過期');
  });

  it('never renders the raw configured short domain, only aka.money', async () => {
    vi.stubEnv('VITE_SHORT_DOMAIN', 'http://localhost:8788');
    const wrapper = await mountTable([buildUrl()]);

    expect(wrapper.text()).not.toContain('localhost');
    expect(wrapper.text()).toContain('aka.money/demo1');
    expect(wrapper.get('.lk').attributes('title')).toBe('aka.money/demo1');
  });

  it('builds a complete href from the short code, never from the bare API short_url', async () => {
    vi.stubEnv('VITE_SHORT_DOMAIN', '');
    const wrapper = await mountTable([buildUrl({ short_url: 'demo1' })]);

    expect(wrapper.get('.lk').attributes('href')).toBe('https://aka.money/demo1');
  });

  it('targets the configured local short host while still displaying aka.money', async () => {
    vi.stubEnv('VITE_SHORT_DOMAIN', 'http://localhost:8788');
    const wrapper = await mountTable([buildUrl({ short_url: 'demo1' })]);

    expect(wrapper.get('.lk').attributes('href')).toBe('http://localhost:8788/demo1');
    expect(wrapper.get('.lk').text()).toBe('aka.money/demo1');
  });

  it('links the analytics action to the correct route', async () => {
    const wrapper = await mountTable([buildUrl({ short_code: 'demo1' })]);

    expect(wrapper.find('a[href="/analytics/demo1"]').exists()).toBe(true);
  });

  it('shows an archive action for active urls and a restore action for archived ones', async () => {
    const wrapper = await mountTable([
      buildUrl({ id: 'a', is_active: true }),
      buildUrl({ id: 'b', is_active: false })
    ]);
    const rows = wrapper.findAll('.row');

    expect(rows[0].find('[data-testid="row-archive"]').exists()).toBe(true);
    expect(rows[0].find('[data-testid="row-restore"]').exists()).toBe(false);
    expect(rows[1].find('[data-testid="row-restore"]').exists()).toBe(true);
    expect(rows[1].find('[data-testid="row-archive"]').exists()).toBe(false);
  });

  it('emits copy/edit/archive/restore with the url payload', async () => {
    const url = buildUrl({ id: 'a', is_active: true });
    const wrapper = await mountTable([url]);

    await wrapper.get('[data-testid="row-copy"]').trigger('click');
    await wrapper.get('[data-testid="row-edit"]').trigger('click');
    await wrapper.get('[data-testid="row-archive"]').trigger('click');

    expect(wrapper.emitted('copy')?.[0]).toEqual([url]);
    expect(wrapper.emitted('edit')?.[0]).toEqual([url]);
    expect(wrapper.emitted('archive')?.[0]).toEqual([url]);
  });

  it('emits restore for an archived url', async () => {
    const url = buildUrl({ id: 'a', is_active: false });
    const wrapper = await mountTable([url]);

    await wrapper.get('[data-testid="row-restore"]').trigger('click');

    expect(wrapper.emitted('restore')?.[0]).toEqual([url]);
  });

  it('shows a copied indicator on the row matching copiedId', async () => {
    const wrapper = await mountTable([buildUrl({ id: 'a' })], 'a');

    expect(wrapper.get('[data-testid="row-copy"]').attributes('title')).toContain('已複製');
  });
});
