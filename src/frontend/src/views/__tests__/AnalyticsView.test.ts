import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { AnalyticsResponse } from '@/types';

const apiMock = vi.hoisted(() => ({ getAnalytics: vi.fn() }));

vi.mock('@/services/api', () => ({ default: apiMock }));
vi.mock('@/components/common/BaseChart.vue', () => ({
  default: {
    props: ['type', 'labels', 'values', 'ariaLabel'],
    template: '<div class="base-chart-stub" :data-type="type" :data-labels="labels.join(\',\')" :data-values="values.join(\',\')" :aria-label="ariaLabel" />'
  }
}));

import AnalyticsView from '../AnalyticsView.vue';

function buildAnalytics(overrides: Partial<AnalyticsResponse> = {}): AnalyticsResponse {
  return {
    url: {
      id: 'url-1',
      short_code: 'campaign',
      short_url: 'https://aka.money/campaign',
      original_url: 'https://example.com/long-campaign-url',
      created_at: 1,
      updated_at: 1,
      is_active: true,
      click_count: 12
    },
    total_clicks: 12,
    clicks_by_date: { '2024-03-01': 5, '2024-03-02': 7 },
    clicks_by_country: { TW: 8, US: 4 },
    clicks_by_device: { desktop: 9, mobile: 3 },
    clicks_by_browser: { Chrome: 10, Safari: 2 },
    recent_clicks: [
      {
        id: 'click-1',
        url_id: 'url-1',
        short_code: 'campaign',
        clicked_at: 1709251200000,
        ip_address: null,
        user_agent: null,
        referer: null,
        country: 'TW',
        city: null,
        device_type: 'desktop',
        browser: 'Chrome',
        os: null
      }
    ],
    ...overrides
  };
}

async function mountAnalytics(path = '/analytics/campaign') {
  const { wrapper } = await mountAnalyticsWithRouter(path);
  return wrapper;
}

async function mountAnalyticsWithRouter(path = '/analytics/campaign') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/dashboard', component: { template: '<div />' } },
      { path: '/analytics/:shortCode', component: AnalyticsView }
    ]
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(AnalyticsView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

function trendChart(wrapper: ReturnType<typeof mount>) {
  return wrapper.get('.base-chart-stub[aria-label="每日點擊趨勢"]');
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('AnalyticsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches the route short code and renders only API-backed dimensions with chart data', async () => {
    apiMock.getAnalytics.mockResolvedValue(buildAnalytics());

    const wrapper = await mountAnalytics();

    expect(apiMock.getAnalytics).toHaveBeenCalledWith('campaign');
    expect(wrapper.text()).toContain('aka.money/campaign');
    expect(wrapper.get('a[target="_blank"]').attributes('href')).toBe('https://example.com/long-campaign-url');
    expect(wrapper.findAll('.base-chart-stub')).toHaveLength(4);
    expect(wrapper.text()).not.toContain('作業系統');
    expect(wrapper.text()).not.toContain('來源網址');
  });

  it('changes the local range without a second analytics request', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2024-03-02T00:00:00Z'));
    apiMock.getAnalytics.mockResolvedValue(buildAnalytics());
    const wrapper = await mountAnalytics();

    await wrapper.get('[data-range="7"]').trigger('click');
    await flushPromises();
    expect(trendChart(wrapper).attributes('data-labels')!.split(',')).toHaveLength(7);
    expect(trendChart(wrapper).attributes('data-values')).toBe('0,0,0,0,0,5,7');

    await wrapper.get('[data-range="all"]').trigger('click');
    await flushPromises();
    expect(trendChart(wrapper).attributes('data-labels')!.split(',')).toHaveLength(30);

    expect(apiMock.getAnalytics).toHaveBeenCalledTimes(1);
  });

  it('renders BaseChart empty states for sparse zero data and preserves recent click semantics', async () => {
    apiMock.getAnalytics.mockResolvedValue(
      buildAnalytics({
        total_clicks: 0,
        clicks_by_date: { '2024-03-01': 0 },
        clicks_by_country: {},
        clicks_by_device: {},
        clicks_by_browser: {},
        recent_clicks: []
      })
    );
    const wrapper = await mountAnalytics();

    expect(wrapper.findAll('.base-chart-stub')).toHaveLength(4);
    expect(wrapper.text()).toContain('目前沒有近期點擊紀錄');
    expect(wrapper.text()).toContain('0');
  });

  it('distinguishes a not-found analytics response from a generic failure', async () => {
    apiMock.getAnalytics.mockRejectedValueOnce({ response: { status: 404, data: { message: '找不到短網址' } } });
    const missing = await mountAnalytics('/analytics/missing');
    expect(missing.text()).toContain('找不到這個短網址');

    apiMock.getAnalytics.mockRejectedValueOnce({ response: { status: 500, data: { message: '服務暫時無法使用' } } });
    const failed = await mountAnalytics('/analytics/broken');
    expect(failed.text()).toContain('服務暫時無法使用');
    expect(failed.text()).not.toContain('找不到這個短網址');
  });

  describe('explicit UTC calendar windows', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2024-03-20T12:00:00Z'));
    });

    it('builds a real 7-day calendar instead of slicing sparse click entries', async () => {
      apiMock.getAnalytics.mockResolvedValue(
        buildAnalytics({ clicks_by_date: { '2024-03-01': 5, '2024-03-20': 7 } })
      );
      const wrapper = await mountAnalytics();

      await wrapper.get('[data-range="7"]').trigger('click');
      await flushPromises();

      expect(trendChart(wrapper).attributes('data-labels')!.split(',')).toEqual([
        '2024/03/14',
        '2024/03/15',
        '2024/03/16',
        '2024/03/17',
        '2024/03/18',
        '2024/03/19',
        '2024/03/20'
      ]);
      expect(trendChart(wrapper).attributes('data-values')).toBe('0,0,0,0,0,0,7');
    });

    it('zero-fills the 30-day window and ends it on today', async () => {
      apiMock.getAnalytics.mockResolvedValue(
        buildAnalytics({ clicks_by_date: { '2024-03-01': 5, '2024-03-20': 7 } })
      );
      const wrapper = await mountAnalytics();

      const labels = trendChart(wrapper).attributes('data-labels')!.split(',');
      const values = trendChart(wrapper).attributes('data-values')!.split(',');

      expect(labels).toHaveLength(30);
      expect(labels[0]).toBe('2024/02/20');
      expect(labels[29]).toBe('2024/03/20');
      expect(values).toHaveLength(30);
      expect(values[10]).toBe('5');
      expect(values[29]).toBe('7');
    });

    it('gives the widest option the same 30-day window the API actually returns', async () => {
      apiMock.getAnalytics.mockResolvedValue(
        buildAnalytics({ clicks_by_date: { '2024-03-01': 5, '2024-03-20': 7 } })
      );
      const wrapper = await mountAnalytics();
      const thirtyDayLabels = trendChart(wrapper).attributes('data-labels');

      await wrapper.get('[data-range="all"]').trigger('click');
      await flushPromises();

      expect(trendChart(wrapper).attributes('data-labels')).toBe(thirtyDayLabels);
    });

    it('does not label any option as showing all history', async () => {
      apiMock.getAnalytics.mockResolvedValue(buildAnalytics());
      const wrapper = await mountAnalytics();

      expect(wrapper.get('[data-range="all"]').text()).toBe('近 30 日（API）');
      expect(wrapper.get('[data-range="all"]').text()).not.toContain('全部');
      expect(wrapper.get('[data-range="all"]').text()).not.toBe(wrapper.get('[data-range="30"]').text());
    });

    it('counts active days from the selected window, not the whole sparse record', async () => {
      apiMock.getAnalytics.mockResolvedValue(
        buildAnalytics({ clicks_by_date: { '2024-03-01': 5, '2024-03-19': 2, '2024-03-20': 7 } })
      );
      const wrapper = await mountAnalytics();

      const activeDaysCard = wrapper.findAll('.kpi')[1];
      expect(activeDaysCard.text()).toContain('有點擊日期');
      expect(activeDaysCard.get('b').text()).toBe('3');

      await wrapper.get('[data-range="7"]').trigger('click');
      await flushPromises();

      expect(wrapper.findAll('.kpi')[1].get('b').text()).toBe('2');
      expect(wrapper.findAll('.kpi')[1].text()).toContain('所選區間內');
    });

    it('names the total-click KPI as an all-time API figure, not a range figure', async () => {
      apiMock.getAnalytics.mockResolvedValue(buildAnalytics({ total_clicks: 999 }));
      const wrapper = await mountAnalytics();

      const totalCard = wrapper.findAll('.kpi')[0];
      expect(totalCard.text()).toContain('累計總點擊');
      expect(totalCard.text()).not.toContain('區間總點擊');
      expect(totalCard.get('b').text()).toBe('999');
    });

    it('marks the country and device breakdowns as all-time, matching the API query', async () => {
      apiMock.getAnalytics.mockResolvedValue(buildAnalytics());
      const wrapper = await mountAnalytics();

      expect(wrapper.findAll('.kpi')[2].text()).toContain('全期間');
      expect(wrapper.findAll('.kpi')[3].text()).toContain('全期間');
    });
  });

  describe('route short code changes', () => {
    it('refetches and re-renders when the same view instance gets a new short code', async () => {
      apiMock.getAnalytics
        .mockResolvedValueOnce(buildAnalytics())
        .mockResolvedValueOnce(
          buildAnalytics({ url: { ...buildAnalytics().url, id: 'url-2', short_code: 'other' } })
        );

      const { wrapper, router } = await mountAnalyticsWithRouter();
      expect(wrapper.text()).toContain('aka.money/campaign');

      await router.push('/analytics/other');
      await flushPromises();

      expect(apiMock.getAnalytics).toHaveBeenCalledTimes(2);
      expect(apiMock.getAnalytics).toHaveBeenLastCalledWith('other');
      expect(wrapper.text()).toContain('aka.money/other');
      expect(wrapper.text()).not.toContain('aka.money/campaign');
    });

    it('drops a stale response for a short code the user already navigated away from', async () => {
      const first = deferred<AnalyticsResponse>();
      const second = deferred<AnalyticsResponse>();
      apiMock.getAnalytics.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

      const { wrapper, router } = await mountAnalyticsWithRouter();
      await router.push('/analytics/other');
      await flushPromises();

      second.resolve(buildAnalytics({ url: { ...buildAnalytics().url, id: 'url-2', short_code: 'other' } }));
      await flushPromises();
      first.resolve(buildAnalytics());
      await flushPromises();

      expect(wrapper.text()).toContain('aka.money/other');
      expect(wrapper.text()).not.toContain('aka.money/campaign');
    });

    it('clears a previous error state when navigating to a working short code', async () => {
      apiMock.getAnalytics
        .mockRejectedValueOnce({ response: { status: 404, data: { message: '找不到短網址' } } })
        .mockResolvedValueOnce(
          buildAnalytics({ url: { ...buildAnalytics().url, id: 'url-2', short_code: 'other' } })
        );

      const { wrapper, router } = await mountAnalyticsWithRouter('/analytics/missing');
      expect(wrapper.text()).toContain('找不到這個短網址');

      await router.push('/analytics/other');
      await flushPromises();

      expect(wrapper.text()).not.toContain('找不到這個短網址');
      expect(wrapper.text()).toContain('aka.money/other');
    });
  });
});
