import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import type { OverallStatsResponse } from '@/types';
import KpiSummary from '../KpiSummary.vue';

const buildStats = (overrides: Partial<OverallStatsResponse> = {}): OverallStatsResponse => ({
  total_clicks: 500,
  active_links: 3,
  total_links: 4,
  click_trend: {},
  top_links: [],
  country_distribution: {},
  device_distribution: {},
  date_range: { start: '2024-03-01', end: '2024-03-30' },
  ...overrides
});

describe('KpiSummary', () => {
  it('shows a loading state and no KPI cards while loading', () => {
    const wrapper = mount(KpiSummary, { props: { stats: null, loading: true, error: null } });

    expect(wrapper.get('.state').attributes('data-state')).toBe('loading');
    expect(wrapper.findAll('.kpi')).toHaveLength(0);
  });

  it('shows an error state with a retry action and emits retry when clicked', async () => {
    const wrapper = mount(KpiSummary, { props: { stats: null, loading: false, error: '無法載入統計摘要' } });

    const state = wrapper.get('.state');
    expect(state.attributes('data-state')).toBe('error');
    expect(wrapper.text()).toContain('無法載入統計摘要');

    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });

  it('renders the four KPI cards once stats have loaded', () => {
    const wrapper = mount(KpiSummary, { props: { stats: buildStats(), loading: false, error: null } });

    const cards = wrapper.findAll('.kpi');
    expect(cards).toHaveLength(4);
    expect(wrapper.text()).toContain('近30天點擊');
    expect(wrapper.text()).toContain('作用中連結');
    expect(wrapper.text()).toContain('全部連結');
    expect(wrapper.text()).toContain('平均每連結');
    expect(wrapper.find('[data-state]').exists()).toBe(false);
  });

  it('applies the up/down tone class only when a detail line is shown', () => {
    const stats = buildStats({
      click_trend: {
        '2024-03-17': 1, '2024-03-18': 1, '2024-03-19': 1, '2024-03-20': 1,
        '2024-03-21': 1, '2024-03-22': 1, '2024-03-23': 1,
        '2024-03-24': 2, '2024-03-25': 2, '2024-03-26': 2, '2024-03-27': 2,
        '2024-03-28': 2, '2024-03-29': 2, '2024-03-30': 2
      },
      date_range: { start: '2024-03-17', end: '2024-03-30' }
    });
    const wrapper = mount(KpiSummary, { props: { stats, loading: false, error: null } });

    const clicksCard = wrapper.findAll('.kpi')[0];
    expect(clicksCard.get('.d').classes()).toContain('up');

    const activeCard = wrapper.findAll('.kpi')[1];
    expect(activeCard.find('.d').exists()).toBe(false);
  });
});
