import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useUrlStore } from '@/stores/url';
import type { OverallStatsResponse, UrlListResponse, UrlResponse, UrlStatusCounts } from '@/types';

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

function buildPage(
  urls: UrlResponse[],
  overrides: Partial<UrlListResponse['pagination']> = {},
  counts: Partial<UrlStatusCounts> = {}
): UrlListResponse {
  return {
    data: urls,
    pagination: { page: 1, limit: 20, total: urls.length, total_pages: 1, ...overrides },
    counts: { all: urls.length, active: urls.length, expired: 0, archived: 0, ...counts }
  };
}

/** The list query object sent with the most recent `getUrls` call. */
const lastQuery = () => apiMock.getUrls.mock.calls.at(-1)?.[0];

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
  let activeWrapper: ReturnType<typeof mount> | null = null;

  async function mountDashboard(initialPath = '/dashboard') {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', redirect: '/dashboard' },
        { path: '/dashboard', name: 'Dashboard', component: DashboardView },
        { path: '/stats', name: 'OverallStats', component: { template: '<div />' } },
        { path: '/analytics/:shortCode', name: 'Analytics', component: { template: '<div />' } }
      ]
    });
    await router.push(initialPath);
    await router.isReady();

    const wrapper = mount(DashboardView, {
      global: { plugins: [pinia, router] },
      attachTo: document.body
    });
    await flushPromises();
    activeWrapper = wrapper;
    return Object.assign(wrapper, { router });
  }

  /** Types into the search box and lets the 300ms debounce fire. */
  async function search(wrapper: Awaited<ReturnType<typeof mountDashboard>>, term: string) {
    await wrapper.get('input[type="search"]').setValue(term);
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Only timers are faked - the search box is debounced, and Date must stay
    // real so status/rolling-window logic behaves normally.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true
    });
  });

  afterEach(() => {
    activeWrapper?.unmount();
    activeWrapper = null;
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fetches the URL list and an explicit rolling 30-day KPI window independently on mount', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    await mountDashboard();

    expect(lastQuery()).toEqual({ page: 1, search: '', status: 'all', sort: 'default' });
    expect(apiMock.getUrls).toHaveBeenCalledTimes(1);
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
    expect(wrapper.find('[data-testid="empty-open-create"]').exists()).toBe(true);

    await wrapper.get('[data-testid="empty-open-create"]').trigger('click');
    expect(wrapper.get('[role="dialog"]').text()).toContain('新增短網址');
    expect(wrapper.find('input[type="url"]').exists()).toBe(true);
  });

  it('shows a distinct no-results state, with a way out, when a filter matches nothing', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ short_code: 'alpha' })]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();
    apiMock.getUrls.mockResolvedValue(buildPage([], { total: 0, total_pages: 0 }, { all: 0, active: 0 }));
    await search(wrapper, 'no-such-code');

    expect(wrapper.findAll('.row')).toHaveLength(0);
    expect(wrapper.text()).toContain('沒有符合條件的短網址');
    expect(wrapper.text()).not.toContain('尚未建立任何短網址');
    expect(wrapper.find('[data-testid="clear-filters"]').exists()).toBe(true);
  });

  it('clears the filters from the no-results state', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([], { total: 0, total_pages: 0 }, { all: 0, active: 0 }));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard('/dashboard?q=nothing&status=archived');
    expect(wrapper.text()).toContain('沒有符合條件的短網址');

    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()]));
    await wrapper.get('[data-testid="clear-filters"]').trigger('click');
    await flushPromises();

    expect(lastQuery()).toMatchObject({ search: '', status: 'all', page: 1 });
    expect(wrapper.vm.$route.query).toEqual({});
  });

  it('sends the search term to the server rather than filtering the current page', async () => {
    apiMock.getUrls.mockResolvedValue(
      buildPage([buildUrl({ id: 'a', short_code: 'alpha' }), buildUrl({ id: 'b', short_code: 'beta' })])
    );
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();
    expect(wrapper.findAll('.row')).toHaveLength(2);

    // The server is the only thing that can find matches on other pages.
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ id: 'far', short_code: 'alpha-page-9' })]));
    await search(wrapper, 'alpha');

    expect(lastQuery()).toMatchObject({ search: 'alpha', page: 1 });
    expect(wrapper.text()).toContain('alpha-page-9');
    expect(wrapper.text()).not.toContain('beta');
  });

  it('debounces typing into a single request', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();
    apiMock.getUrls.mockClear();

    const input = wrapper.get('input[type="search"]');
    await input.setValue('a');
    await input.setValue('al');
    await input.setValue('alp');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(apiMock.getUrls).toHaveBeenCalledTimes(1);
    expect(lastQuery()).toMatchObject({ search: 'alp' });
  });

  it('sends the status filter to the server and resets to page 1', async () => {
    apiMock.getUrls.mockResolvedValue(
      buildPage([buildUrl({ id: 'a' })], { page: 2, total: 45, total_pages: 3 })
    );
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard('/dashboard?page=2');
    const archivedTab = wrapper.findAll('[data-testid="status-tab"]').find((t) => t.text().startsWith('已封存'))!;

    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ id: 'b', is_active: false })]));
    await archivedTab.trigger('click');
    await flushPromises();

    expect(lastQuery()).toMatchObject({ status: 'archived', page: 1 });
  });

  it('offers an 已過期 status tab backed by the server counts', async () => {
    apiMock.getUrls.mockResolvedValue(
      buildPage([buildUrl()], {}, { all: 10, active: 6, expired: 3, archived: 1 })
    );
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();
    const expiredTab = wrapper.findAll('[data-testid="status-tab"]').find((t) => t.text().startsWith('已過期'))!;

    expect(expiredTab.text()).toContain('3');

    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ id: 'e' })]));
    await expiredTab.trigger('click');
    await flushPromises();

    expect(lastQuery()).toMatchObject({ status: 'expired' });
  });

  it('sends the sort order to the server and resets to page 1', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()], { page: 3, total: 45, total_pages: 3 }));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard('/dashboard?page=3');

    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ id: 'top', click_count: 999 })]));
    await wrapper.get('[data-testid="sort-select"]').setValue('clicks-desc');
    await flushPromises();

    expect(lastQuery()).toMatchObject({ sort: 'clicks-desc', page: 1 });
  });

  it('keeps creation hidden until the page-header action opens the modal', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    const wrapper = await mountDashboard();

    expect(wrapper.find('input[type="url"]').exists()).toBe(false);
    await wrapper.get('[data-testid="open-create"]').trigger('click');
    expect(wrapper.get('[role="dialog"]').text()).toContain('新增短網址');
    expect(wrapper.find('input[type="url"]').exists()).toBe(true);
  });

  it('creates from the modal, closes it, refreshes KPI, and shows the new row', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    const created = buildUrl({ id: 'new-1', short_code: 'new-link', click_count: 0 });
    apiMock.createUrl.mockResolvedValue(created);
    const wrapper = await mountDashboard();
    // The store reconciles every mutation with the server, so the refresh must
    // report the row the create just added.
    apiMock.getUrls.mockResolvedValue(buildPage([created]));

    await wrapper.get('[data-testid="open-create"]').trigger('click');
    await wrapper.get('input[type="url"]').setValue('https://example.com/target');
    await wrapper.get('.prefix-input input[type="text"]').setValue('new-link');
    await wrapper.get('[data-testid="create-submit"]').trigger('click');
    await flushPromises();

    expect(apiMock.createUrl).toHaveBeenCalledWith(
      expect.objectContaining({ original_url: 'https://example.com/target', short_code: 'new-link' })
    );
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
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

  it('paginates through the route query so back/forward works', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()], { page: 1, total: 45, total_pages: 3 }));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ id: 'p2' })], { page: 2, total: 45, total_pages: 3 }));

    await wrapper.get('.pagination button:last-of-type').trigger('click');
    await flushPromises();

    expect(lastQuery()).toMatchObject({ page: 2 });
    expect(wrapper.vm.$route.query.page).toBe('2');
  });

  it('restores the list query from the address bar on mount', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()], { page: 2, total: 45, total_pages: 3 }));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard('/dashboard?q=report&status=expired&sort=clicks-asc&page=2');

    expect(lastQuery()).toEqual({ page: 2, search: 'report', status: 'expired', sort: 'clicks-asc' });
    expect((wrapper.get('input[type="search"]').element as HTMLInputElement).value).toBe('report');
    expect((wrapper.get('[data-testid="sort-select"]').element as HTMLSelectElement).value).toBe('clicks-asc');
  });

  it('ignores unusable values in the address bar', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    await mountDashboard('/dashboard?status=deleted&sort=bogus&page=abc');

    expect(lastQuery()).toEqual({ page: 1, search: '', status: 'all', sort: 'default' });
  });

  it('re-fetches when the browser navigates back to an earlier query', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ id: 'all-1' })]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ id: 'archived-1', is_active: false })]));
    await search(wrapper, 'report');
    expect(lastQuery()).toMatchObject({ search: 'report' });

    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ id: 'all-1' })]));
    await wrapper.router.back();
    await flushPromises();

    // A same-route query change never re-runs onMounted, so the route watcher
    // has to be the thing that fetches - otherwise back shows stale rows.
    expect(lastQuery()).toMatchObject({ search: '' });
    expect((wrapper.get('input[type="search"]').element as HTMLInputElement).value).toBe('');
  });

  it('does not fetch twice for a single user-initiated change', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();
    apiMock.getUrls.mockClear();

    await search(wrapper, 'report');

    expect(apiMock.getUrls).toHaveBeenCalledTimes(1);
  });

  it('rewrites the address bar when the server clamps a page past the end', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()], { page: 1, total: 5, total_pages: 1 }));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard('/dashboard?page=999');
    await flushPromises();

    expect(wrapper.vm.$route.query.page).toBeUndefined();
    expect(wrapper.findAll('.row')).toHaveLength(1);
  });

  it('does not re-fetch after rewriting a clamped page into the address bar', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()], { page: 1, total: 5, total_pages: 1 }));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    await mountDashboard('/dashboard?page=999');
    await flushPromises();

    // The normalization navigation must be recognised as already applied,
    // otherwise the clamp and the watcher would fetch each other in a loop.
    expect(apiMock.getUrls).toHaveBeenCalledTimes(1);
  });

  it('syncs the address bar when a mutation moves the list to another page', async () => {
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    apiMock.getUrls.mockResolvedValue(
      buildPage([buildUrl({ id: 'sole-row', is_active: true })], { page: 2, total: 21, total_pages: 2 })
    );

    const wrapper = await mountDashboard('/dashboard?page=2');
    expect(wrapper.vm.$route.query.page).toBe('2');

    // Archiving the only row on the last page drops the page count; the server
    // clamps the silent refresh back to page 1.
    apiMock.updateUrl.mockResolvedValue(buildUrl({ id: 'sole-row', is_active: false }));
    apiMock.getUrls.mockResolvedValue(
      buildPage([buildUrl({ id: 'p1' })], { page: 1, total: 20, total_pages: 1 })
    );

    await wrapper.get('[data-testid="row-archive"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="confirm-action"]').trigger('click');
    await flushPromises();

    // The address bar must not keep advertising a page the table no longer shows.
    expect(wrapper.vm.$route.query.page).toBeUndefined();
    expect(wrapper.findAll('.row')).toHaveLength(1);
  });

  it('never rewrites another route when a clamped response lands after navigating away', async () => {
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    const pending = deferred<UrlListResponse>();
    apiMock.getUrls.mockReturnValue(pending.promise);

    // A non-default filter, so a leaked navigation would produce a visibly
    // wrong query string on the other route rather than an empty one.
    const wrapper = await mountDashboard('/dashboard?status=archived&page=999');
    await wrapper.router.push('/stats');
    await flushPromises();

    // The clamp arrives only after the user has left the dashboard.
    pending.resolve(
      buildPage([buildUrl({ is_active: false })], { page: 1, total: 5, total_pages: 1 })
    );
    await flushPromises();

    expect(wrapper.router.currentRoute.value.path).toBe('/stats');
    expect(wrapper.router.currentRoute.value.query).toEqual({});
  });

  it('does not fetch the list for a route that is not the dashboard', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ is_active: false })]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    // Start from a filtered dashboard, so leaving it is a real query change
    // rather than a no-op the duplicate guard would swallow anyway.
    const wrapper = await mountDashboard('/dashboard?status=archived&sort=clicks-desc');
    apiMock.getUrls.mockClear();

    await wrapper.router.push('/stats');
    await flushPromises();

    expect(apiMock.getUrls).not.toHaveBeenCalled();
  });

  it('does not rewrite another route when the list query settles after leaving', async () => {
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl({ is_active: false })]));

    const wrapper = await mountDashboard('/dashboard?status=archived');
    await wrapper.router.push('/stats');
    await flushPromises();

    // Forcing a store-side query change while off the dashboard must not leak
    // the dashboard's filters into the other route's address bar.
    await wrapper.vm.$nextTick();
    apiMock.getUrls.mockResolvedValue(
      buildPage([buildUrl()], { page: 1, total: 1, total_pages: 1 })
    );
    const store = useUrlStore();
    await store.fetchUrls({ status: 'expired', page: 1 });
    await flushPromises();

    expect(wrapper.router.currentRoute.value.path).toBe('/stats');
    expect(wrapper.router.currentRoute.value.query).toEqual({});
  });

  it('keeps a search refinement to a single history entry', async () => {
    apiMock.getUrls.mockResolvedValue(buildPage([buildUrl()]));
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();
    await search(wrapper, 'rep');
    await search(wrapper, 'report');
    expect(wrapper.vm.$route.query.q).toBe('report');

    await wrapper.router.back();
    await flushPromises();

    // Back returns to the unfiltered list, not to every prefix typed on the way.
    expect(wrapper.vm.$route.query.q).toBeUndefined();
  });

  it('reconciles with the server after creating from a later page', async () => {
    apiMock.getOverallStats.mockResolvedValue(buildStats());
    apiMock.getUrls.mockResolvedValue(
      buildPage([buildUrl({ id: 'p2', short_code: 'page2' })], { page: 2, total: 45, total_pages: 3 })
    );

    const wrapper = await mountDashboard('/dashboard?page=2');
    expect(wrapper.text()).toContain('page2');

    apiMock.createUrl.mockResolvedValue(buildUrl({ id: 'new-1', short_code: 'new-link', click_count: 0 }));
    apiMock.getUrls.mockResolvedValue(
      buildPage([buildUrl({ id: 'p2b', short_code: 'page2b' })], { page: 2, total: 46, total_pages: 3 })
    );

    await wrapper.get('[data-testid="open-create"]').trigger('click');
    await wrapper.get('input[type="url"]').setValue('https://example.com/target');
    await wrapper.get('.prefix-input input[type="text"]').setValue('new-link');
    await wrapper.get('[data-testid="create-submit"]').trigger('click');
    await flushPromises();

    // The new link does not belong on page 2, so it must not appear in the table
    // (the success toast still names it, which is why only rows are inspected).
    expect(lastQuery()).toMatchObject({ page: 2 });
    const rowText = wrapper.findAll('.row').map((row) => row.text()).join('|');
    expect(rowText).toContain('page2b');
    expect(rowText).not.toContain('new-link');
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
      buildPage(
        [
          buildUrl({ id: 'live', short_code: 'live' }),
          buildUrl({ id: 'stale', short_code: 'stale', is_active: true, expires_at: Date.now() - 1000 })
        ],
        {},
        { all: 2, active: 1, expired: 1, archived: 0 }
      )
    );
    apiMock.getOverallStats.mockResolvedValue(buildStats());

    const wrapper = await mountDashboard();
    const tabs = wrapper.findAll('[data-testid="status-tab"]');
    const activeTab = tabs.find((t) => t.text().startsWith('使用中'))!;
    const expiredTab = tabs.find((t) => t.text().startsWith('已過期'))!;

    expect(activeTab.text()).toContain('1');
    expect(expiredTab.text()).toContain('1');

    apiMock.getUrls.mockResolvedValue(
      buildPage([buildUrl({ id: 'live', short_code: 'live' })], {}, { all: 2, active: 1, expired: 1, archived: 0 })
    );
    await activeTab.trigger('click');
    await flushPromises();

    expect(lastQuery()).toMatchObject({ status: 'active' });
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
      await wrapper.get('[data-testid="open-create"]').trigger('click');
      await wrapper.get('input[type="url"]').setValue('https://example.com/target');
      await wrapper.get('.prefix-input input[type="text"]').setValue('new-link');
      await wrapper.get('[data-testid="create-submit"]').trigger('click');
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
      await wrapper.get('[data-testid="open-create"]').trigger('click');
      await wrapper.get('input[type="url"]').setValue('https://example.com/target');
      await wrapper.get('.prefix-input input[type="text"]').setValue('new-link');
      await wrapper.get('[data-testid="create-submit"]').trigger('click');
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
