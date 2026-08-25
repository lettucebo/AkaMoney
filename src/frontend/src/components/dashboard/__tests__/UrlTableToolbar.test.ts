import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UrlTableToolbar from '../UrlTableToolbar.vue';

describe('UrlTableToolbar', () => {
  const mountToolbar = (overrides = {}) =>
    mount(UrlTableToolbar, {
      props: {
        search: '',
        status: 'all',
        sort: 'default',
        counts: { all: 5, active: 3, archived: 2, expired: 0 },
        ...overrides
      }
    });

  it('explicitly states the search/status/sort scope is the current page only', () => {
    const wrapper = mountToolbar();

    const input = wrapper.get('input[type="search"]');
    expect(input.attributes('placeholder')).toContain('搜尋目前頁面');
    expect(input.attributes('aria-label')).toContain('搜尋目前頁面');
    expect(wrapper.get('.toolbar-scope').text()).toContain('目前頁面');
  });

  it('emits update:search as the user types', async () => {
    const wrapper = mountToolbar();

    await wrapper.get('input[type="search"]').setValue('alpha');

    expect(wrapper.emitted('update:search')).toEqual([['alpha']]);
  });

  it('renders status tabs with current-page counts and marks the active one', () => {
    const wrapper = mountToolbar({ status: 'active' });
    const tabs = wrapper.get('[aria-label*="狀態篩選"]').findAll('.tab');

    expect(tabs).toHaveLength(3);
    expect(tabs[0].text()).toContain('5');
    expect(tabs[1].text()).toContain('3');
    expect(tabs[2].text()).toContain('2');
    expect(tabs[1].classes()).toContain('is-active');
    expect(tabs[0].classes()).not.toContain('is-active');
  });

  it('emits update:status when a tab is clicked', async () => {
    const wrapper = mountToolbar();
    const archivedTab = wrapper.findAll('.tab').find((t) => t.text().includes('已封存'))!;

    await archivedTab.trigger('click');

    expect(wrapper.emitted('update:status')).toEqual([['archived']]);
  });

  it('renders sort options and marks the active one', () => {
    const wrapper = mountToolbar({ sort: 'clicks-desc' });
    const sortTabs = wrapper.findAll('[data-testid="sort-option"]');

    expect(sortTabs.length).toBeGreaterThanOrEqual(2);
    const active = sortTabs.find((t) => t.classes().includes('is-active'));
    expect(active?.text()).toContain('高');
  });

  it('emits update:sort when a sort option is clicked', async () => {
    const wrapper = mountToolbar();
    const descOption = wrapper.findAll('[data-testid="sort-option"]').find((t) => t.text().includes('高'))!;

    await descOption.trigger('click');

    expect(wrapper.emitted('update:sort')).toEqual([['clicks-desc']]);
  });

  it('says nothing about expired links when the current page has none', () => {
    const wrapper = mountToolbar();

    expect(wrapper.get('.toolbar-scope').text()).not.toContain('已過期');
  });

  it('explains that expired links only appear under the all tab', () => {
    const wrapper = mountToolbar({ counts: { all: 5, active: 2, archived: 2, expired: 1 } });

    expect(wrapper.get('.toolbar-scope').text()).toContain('1 筆已過期');
    expect(wrapper.get('.toolbar-scope').text()).toContain('全部');
  });
});
