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
        counts: { all: 5, active: 3, expired: 0, archived: 2 },
        ...overrides
      }
    });

  it('presents search as account-wide, not current-page only', () => {
    const wrapper = mountToolbar();

    const input = wrapper.get('input[type="search"]');
    expect(input.attributes('placeholder')).not.toContain('目前頁面');
    expect(input.attributes('aria-label')).not.toContain('目前頁面');
    expect(wrapper.text()).not.toContain('目前頁面');
    expect(wrapper.find('.toolbar-scope').exists()).toBe(false);
  });

  it('labels the search input for assistive technology', () => {
    const input = mountToolbar().get('input[type="search"]');

    expect(input.attributes('aria-label')).toContain('搜尋');
  });

  it('reflects the current search term', () => {
    const wrapper = mountToolbar({ search: 'report' });

    expect((wrapper.get('input[type="search"]').element as HTMLInputElement).value).toBe('report');
  });

  it('emits update:search as the user types', async () => {
    const wrapper = mountToolbar();

    await wrapper.get('input[type="search"]').setValue('alpha');

    expect(wrapper.emitted('update:search')).toEqual([['alpha']]);
  });

  it('renders four status tabs including 已過期', () => {
    const tabs = mountToolbar().findAll('[data-testid="status-tab"]');

    expect(tabs).toHaveLength(4);
    expect(tabs.map((t) => t.text())).toEqual(
      expect.arrayContaining([expect.stringContaining('全部'), expect.stringContaining('已過期')])
    );
  });

  it('renders the account-wide counts supplied by the server', () => {
    const wrapper = mountToolbar({ counts: { all: 1200, active: 900, expired: 100, archived: 200 } });
    const tabs = wrapper.findAll('[data-testid="status-tab"]');

    expect(tabs[0].text()).toContain('1,200');
    expect(tabs[1].text()).toContain('900');
    expect(tabs[2].text()).toContain('100');
    expect(tabs[3].text()).toContain('200');
  });

  it('marks the active status tab', () => {
    const tabs = mountToolbar({ status: 'expired' }).findAll('[data-testid="status-tab"]');

    expect(tabs[2].classes()).toContain('is-active');
    expect(tabs[2].attributes('aria-selected')).toBe('true');
    expect(tabs[0].classes()).not.toContain('is-active');
  });

  it.each([
    ['全部', 'all'],
    ['使用中', 'active'],
    ['已過期', 'expired'],
    ['已封存', 'archived']
  ])('emits update:status with %s', async (label, value) => {
    const wrapper = mountToolbar();
    const tab = wrapper.findAll('[data-testid="status-tab"]').find((t) => t.text().includes(label))!;

    await tab.trigger('click');

    expect(wrapper.emitted('update:status')).toEqual([[value]]);
  });

  it('renders all five sort options in a labelled select', () => {
    const wrapper = mountToolbar();
    const select = wrapper.get('[data-testid="sort-select"]');

    expect(select.findAll('option').map((o) => o.attributes('value'))).toEqual([
      'default',
      'created-asc',
      'updated-desc',
      'clicks-desc',
      'clicks-asc'
    ]);
    // An accessible name via a real <label for>, not a bare select.
    expect(wrapper.get('label[for="url-sort"]').text()).toBe('排序');
    expect(select.attributes('id')).toBe('url-sort');
  });

  it('reflects the current sort', () => {
    const select = mountToolbar({ sort: 'clicks-desc' }).get('[data-testid="sort-select"]');

    expect((select.element as HTMLSelectElement).value).toBe('clicks-desc');
  });

  it('emits update:sort when a different order is selected', async () => {
    const wrapper = mountToolbar();

    await wrapper.get('[data-testid="sort-select"]').setValue('updated-desc');

    expect(wrapper.emitted('update:sort')).toEqual([['updated-desc']]);
  });

  it('shows a busy hint only while a request is in flight', async () => {
    const wrapper = mountToolbar();
    expect(wrapper.find('.search-busy').exists()).toBe(false);

    await wrapper.setProps({ busy: true });
    expect(wrapper.get('.search-busy').attributes('aria-live')).toBe('polite');
  });
});
