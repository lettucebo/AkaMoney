import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { OverallStatsResponse, PaginatedResponse, UrlResponse } from '@/types';

const apiMock = vi.hoisted(() => ({
  getUrls: vi.fn(),
  getUrl: vi.fn(),
  createUrl: vi.fn(),
  updateUrl: vi.fn(),
  deleteUrl: vi.fn(),
  getOverallStats: vi.fn(),
  uploadImage: vi.fn()
}));

vi.mock('@/services/api', () => ({ default: apiMock }));

import DashboardView from '../DashboardView.vue';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function buildUrl(overrides: Partial<UrlResponse> = {}): UrlResponse {
  return {
    id: 'url-1',
    short_code: 'demo1',
    original_url: 'https://example.com/very-long-url',
    // Backend-shaped: `formatUrlResponse` emits the bare short code here.
    short_url: 'demo1',
    title: 'Example',
    created_at: Date.now() - 86400000,
    updated_at: Date.now() - 86400000,
    is_active: true,
    click_count: 42,
    ...overrides
  };
}

function buildPage(urls: UrlResponse[], overrides: Partial<PaginatedResponse<UrlResponse>['pagination']> = {}): PaginatedResponse<UrlResponse> {
  return {
    data: urls,
    pagination: { page: 1, limit: 20, total: urls.length, total_pages: 1, ...overrides }
  };
}

function buildStats(overrides: Partial<OverallStatsResponse> = {}): OverallStatsResponse {
  return {
    total_clicks: 140,
    active_links: 2,
    total_links: 3,
    click_trend: {},
    top_links: [],
    country_distribution: {},
    device_distribution: {},
    date_range: { start: '2024-01-01', end: '2024-01-30' },
    ...overrides
  };
}

describe('DashboardView', () => {
  let activeWrapper: Awaited<ReturnType<typeof mountDashboard>> | null = null;

  async function mountDashboard() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', redirect: '/dashboard' },
        { path: '/dashboard', name: 'Dashboard', component: DashboardView },
        { path: '/analytics/:shortCode', name: 'Analytics', component: { template: '<div />' } }
      ]
    });
    await router.push('/dashboard');
    await router.isReady();

    const wrapper = mount(DashboardView, {
      global: { plugins: [pinia, router] },
      attachTo: document.body
    });
    await flushPromises();
    activeWrapper = wrapper;
    return wrapper;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true
    });
  });

  afterEach(() => {
    activeWrapper?.unmount();
    activeWrapper = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('fetches the URL list and an explicit rolling 30-day KPI window independently on mount', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    await mountDashboard();

    expect(apiMock.getUrls).toHaveBeenCalledWith(1, 20);
    expect(apiMock.getOverallStats).toHaveBeenCalledTimes(1);
    const [start, end] = apiMock.getOverallStats.mock.calls[0];
    expect(typeof start).toBe('string');
    expect(typeof end).toBe('string');
    const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
    expect(days).toBe(29);
  });

  it('renders KPI cards and dense table rows on a happy-path mount', async () => {
    apiMock.getUrls.mockResolvedValue(
      buildPage([buildUrl(), buildUrl({ id: 'url-2', short_code: 'github', is_active: false, click_count: 10 })])
    );
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();

    expect(wrapper.findAll('.kpi')).toHaveLength(4);
    expect(wrapper.findAll('.row')).toHaveLength(2);
    expect(wrapper.text()).toContain('demo1');
    expect(wrapper.text()).toContain('github');
  });

  it('shows the list error state without preventing KPI cards from rendering (isolated failure)', async () => {
    apiMock.getUrls.mockRejectedValue({ response: { data: { message: '清單載入失敗' } } });
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();

    expect(wrapper.find('[data-state="error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('清單載入失敗');
    expect(wrapper.findAll('.kpi')).toHaveLength(4);
  });

  it('shows the KPI error state without preventing the URL table from rendering (isolated failure)', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()]));
    apiMock.getOverallStats.mockRejectedValue(new Error('stats down'));

    const wrapper = await mountDashboard();

    expect(wrapper.findAll('.kpi')).toHaveLength(0);
    expect(wrapper.findAll('.row')).toHaveLength(1);
  });

  it('renders the empty state when the account genuinely has no URLs', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([]));
    apiMock.getOverallStats.mockResolvedValue(buildStats({ active_links: 0, total_links: 0 }));

    const wrapper = await mountDashboard();

    expect(wrapper.text()).toContain('尚未建立任何短網址');
  });

  it('shows a distinct no-results state when the current page has urls but none match the filter', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ short_code: 'alpha' })]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();
    await wrapper.get('input[type="search"]').setValue('no-such-code');
    await flushPromises();

    expect(wrapper.findAll('.row')).toHaveLength(0);
    expect(wrapper.text()).toContain('目前頁面沒有符合條件');
  });

  it('filters current-page rows by the search box without implying a global search', async () => {
    apiMock.getUrls.mockResolvedValue(
      buildPage([buildUrl({ id: 'a', short_code: 'alpha' }), buildUrl({ id: 'b', short_code: 'beta' })])
    );
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();
    expect(wrapper.findAll('.row')).toHaveLength(2);

    await wrapper.get('input[type="search"]').setValue('alpha');
    await flushPromises();

    expect(wrapper.findAll('.row')).toHaveLength(1);
    expect(wrapper.text()).toContain('alpha');
    expect(wrapper.text()).not.toContain('beta');
  });

  it('filters current-page rows by status tab', async () => {
    apiMock.getUrls.mockResolvedValue(
      buildPage([buildUrl({ id: 'a', is_active: true }), buildUrl({ id: 'b', is_active: false })])
    );
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();
    const archivedTab = wrapper.findAll('.tab').find((t) => t.text().startsWith('已封存'))!;

    await archivedTab.trigger('click');
    await flushPromises();

    expect(wrapper.findAll('.row')).toHaveLength(1);
  });

  it('creates a new URL via the inline quick-create panel, refreshes KPI, and shows a success toast', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    apiMock.createUrl.mockResolvedValue(buildUrl({ id: 'new-1', short_code: 'new-link', click_count: 0 }));

    const wrapper = await mountDashboard();

    await wrapper.find('input[type="url"]').setValue('https://example.com/target');
    await wrapper.find('.prefix-input input[type="text"]').setValue('new-link');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(apiMock.createUrl).toHaveBeenCalledWith(
      expect.objectContaining({ original_url: 'https://example.com/target', short_code: 'new-link' })
    );
    expect(wrapper.text()).toContain('已建立短網址');
    expect(wrapper.findAll('.row')[0].text()).toContain('new-link');
    expect(apiMock.getOverallStats).toHaveBeenCalledTimes(2);
  });

  it('archives a URL after confirming in the modal, refreshes KPI, and shows a success toast', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ id: 'url-1', is_active: true })]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    apiMock.updateUrl.mockResolvedValue(buildUrl({ id: 'url-1', is_active: false }));

    const wrapper = await mountDashboard();

    await wrapper.get('[data-testid="row-archive"]').trigger('click');
    await flushPromises();

    await wrapper.get('[data-testid="confirm-action"]').trigger('click');
    await flushPromises();

    expect(apiMock.updateUrl).toHaveBeenCalledWith('url-1', { is_active: false });
    expect(wrapper.text()).toContain('已封存短網址');
    expect(apiMock.getOverallStats).toHaveBeenCalledTimes(2);
  });

  it('restores a URL after confirming in the modal', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ id: 'url-1', is_active: false })]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    apiMock.updateUrl.mockResolvedValue(buildUrl({ id: 'url-1', is_active: true }));

    const wrapper = await mountDashboard();

    await wrapper.get('[data-testid="row-restore"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="confirm-action"]').trigger('click');
    await flushPromises();

    expect(apiMock.updateUrl).toHaveBeenCalledWith('url-1', { is_active: true });
    expect(wrapper.text()).toContain('已還原短網址');
  });

  it('edits a URL via the modal and shows a success toast', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ id: 'url-1' })]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    apiMock.updateUrl.mockResolvedValue(buildUrl({ id: 'url-1', title: 'Updated' }));

    const wrapper = await mountDashboard();

    await wrapper.get('[data-testid="row-edit"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="edit-submit"]').trigger('click');
    await flushPromises();

    expect(apiMock.updateUrl).toHaveBeenCalled();
    expect(wrapper.text()).toContain('已更新短網址');
  });

  it('copies a complete short URL built from the short code, not the bare API short_url', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ short_url: 'demo1' })]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();
    await wrapper.get('[data-testid="row-copy"]').trigger('click');
    await flushPromises();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://aka.money/demo1');
  });

  it('shows a visible error toast when the clipboard write fails', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true
    });

    const wrapper = await mountDashboard();
    await wrapper.get('[data-testid="row-copy"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('.toast.err').exists()).toBe(true);
  });

  it('shows a visible error toast when the clipboard API is unavailable', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });

    const wrapper = await mountDashboard();
    await wrapper.get('[data-testid="row-copy"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('.toast.err').exists()).toBe(true);
  });

  it('paginates via the store while a page change happens', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()], { page: 1, total: 45, total_pages: 3 }));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ id: 'p2' })], { page: 2, total: 45, total_pages: 3 }));

    await wrapper.get('.pagination button:last-of-type').trigger('click');
    await flushPromises();

    expect(apiMock.getUrls).toHaveBeenCalledWith(2, 20);
  });

  it('returns to the server-truthful page 1 after creating from a later page', async () => {
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    apiMock.getUrls.mockResolvedValueOnce(buildPage([buildUrl({ id: 'a' })], { page: 1, total: 45, total_pages: 3 }));

    const wrapper = await mountDashboard();

    apiMock.getUrls.mockResolvedValueOnce(
      buildPage([buildUrl({ id: 'p2', short_code: 'page2' })], { page: 2, total: 45, total_pages: 3 })
    );
    await wrapper.get('.pagination button:last-of-type').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('page2');

    apiMock.createUrl.mockResolvedValue(buildUrl({ id: 'new-1', short_code: 'new-link', click_count: 0 }));
    apiMock.getUrls.mockResolvedValueOnce(
      buildPage([buildUrl({ id: 'new-1', short_code: 'new-link' })], { page: 1, total: 46, total_pages: 3 })
    );

    await wrapper.find('input[type="url"]').setValue('https://example.com/target');
    await wrapper.find('.prefix-input input[type="text"]').setValue('new-link');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(apiMock.getUrls).toHaveBeenLastCalledWith(1, 20);
    expect(wrapper.findAll('.row')).toHaveLength(1);
    expect(wrapper.findAll('.row')[0].text()).toContain('new-link');
    expect(wrapper.text()).not.toContain('page2');
  });

  it('keeps the table rendered while an archive is in flight (no shared loading flash)', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ id: 'url-1', is_active: true })]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    let resolveUpdate: (value: UrlResponse) => void = () => {};
    apiMock.updateUrl.mockReturnValue(new Promise<UrlResponse>((resolve) => { resolveUpdate = resolve; }));

    const wrapper = await mountDashboard();

    await wrapper.get('[data-testid="row-archive"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="confirm-action"]').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('.row')).toHaveLength(1);
    expect(wrapper.find('[data-state="loading"]').exists()).toBe(false);

    resolveUpdate(buildUrl({ id: 'url-1', is_active: false }));
    await flushPromises();

    expect(wrapper.findAll('.row')).toHaveLength(1);
  });

  it('keeps a list error on screen when a following mutation fails', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ id: 'url-1', is_active: true })]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    apiMock.updateUrl.mockRejectedValue({ response: { data: { message: '封存失敗' } } });

    const wrapper = await mountDashboard();

    await wrapper.get('[data-testid="row-archive"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="confirm-action"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('封存失敗');
    expect(wrapper.text()).not.toContain('無法載入清單');
    expect(wrapper.findAll('.row')).toHaveLength(1);
  });

  it('does not count an expired-but-unarchived link as 使用中', async () => {
    apiMock.getUrls.mockResolvedValue(
      buildPage([
        buildUrl({ id: 'live', short_code: 'live' }),
        buildUrl({ id: 'stale', short_code: 'stale', is_active: true, expires_at: Date.now() - 1000 })
      ])
    );
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();
    const activeTab = wrapper.findAll('.tab').find((t) => t.text().startsWith('使用中'))!;

    expect(activeTab.text()).toContain('1');

    await activeTab.trigger('click');
    await flushPromises();

    expect(wrapper.findAll('.row')).toHaveLength(1);
    expect(wrapper.text()).toContain('live');
    expect(wrapper.text()).not.toContain('aka.money/stale');
  });

  describe('KPI summary load race', () => {
    it('keeps the newer mutation-triggered stats when the initial mount request resolves later', async () => {
      apiMock.getUrls.mockResolvedValue(buildPage([]));
      const initial = deferred<OverallStatsResponse>();
      apiMock.getOverallStats.mockReturnValueOnce(initial.promise);
      apiMock.createUrl.mockResolvedValue(buildUrl({ id: 'new-1', short_code: 'new-link', click_count: 0 }));

      const wrapper = await mountDashboard();
      // The mount-time request is still pending; nothing has rendered stats yet.
      expect(wrapper.findAll('.kpi')).toHaveLength(0);

      apiMock.getOverallStats.mockResolvedValueOnce(buildStats({ total_clicks: 999 }));
      await wrapper.find('input[type="url"]').setValue('https://example.com/target');
      await wrapper.find('.prefix-input input[type="text"]').setValue('new-link');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      // The mutation-triggered (newer) request already resolved and rendered.
      expect(wrapper.findAll('.kpi')).toHaveLength(4);
      expect(wrapper.text()).toContain('999');

      // The stale, still-pending initial request now resolves with older data.
      initial.resolve(buildStats({ total_clicks: 1 }));
      await flushPromises();

      // The stale response must not clobber the newer stats.
      expect(wrapper.findAll('.kpi')[0].text()).toContain('999');
    });

    it('never lets a stale initial-load failure replace newer mutation-triggered success', async () => {
      apiMock.getUrls.mockResolvedValue(buildPage([]));
      const initial = deferred<OverallStatsResponse>();
      apiMock.getOverallStats.mockReturnValueOnce(initial.promise);
      apiMock.createUrl.mockResolvedValue(buildUrl({ id: 'new-1', short_code: 'new-link', click_count: 0 }));

      const wrapper = await mountDashboard();

      apiMock.getOverallStats.mockResolvedValueOnce(buildStats({ total_clicks: 777 }));
      await wrapper.find('input[type="url"]').setValue('https://example.com/target');
      await wrapper.find('.prefix-input input[type="text"]').setValue('new-link');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(wrapper.findAll('.kpi')).toHaveLength(4);
      expect(wrapper.text()).toContain('777');

      // The stale mount-time request now rejects - it must not surface an error
      // over the successful, newer stats already on screen.
      initial.reject(new Error('stale network failure'));
      await flushPromises();

      expect(wrapper.find('[data-state="error"]').exists()).toBe(false);
      expect(wrapper.findAll('.kpi')).toHaveLength(4);
      expect(wrapper.text()).toContain('777');
    });
  });
});
