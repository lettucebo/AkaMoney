import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DashboardPagination from '../DashboardPagination.vue';

describe('DashboardPagination', () => {
  it('renders nothing when there is only one page', () => {
    const wrapper = mount(DashboardPagination, { props: { page: 1, totalPages: 1, total: 3 } });

    expect(wrapper.find('nav').exists()).toBe(false);
  });

  it('shows the current page, total pages, and total count', () => {
    const wrapper = mount(DashboardPagination, { props: { page: 2, totalPages: 5, total: 97 } });

    expect(wrapper.get('.pinfo').text()).toContain('2');
    expect(wrapper.get('.pinfo').text()).toContain('5');
    expect(wrapper.get('.pinfo').text()).toContain('97');
  });

  it('disables the previous button on the first page and the next button on the last', () => {
    const first = mount(DashboardPagination, { props: { page: 1, totalPages: 3, total: 50 } });
    expect(first.findAll('button')[0].attributes('disabled')).toBeDefined();
    expect(first.findAll('button')[1].attributes('disabled')).toBeUndefined();

    const last = mount(DashboardPagination, { props: { page: 3, totalPages: 3, total: 50 } });
    expect(last.findAll('button')[0].attributes('disabled')).toBeUndefined();
    expect(last.findAll('button')[1].attributes('disabled')).toBeDefined();
  });

  it('emits change with the target page when prev/next are clicked', async () => {
    const wrapper = mount(DashboardPagination, { props: { page: 2, totalPages: 5, total: 97 } });
    const [prev, next] = wrapper.findAll('button');

    await prev.trigger('click');
    await next.trigger('click');

    expect(wrapper.emitted('change')).toEqual([[1], [3]]);
  });
});
