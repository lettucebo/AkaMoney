import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { OverallStatsResponse } from '@/types';

const apiMock = vi.hoisted(() => ({ getOverallStats: vi.fn() }));

vi.mock('@/services/api', () => ({ default: apiMock }));
vi.mock('@/components/common/BaseChart.vue', () => ({
  default: {
    props: ['type', 'labels', 'values', 'ariaLabel'],
    template: '<div class="base-chart-stub" :data-type="type" :data-labels="labels.join(\',\')" :data-values="values.join(\',\')" :aria-label="ariaLabel" />'
  }
}));

import OverallStatsView from '../OverallStatsView.vue';

function buildStats(overrides: Partial<OverallStatsResponse> = {}): OverallStatsResponse {
  return {
    total_clicks: 42,
    active_links: 3,
    total_links: 5,
    click_trend: { '2024-03-01': 12, '2024-03-02': 30 },
    top_links: [{ short_code: 'docs', original_url: 'https://docs.example.com', title: '文件', click_count: 30 }],
    country_distribution: { TW: 30, US: 12 },
    device_distribution: { desktop: 30, mobile: 12 },
    date_range: { start: '2024-03-01', end: '2024-03-31' },
    ...overrides
  };
}

async function mountStats() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/stats', component: OverallStatsView },
      { path: '/analytics/:shortCode', component: { template: '<div />' } }
    ]
  });
  await router.push('/stats');
  await router.isReady();
  const wrapper = mount(OverallStatsView, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

describe('OverallStatsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the initial current-month window explicitly and renders dense charts and top links', async () => {
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountStats();

    expect(apiMock.getOverallStats).toHaveBeenCalledTimes(1);
    const [start, end] = apiMock.getOverallStats.mock.calls[0] as [string, string];
    expect(start).toMatch(/^\d{4}-\d{2}-01$/);
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(wrapper.findAll('.kpi')).toHaveLength(4);
    expect(wrapper.findAll('.base-chart-stub')).toHaveLength(3);
    expect(wrapper.text()).toContain('aka.money/docs');
  });

  it('applies the explicitly selected start and end dates', async () => {
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    const wrapper = await mountStats();

    const currentMonth = new Date().toISOString().slice(0, 7);
    const selectedEnd = `${currentMonth}-15`;
    const dates = wrapper.findAll('input[type="date"]');
    await dates[1].setValue(selectedEnd);
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(apiMock.getOverallStats).toHaveBeenLastCalledWith(`${currentMonth}-01`, selectedEnd);
  });

  it('resets the controls to the current month and fetches that explicit range', async () => {
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    const wrapper = await mountStats();
    const baseline = apiMock.getOverallStats.mock.calls.length;

    await wrapper.get('[data-testid="reset-current-month"]').trigger('click');
    await flushPromises();

    expect(apiMock.getOverallStats).toHaveBeenCalledTimes(baseline + 1);
    const [start, end] = apiMock.getOverallStats.mock.calls.at(-1) as [string, string];
    expect(start).toMatch(/^\d{4}-\d{2}-01$/);
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps existing statistics visible when a refresh fails', async () => {
    apiMock.getOverallStats.mockResolvedValueOnce(buildStats());
    const wrapper = await mountStats();
    apiMock.getOverallStats.mockRejectedValueOnce({ response: { data: { message: '更新失敗' } } });

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('42');
    expect(wrapper.text()).toContain('更新失敗');
  });

  describe('sparse click trend', () => {
    it('zero-fills every day of the reported date range', async () => {
      apiMock.getOverallStats.mockResolvedValue(
        buildStats({
          click_trend: { '2024-03-05': 12, '2024-03-09': 30 },
          date_range: { start: '2024-03-01', end: '2024-03-10' }
        })
      );

      const wrapper = await mountStats();
      const chart = wrapper.get('.base-chart-stub[aria-label="點擊趨勢"]');
      const labels = chart.attributes('data-labels')!.split(',');
      const values = chart.attributes('data-values')!.split(',');

      expect(labels).toHaveLength(10);
      expect(values).toHaveLength(10);
      expect(labels[0]).toBe('2024/03/01');
      expect(labels[9]).toBe('2024/03/10');
      expect(values).toEqual(['0', '0', '0', '0', '12', '0', '0', '0', '30', '0']);
    });

    it('renders an all-zero series when the range recorded no clicks', async () => {
      apiMock.getOverallStats.mockResolvedValue(
        buildStats({ click_trend: {}, date_range: { start: '2024-03-01', end: '2024-03-03' } })
      );

      const wrapper = await mountStats();
      const chart = wrapper.get('.base-chart-stub[aria-label="點擊趨勢"]');

      expect(chart.attributes('data-labels')).toBe('2024/03/01,2024/03/02,2024/03/03');
      expect(chart.attributes('data-values')).toBe('0,0,0');
    });

    it('ignores trend days the API reported outside the requested range', async () => {
      apiMock.getOverallStats.mockResolvedValue(
        buildStats({
          click_trend: { '2024-02-20': 99, '2024-03-02': 4 },
          date_range: { start: '2024-03-01', end: '2024-03-03' }
        })
      );

      const wrapper = await mountStats();
      const chart = wrapper.get('.base-chart-stub[aria-label="點擊趨勢"]');

      expect(chart.attributes('data-labels')).toBe('2024/03/01,2024/03/02,2024/03/03');
      expect(chart.attributes('data-values')).toBe('0,4,0');
    });
  });

  describe('honest KPI copy', () => {
    it('scopes the total-click card to the selected range', async () => {
      apiMock.getOverallStats.mockResolvedValue(buildStats());
      const wrapper = await mountStats();

      const totalCard = wrapper.findAll('.kpi')[0];
      expect(totalCard.text()).toContain('總點擊數');
      expect(totalCard.text()).toContain('所選區間內');
      expect(totalCard.text()).not.toContain('所有連結累計');
    });

    it('names the average denominator as every link, not the range', async () => {
      apiMock.getOverallStats.mockResolvedValue(buildStats());
      const wrapper = await mountStats();

      const averageCard = wrapper.findAll('.kpi')[3];
      expect(averageCard.text()).toContain('平均每連結');
      expect(averageCard.text()).toContain('區間點擊 ÷ 全部連結');
    });

    it('does not claim expired-but-unarchived links are redirecting', async () => {
      apiMock.getOverallStats.mockResolvedValue(buildStats());
      const wrapper = await mountStats();

      expect(wrapper.text()).not.toContain('目前正在轉址');
    });
  });
});
