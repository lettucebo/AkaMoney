import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useUrlStore } from '../url';
import apiService from '@/services/api';
import type { UrlListResponse, UrlResponse, UrlStatusCounts } from '@/types';

// Mock the API service
vi.mock('@/services/api', () => ({
  default: {
    getUrls: vi.fn(),
    getUrl: vi.fn(),
    createUrl: vi.fn(),
    updateUrl: vi.fn(),
    deleteUrl: vi.fn()
  }
}));

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
    original_url: 'https://example.com/target',
    short_url: 'demo1',
    created_at: 1700000000000,
    updated_at: 1700000000000,
    is_active: true,
    click_count: 0,
    ...overrides
  };
}

function buildPage(
  urls: UrlResponse[],
  pagination: Partial<UrlListResponse['pagination']> = {},
  counts: Partial<UrlStatusCounts> = {}
): UrlListResponse {
  return {
    data: urls,
    pagination: { page: 1, limit: 20, total: urls.length, total_pages: 1, ...pagination },
    counts: { all: urls.length, active: urls.length, expired: 0, archived: 0, ...counts }
  };
}

/** The query object passed to the most recent `getUrls` call. */
const lastQuery = () => vi.mocked(apiService.getUrls).mock.calls.at(-1)?.[0];

describe('URL Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // Every mutation now reconciles with a silent refetch, so a default list
    // response must always be available.
    vi.mocked(apiService.getUrls).mockResolvedValue(buildPage([]));
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const store = useUrlStore();

      expect(store.urls).toEqual([]);
      expect(store.currentUrl).toBeNull();
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
      expect(store.listLoading).toBe(false);
      expect(store.listError).toBeNull();
      expect(store.query).toEqual({ page: 1, search: '', status: 'all', sort: 'default' });
      expect(store.counts).toEqual({ all: 0, active: 0, expired: 0, archived: 0 });
      expect(store.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        total_pages: 0
      });
    });
  });

  describe('fetchUrls', () => {
    it('should fetch URLs successfully', async () => {
      const mockResponse = buildPage([buildUrl({ id: '1', short_code: 'abc' })]);
      vi.mocked(apiService.getUrls).mockResolvedValue(mockResponse);

      const store = useUrlStore();
      await store.fetchUrls();

      expect(store.urls).toEqual(mockResponse.data);
      expect(store.pagination).toEqual(mockResponse.pagination);
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('should handle fetch URLs error', async () => {
      const mockError = { response: { data: { message: 'Failed to fetch' } } };
      vi.mocked(apiService.getUrls).mockRejectedValue(mockError);

      const store = useUrlStore();
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await store.fetchUrls();

      expect(store.error).toBe('Failed to fetch');
      expect(store.loading).toBe(false);
    });

    it('should set loading state during fetch', async () => {
      const pending = deferred<UrlListResponse>();
      vi.mocked(apiService.getUrls).mockReturnValue(pending.promise);

      const store = useUrlStore();
      const fetchPromise = store.fetchUrls();

      expect(store.loading).toBe(true);

      pending.resolve(buildPage([], { total_pages: 0 }));
      await fetchPromise;

      expect(store.loading).toBe(false);
    });

    it('sends the default query on a plain fetch', async () => {
      const store = useUrlStore();
      await store.fetchUrls();

      expect(apiService.getUrls).toHaveBeenCalledWith(
        { page: 1, search: '', status: 'all', sort: 'default' },
        20
      );
    });

    it('sends search, status and sort to the server', async () => {
      const store = useUrlStore();
      await store.fetchUrls({ search: 'report', status: 'expired', sort: 'clicks-desc', page: 2 });

      expect(lastQuery()).toEqual({ page: 2, search: 'report', status: 'expired', sort: 'clicks-desc' });
    });

    it('records the query the displayed list was fetched with', async () => {
      const store = useUrlStore();
      await store.fetchUrls({ search: 'report', status: 'archived' });

      expect(store.query).toMatchObject({ search: 'report', status: 'archived' });
    });

    it('stores the status counts from the response', async () => {
      vi.mocked(apiService.getUrls).mockResolvedValue(
        buildPage([buildUrl()], {}, { all: 9, active: 5, expired: 2, archived: 2 })
      );
      const store = useUrlStore();
      await store.fetchUrls();

      expect(store.counts).toEqual({ all: 9, active: 5, expired: 2, archived: 2 });
    });

    it('falls back to zeroed counts when the response omits them', async () => {
      vi.mocked(apiService.getUrls).mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, total_pages: 0 }
      } as unknown as UrlListResponse);
      const store = useUrlStore();
      await store.fetchUrls();

      expect(store.counts).toEqual({ all: 0, active: 0, expired: 0, archived: 0 });
    });

    it('adopts the effective page from the response when the server clamps it', async () => {
      vi.mocked(apiService.getUrls).mockResolvedValue(
        buildPage([buildUrl()], { page: 3, total: 45, total_pages: 3 })
      );
      const store = useUrlStore();
      await store.fetchUrls({ page: 999 });

      expect(store.query.page).toBe(3);
      expect(store.pagination.page).toBe(3);
    });

    it('carries the previous query forward when only the page changes', async () => {
      const store = useUrlStore();
      await store.fetchUrls({ search: 'report', sort: 'clicks-asc' });
      await store.fetchUrls({ page: 2 });

      expect(lastQuery()).toEqual({ page: 2, search: 'report', sort: 'clicks-asc', status: 'all' });
    });
  });

  describe('applyQuery', () => {
    it('resets to page 1 so a filter change cannot land on a page that no longer exists', async () => {
      const store = useUrlStore();
      await store.fetchUrls({ page: 3 });

      await store.applyQuery({ search: 'report' });

      expect(lastQuery()).toMatchObject({ page: 1, search: 'report' });
    });

    it('keeps the other filters intact', async () => {
      const store = useUrlStore();
      await store.fetchUrls({ status: 'archived', sort: 'clicks-desc' });

      await store.applyQuery({ search: 'x' });

      expect(lastQuery()).toEqual({ page: 1, search: 'x', status: 'archived', sort: 'clicks-desc' });
    });

    it('honours an explicit page', async () => {
      const store = useUrlStore();
      await store.applyQuery({ page: 4 });

      expect(lastQuery()).toMatchObject({ page: 4 });
    });
  });

  describe('fetchUrl', () => {
    it('should fetch single URL successfully', async () => {
      const url = buildUrl({ id: '1' });
      vi.mocked(apiService.getUrl).mockResolvedValue(url);

      const store = useUrlStore();
      await store.fetchUrl('1');

      expect(store.currentUrl).toEqual(url);
      expect(store.loading).toBe(false);
    });

    it('should handle fetch URL error', async () => {
      vi.mocked(apiService.getUrl).mockRejectedValue({ response: { data: { message: 'Not found' } } });
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = useUrlStore();
      await store.fetchUrl('1');

      expect(store.error).toBe('Not found');
    });
  });

  describe('createUrl', () => {
    it('should create URL successfully', async () => {
      const newUrl = buildUrl({ id: '2', short_code: 'xyz' });
      vi.mocked(apiService.createUrl).mockResolvedValue(newUrl);
      vi.mocked(apiService.getUrls).mockResolvedValue(
        buildPage([newUrl], { page: 1, limit: 1, total: 2, total_pages: 2 })
      );

      const store = useUrlStore();
      store.pagination = { page: 1, limit: 1, total: 1, total_pages: 1 };
      store.urls = [buildUrl({ id: '1', short_code: 'old' })];
      const result = await store.createUrl({ original_url: 'https://new.com', short_code: 'xyz' });

      expect(result).toEqual(newUrl);
      expect(store.urls.map((u) => u.id)).toEqual(['2']);
      expect(store.pagination).toEqual({ page: 1, limit: 1, total: 2, total_pages: 2 });
    });

    it('should handle create URL error', async () => {
      const mockError = { response: { data: { message: 'Invalid URL' } } };
      vi.mocked(apiService.createUrl).mockRejectedValue(mockError);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = useUrlStore();
      await expect(store.createUrl({ original_url: 'invalid', short_code: 'xyz' })).rejects.toEqual(mockError);
      expect(store.error).toBe('Invalid URL');
    });
  });

  describe('updateUrl', () => {
    it('should update URL successfully', async () => {
      const existingUrl = buildUrl({ id: '1' });
      const updatedUrl = { ...existingUrl, title: 'New Title' };
      vi.mocked(apiService.updateUrl).mockResolvedValue(updatedUrl);
      vi.mocked(apiService.getUrls).mockResolvedValue(buildPage([updatedUrl]));

      const store = useUrlStore();
      store.urls = [existingUrl];
      store.currentUrl = existingUrl;

      const result = await store.updateUrl('1', { title: 'New Title' });

      expect(result.title).toBe('New Title');
      expect(store.urls[0].title).toBe('New Title');
      expect(store.currentUrl?.title).toBe('New Title');
    });

    it('should handle update URL error', async () => {
      const mockError = { response: { data: { message: 'Update failed' } } };
      vi.mocked(apiService.updateUrl).mockRejectedValue(mockError);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = useUrlStore();
      await expect(store.updateUrl('1', { title: 'New' })).rejects.toEqual(mockError);
      expect(store.error).toBe('Update failed');
    });
  });

  describe('deleteUrl', () => {
    it('should delete URL successfully', async () => {
      const existingUrl = buildUrl({ id: '1' });
      vi.mocked(apiService.deleteUrl).mockResolvedValue(undefined);
      vi.mocked(apiService.getUrls).mockResolvedValue(buildPage([], { total: 0, total_pages: 0 }));

      const store = useUrlStore();
      store.urls = [existingUrl];
      store.currentUrl = existingUrl;
      store.pagination = { page: 1, limit: 20, total: 1, total_pages: 1 };

      await store.deleteUrl('1');

      expect(store.urls).toEqual([]);
      expect(store.currentUrl).toBeNull();
      expect(store.pagination).toEqual({ page: 1, limit: 20, total: 0, total_pages: 0 });
    });

    it('lets the server decide the final page when the last row on it is deleted', async () => {
      vi.mocked(apiService.deleteUrl).mockResolvedValue(undefined);
      vi.mocked(apiService.getUrls).mockResolvedValue(
        buildPage([buildUrl({ id: 'last-of-prev-page' })], { page: 2, limit: 1, total: 2, total_pages: 2 })
      );

      const store = useUrlStore();
      store.urls = [buildUrl({ id: 'sole-row' })];
      store.query = { page: 3, search: '', status: 'all', sort: 'default' };
      store.pagination = { page: 3, limit: 1, total: 3, total_pages: 3 };

      await store.deleteUrl('sole-row');

      // The store replays the same request and the server clamps the page, so
      // no local page arithmetic is needed - and the rows always match the
      // reported page number.
      expect(lastQuery()).toMatchObject({ page: 3 });
      expect(store.pagination).toEqual({ page: 2, limit: 1, total: 2, total_pages: 2 });
      expect(store.query.page).toBe(2);
      expect(store.urls.map((u) => u.id)).toEqual(['last-of-prev-page']);
    });

    it('should handle delete URL error', async () => {
      const mockError = { response: { data: { message: 'Delete failed' } } };
      vi.mocked(apiService.deleteUrl).mockRejectedValue(mockError);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = useUrlStore();
      await expect(store.deleteUrl('1')).rejects.toEqual(mockError);
      expect(store.error).toBe('Delete failed');
    });
  });

  describe('archiveUrl', () => {
    it('should archive URL successfully', async () => {
      const existingUrl = buildUrl({ id: '1', is_active: true, click_count: 10 });
      const archivedUrl = { ...existingUrl, is_active: false };
      vi.mocked(apiService.updateUrl).mockResolvedValue(archivedUrl);
      vi.mocked(apiService.getUrls).mockResolvedValue(buildPage([archivedUrl]));

      const store = useUrlStore();
      store.urls = [existingUrl];
      store.currentUrl = existingUrl;

      const result = await store.archiveUrl('1');

      expect(result.is_active).toBe(false);
      expect(store.urls[0].is_active).toBe(false);
      expect(store.currentUrl?.is_active).toBe(false);
    });

    it('should handle archive URL error', async () => {
      const mockError = { response: { data: { message: 'Archive failed' } } };
      vi.mocked(apiService.updateUrl).mockRejectedValue(mockError);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = useUrlStore();
      await expect(store.archiveUrl('1')).rejects.toEqual(mockError);
      expect(store.error).toBe('Archive failed');
    });
  });

  describe('restoreUrl', () => {
    it('should restore URL successfully', async () => {
      const existingUrl = buildUrl({ id: '1', is_active: false, click_count: 10 });
      const restoredUrl = { ...existingUrl, is_active: true };
      vi.mocked(apiService.updateUrl).mockResolvedValue(restoredUrl);
      vi.mocked(apiService.getUrls).mockResolvedValue(buildPage([restoredUrl]));

      const store = useUrlStore();
      store.urls = [existingUrl];
      store.currentUrl = existingUrl;

      const result = await store.restoreUrl('1');

      expect(result.is_active).toBe(true);
      expect(store.urls[0].is_active).toBe(true);
      expect(store.currentUrl?.is_active).toBe(true);
    });

    it('should handle restore URL error', async () => {
      const mockError = { response: { data: { message: 'Restore failed' } } };
      vi.mocked(apiService.updateUrl).mockRejectedValue(mockError);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = useUrlStore();
      await expect(store.restoreUrl('1')).rejects.toEqual(mockError);
      expect(store.error).toBe('Restore failed');
    });
  });

  describe('clearError', () => {
    it('should clear error', () => {
      const store = useUrlStore();
      store.error = 'Some error';

      store.clearError();

      expect(store.error).toBeNull();
    });
  });

  describe('error fallback messages (no response payload)', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('fetchUrls falls back to default message when error has no response', async () => {
      vi.mocked(apiService.getUrls).mockRejectedValue(new Error('network'));
      const store = useUrlStore();
      await store.fetchUrls();
      expect(store.error).toBe('Failed to fetch URLs');
    });

    it('fetchUrl falls back to default message when error has no response', async () => {
      vi.mocked(apiService.getUrl).mockRejectedValue(new Error('network'));
      const store = useUrlStore();
      await store.fetchUrl('1');
      expect(store.error).toBe('Failed to fetch URL');
    });

    it('createUrl falls back to default message when error has no response', async () => {
      vi.mocked(apiService.createUrl).mockRejectedValue(new Error('network'));
      const store = useUrlStore();
      await expect(store.createUrl({ original_url: 'x', short_code: 'xyz' })).rejects.toBeDefined();
      expect(store.error).toBe('Failed to create short URL');
    });

    it('updateUrl falls back to default message when error has no response', async () => {
      vi.mocked(apiService.updateUrl).mockRejectedValue(new Error('network'));
      const store = useUrlStore();
      await expect(store.updateUrl('1', {})).rejects.toBeDefined();
      expect(store.error).toBe('Failed to update URL');
    });

    it('deleteUrl falls back to default message when error has no response', async () => {
      vi.mocked(apiService.deleteUrl).mockRejectedValue(new Error('network'));
      const store = useUrlStore();
      await expect(store.deleteUrl('1')).rejects.toBeDefined();
      expect(store.error).toBe('Failed to delete URL');
    });

    it('archiveUrl falls back to default message when error has no response', async () => {
      vi.mocked(apiService.updateUrl).mockRejectedValue(new Error('network'));
      const store = useUrlStore();
      await expect(store.archiveUrl('1')).rejects.toBeDefined();
      expect(store.error).toBe('Failed to archive URL');
    });

    it('restoreUrl falls back to default message when error has no response', async () => {
      vi.mocked(apiService.updateUrl).mockRejectedValue(new Error('network'));
      const store = useUrlStore();
      await expect(store.restoreUrl('1')).rejects.toBeDefined();
      expect(store.error).toBe('Failed to restore URL');
    });
  });

  describe('list/currentUrl edge cases', () => {
    it('updateUrl succeeds when URL is not in list and currentUrl is null', async () => {
      const updatedUrl = buildUrl({ id: '99' });
      vi.mocked(apiService.updateUrl).mockResolvedValue(updatedUrl);
      const store = useUrlStore();
      const result = await store.updateUrl('99', { title: 't' });
      expect(result).toEqual(updatedUrl);
      expect(store.urls).toEqual([]);
      expect(store.currentUrl).toBeNull();
    });

    it('updateUrl does not mutate currentUrl when ids differ', async () => {
      const existing = buildUrl({ id: '1' });
      const otherCurrent = buildUrl({ id: '2', short_code: 'def' });
      const updated = { ...existing, title: 'New' };
      vi.mocked(apiService.updateUrl).mockResolvedValue(updated);
      vi.mocked(apiService.getUrls).mockResolvedValue(buildPage([updated]));
      const store = useUrlStore();
      store.urls = [existing];
      store.currentUrl = otherCurrent;
      await store.updateUrl('1', { title: 'New' });
      expect(store.urls[0].title).toBe('New');
      expect(store.currentUrl?.id).toBe('2');
    });

    it('deleteUrl succeeds when URL is not in list and currentUrl is null', async () => {
      vi.mocked(apiService.deleteUrl).mockResolvedValue(undefined);
      const store = useUrlStore();
      await store.deleteUrl('does-not-exist');
      expect(store.urls).toEqual([]);
      expect(store.currentUrl).toBeNull();
    });

    it('deleteUrl does not clear currentUrl when ids differ', async () => {
      const other = buildUrl({ id: '2', short_code: 'def' });
      vi.mocked(apiService.deleteUrl).mockResolvedValue(undefined);
      const store = useUrlStore();
      store.urls = [buildUrl({ id: '1' })];
      store.currentUrl = other;
      await store.deleteUrl('1');
      expect(store.urls).toEqual([]);
      expect(store.currentUrl?.id).toBe('2');
    });

    it('updateUrlActiveStatus (via archive) succeeds when URL is not in list and currentUrl is null', async () => {
      const updated = buildUrl({ id: '99', is_active: false });
      vi.mocked(apiService.updateUrl).mockResolvedValue(updated);
      const store = useUrlStore();
      const result = await store.archiveUrl('99');
      expect(result).toEqual(updated);
      expect(store.urls).toEqual([]);
      expect(store.currentUrl).toBeNull();
    });
  });

  describe('list request generation and mutation isolation', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('tracks list loading separately so mutations never blank the table', async () => {
      const listFetch = deferred<UrlListResponse>();
      vi.mocked(apiService.getUrls).mockReturnValueOnce(listFetch.promise);
      const store = useUrlStore();

      const listPromise = store.fetchUrls();
      expect(store.listLoading).toBe(true);
      listFetch.resolve(buildPage([buildUrl({ id: '1' })]));
      await listPromise;
      expect(store.listLoading).toBe(false);

      const archiveCall = deferred<UrlResponse>();
      vi.mocked(apiService.updateUrl).mockReturnValue(archiveCall.promise);
      const archivePromise = store.archiveUrl('1');

      expect(store.listLoading).toBe(false);
      expect(store.urls).toHaveLength(1);

      archiveCall.resolve(buildUrl({ id: '1', is_active: false }));
      await archivePromise;
      expect(store.listLoading).toBe(false);
    });

    it('keeps the rows visible while the post-mutation refresh is in flight', async () => {
      const store = useUrlStore();
      store.urls = [buildUrl({ id: '1' }), buildUrl({ id: '2' })];
      store.pagination = { page: 1, limit: 20, total: 2, total_pages: 1 };

      const refresh = deferred<UrlListResponse>();
      vi.mocked(apiService.getUrls).mockReturnValueOnce(refresh.promise);
      vi.mocked(apiService.updateUrl).mockResolvedValue(buildUrl({ id: '1', is_active: false }));

      const archivePromise = store.archiveUrl('1');
      await flushPromises();

      // The silent refresh must not raise the loading flag or empty the table.
      expect(store.listLoading).toBe(false);
      expect(store.urls).toHaveLength(2);

      refresh.resolve(buildPage([buildUrl({ id: '2' })]));
      await archivePromise;
      expect(store.urls.map((u) => u.id)).toEqual(['2']);
    });

    it('does not replace a rendered table with an error when the silent refresh fails', async () => {
      const store = useUrlStore();
      store.urls = [buildUrl({ id: '1' })];
      vi.mocked(apiService.updateUrl).mockResolvedValue(buildUrl({ id: '1', title: 'Updated' }));
      vi.mocked(apiService.getUrls).mockRejectedValue(new Error('network'));

      await store.updateUrl('1', { title: 'Updated' });

      expect(store.listError).toBeNull();
      expect(store.urls.map((u) => u.id)).toEqual(['1']);
      expect(store.urls[0].title).toBe('Updated');
    });

    it('keeps a list error visible when a later mutation fails', async () => {
      vi.mocked(apiService.getUrls).mockRejectedValue({ response: { data: { message: '清單載入失敗' } } });
      const store = useUrlStore();
      await store.fetchUrls();
      expect(store.listError).toBe('清單載入失敗');

      vi.mocked(apiService.updateUrl).mockRejectedValue({ response: { data: { message: '封存失敗' } } });
      await expect(store.archiveUrl('1')).rejects.toBeDefined();

      expect(store.listError).toBe('清單載入失敗');
      expect(store.error).toBe('封存失敗');
    });

    it('clears the list error when a later fetch succeeds', async () => {
      vi.mocked(apiService.getUrls).mockRejectedValueOnce({ response: { data: { message: '清單載入失敗' } } });
      const store = useUrlStore();
      await store.fetchUrls();
      expect(store.listError).toBe('清單載入失敗');

      vi.mocked(apiService.getUrls).mockResolvedValueOnce(buildPage([buildUrl({ id: '1' })]));
      await store.fetchUrls();
      expect(store.listError).toBeNull();
    });

    it('drops an out-of-order page response that resolves after a newer page fetch', async () => {
      const firstPage = deferred<UrlListResponse>();
      const secondPage = deferred<UrlListResponse>();
      vi.mocked(apiService.getUrls)
        .mockReturnValueOnce(firstPage.promise)
        .mockReturnValueOnce(secondPage.promise);
      const store = useUrlStore();

      const firstPromise = store.fetchUrls({ page: 1 });
      const secondPromise = store.fetchUrls({ page: 2 });

      secondPage.resolve(buildPage([buildUrl({ id: 'p2' })], { page: 2, total: 45, total_pages: 3 }));
      await secondPromise;
      firstPage.resolve(buildPage([buildUrl({ id: 'p1' })], { page: 1, total: 45, total_pages: 3 }));
      await firstPromise;

      expect(store.urls.map((u) => u.id)).toEqual(['p2']);
      expect(store.pagination).toEqual({ page: 2, limit: 20, total: 45, total_pages: 3 });
      expect(store.listLoading).toBe(false);
    });

    it('drops a stale search response that resolves after a newer search', async () => {
      const slowSearch = deferred<UrlListResponse>();
      const fastSearch = deferred<UrlListResponse>();
      vi.mocked(apiService.getUrls)
        .mockReturnValueOnce(slowSearch.promise)
        .mockReturnValueOnce(fastSearch.promise);
      const store = useUrlStore();

      const firstPromise = store.applyQuery({ search: 'rep' });
      const secondPromise = store.applyQuery({ search: 'report' });

      fastSearch.resolve(buildPage([buildUrl({ id: 'match-report' })]));
      await secondPromise;
      slowSearch.resolve(buildPage([buildUrl({ id: 'match-rep' })]));
      await firstPromise;

      expect(store.urls.map((u) => u.id)).toEqual(['match-report']);
      expect(store.query.search).toBe('report');
    });

    it('does not surface a stale page failure once a newer page fetch has landed', async () => {
      const firstPage = deferred<UrlListResponse>();
      const secondPage = deferred<UrlListResponse>();
      vi.mocked(apiService.getUrls)
        .mockReturnValueOnce(firstPage.promise)
        .mockReturnValueOnce(secondPage.promise);
      const store = useUrlStore();

      const firstPromise = store.fetchUrls({ page: 1 });
      const secondPromise = store.fetchUrls({ page: 2 });

      secondPage.resolve(buildPage([buildUrl({ id: 'p2' })], { page: 2 }));
      await secondPromise;
      firstPage.reject({ response: { data: { message: '舊頁面失敗' } } });
      await firstPromise;

      expect(store.listError).toBeNull();
      expect(store.urls.map((u) => u.id)).toEqual(['p2']);
    });

    it('optimistically prepends a created url in the default view, then reconciles', async () => {
      vi.mocked(apiService.getUrls).mockResolvedValueOnce(buildPage([buildUrl({ id: 'old' })]));
      const store = useUrlStore();
      await store.fetchUrls();

      const created = buildUrl({ id: 'new', short_code: 'new-link' });
      const refresh = deferred<UrlListResponse>();
      vi.mocked(apiService.getUrls).mockReturnValueOnce(refresh.promise);
      vi.mocked(apiService.createUrl).mockResolvedValue(created);

      const createPromise = store.createUrl({ original_url: 'https://example.com/target', short_code: 'new-link' });
      await flushPromises();

      // Instant feedback before the server confirms the new page contents.
      expect(store.urls.map((u) => u.id)).toEqual(['new', 'old']);

      refresh.resolve(buildPage([created, buildUrl({ id: 'old' })], { total: 2 }));
      await createPromise;
      expect(store.urls.map((u) => u.id)).toEqual(['new', 'old']);
    });

    it('does not prepend a created url while a search is active', async () => {
      vi.mocked(apiService.getUrls).mockResolvedValueOnce(buildPage([buildUrl({ id: 'match' })]));
      const store = useUrlStore();
      await store.fetchUrls({ search: 'report' });

      const created = buildUrl({ id: 'new', short_code: 'unrelated' });
      const refresh = deferred<UrlListResponse>();
      vi.mocked(apiService.getUrls).mockReturnValueOnce(refresh.promise);
      vi.mocked(apiService.createUrl).mockResolvedValue(created);

      const createPromise = store.createUrl({ original_url: 'https://example.com/x', short_code: 'unrelated' });
      await flushPromises();

      // The new link may not match "report" at all, so showing it would be a lie.
      expect(store.urls.map((u) => u.id)).toEqual(['match']);

      refresh.resolve(buildPage([buildUrl({ id: 'match' })]));
      await createPromise;
      expect(store.urls.map((u) => u.id)).toEqual(['match']);
      expect(lastQuery()).toMatchObject({ search: 'report' });
    });

    it('does not prepend a created url under a non-default sort', async () => {
      vi.mocked(apiService.getUrls).mockResolvedValueOnce(buildPage([buildUrl({ id: 'top', click_count: 99 })]));
      const store = useUrlStore();
      await store.fetchUrls({ sort: 'clicks-desc' });

      vi.mocked(apiService.getUrls).mockResolvedValueOnce(
        buildPage([buildUrl({ id: 'top', click_count: 99 })])
      );
      vi.mocked(apiService.createUrl).mockResolvedValue(buildUrl({ id: 'new', click_count: 0 }));

      await store.createUrl({ original_url: 'https://example.com/x', short_code: 'new-link' });

      // A brand new link has zero clicks; it does not belong at the top.
      expect(store.urls.map((u) => u.id)).toEqual(['top']);
    });

    it('refetches the same page instead of prepending when creating from a later page', async () => {
      const store = useUrlStore();
      store.urls = [buildUrl({ id: 'p2-a' })];
      store.query = { page: 2, search: '', status: 'all', sort: 'default' };
      store.pagination = { page: 2, limit: 20, total: 45, total_pages: 3 };

      vi.mocked(apiService.getUrls).mockResolvedValue(
        buildPage([buildUrl({ id: 'p2-new' })], { page: 2, total: 46, total_pages: 3 })
      );
      vi.mocked(apiService.createUrl).mockResolvedValue(buildUrl({ id: 'new' }));

      await store.createUrl({ original_url: 'https://example.com/target', short_code: 'new-link' });

      expect(lastQuery()).toMatchObject({ page: 2 });
      expect(store.urls.map((u) => u.id)).toEqual(['p2-new']);
    });

    it('drops a row that an edit moved out of the active search', async () => {
      vi.mocked(apiService.getUrls).mockResolvedValueOnce(
        buildPage([buildUrl({ id: '1', title: 'Report Q1' }), buildUrl({ id: '2', title: 'Report Q2' })])
      );
      const store = useUrlStore();
      await store.fetchUrls({ search: 'report' });

      const renamed = buildUrl({ id: '1', title: 'Unrelated' });
      vi.mocked(apiService.updateUrl).mockResolvedValue(renamed);
      vi.mocked(apiService.getUrls).mockResolvedValueOnce(
        buildPage([buildUrl({ id: '2', title: 'Report Q2' })], { total: 1 }, { all: 1, active: 1 })
      );

      await store.updateUrl('1', { title: 'Unrelated' });

      expect(store.urls.map((u) => u.id)).toEqual(['2']);
      expect(lastQuery()).toMatchObject({ search: 'report' });
    });

    it('reorders after an edit under the recently-updated sort', async () => {
      vi.mocked(apiService.getUrls).mockResolvedValueOnce(
        buildPage([buildUrl({ id: 'a', updated_at: 300 }), buildUrl({ id: 'b', updated_at: 200 })])
      );
      const store = useUrlStore();
      await store.fetchUrls({ sort: 'updated-desc' });

      const touched = buildUrl({ id: 'b', updated_at: 400, title: 'Edited' });
      vi.mocked(apiService.updateUrl).mockResolvedValue(touched);
      vi.mocked(apiService.getUrls).mockResolvedValueOnce(
        buildPage([touched, buildUrl({ id: 'a', updated_at: 300 })])
      );

      await store.updateUrl('b', { title: 'Edited' });

      // Every update bumps updated_at, so an in-place replace alone would leave
      // the row visibly out of order.
      expect(store.urls.map((u) => u.id)).toEqual(['b', 'a']);
      expect(lastQuery()).toMatchObject({ sort: 'updated-desc' });
    });

    it('refreshes the status counts after an archive', async () => {
      vi.mocked(apiService.getUrls).mockResolvedValueOnce(
        buildPage([buildUrl({ id: '1' })], {}, { all: 2, active: 2, expired: 0, archived: 0 })
      );
      const store = useUrlStore();
      await store.fetchUrls();
      expect(store.counts.active).toBe(2);

      vi.mocked(apiService.updateUrl).mockResolvedValue(buildUrl({ id: '1', is_active: false }));
      vi.mocked(apiService.getUrls).mockResolvedValueOnce(
        buildPage([buildUrl({ id: '1', is_active: false })], {}, { all: 2, active: 1, expired: 0, archived: 1 })
      );

      await store.archiveUrl('1');

      expect(store.counts).toEqual({ all: 2, active: 1, expired: 0, archived: 1 });
    });

    it('keeps an archived row when a list fetch that started earlier resolves later', async () => {
      const pendingFetch = deferred<UrlListResponse>();
      const refetch = deferred<UrlListResponse>();
      vi.mocked(apiService.getUrls)
        .mockReturnValueOnce(pendingFetch.promise)
        .mockReturnValueOnce(refetch.promise);
      const store = useUrlStore();
      store.urls = [buildUrl({ id: '1', is_active: true })];
      store.pagination = { page: 1, limit: 20, total: 1, total_pages: 1 };

      const listPromise = store.fetchUrls();
      vi.mocked(apiService.updateUrl).mockResolvedValue(buildUrl({ id: '1', is_active: false }));
      const archivePromise = store.archiveUrl('1');
      await flushPromises();

      refetch.resolve(buildPage([buildUrl({ id: '1', is_active: false })]));
      await archivePromise;

      pendingFetch.resolve(buildPage([buildUrl({ id: '1', is_active: true })]));
      await listPromise;

      expect(store.urls).toHaveLength(1);
      expect(store.urls[0].is_active).toBe(false);
      expect(store.listLoading).toBe(false);
    });

    it('replays the query that was in flight, not the currently displayed one', async () => {
      const pendingFetch = deferred<UrlListResponse>();
      const refetch = deferred<UrlListResponse>();
      vi.mocked(apiService.getUrls)
        .mockReturnValueOnce(pendingFetch.promise)
        .mockReturnValueOnce(refetch.promise);
      const store = useUrlStore();
      store.urls = [buildUrl({ id: '1' })];
      store.query = { page: 1, search: '', status: 'all', sort: 'default' };
      store.pagination = { page: 1, limit: 20, total: 45, total_pages: 3 };

      const listPromise = store.fetchUrls({ page: 3, status: 'archived' });
      vi.mocked(apiService.updateUrl).mockResolvedValue(buildUrl({ id: '1', title: 'Updated' }));
      const updatePromise = store.updateUrl('1', { title: 'Updated' });
      await flushPromises();

      refetch.resolve(buildPage([buildUrl({ id: 'p3' })], { page: 3, total: 45, total_pages: 3 }));
      await updatePromise;
      pendingFetch.resolve(buildPage([buildUrl({ id: 'stale' })], { page: 3, total: 45, total_pages: 3 }));
      await listPromise;

      expect(lastQuery()).toMatchObject({ page: 3, status: 'archived' });
      expect(store.urls.map((u) => u.id)).toEqual(['p3']);
    });

    it('refetches after a delete that raced a pending list fetch, dropping the stale page', async () => {
      const pendingFetch = deferred<UrlListResponse>();
      const refetch = deferred<UrlListResponse>();
      vi.mocked(apiService.getUrls)
        .mockReturnValueOnce(pendingFetch.promise)
        .mockReturnValueOnce(refetch.promise);
      const store = useUrlStore();
      store.urls = [buildUrl({ id: '1' }), buildUrl({ id: '2' })];
      store.pagination = { page: 1, limit: 20, total: 2, total_pages: 1 };

      const listPromise = store.fetchUrls();
      vi.mocked(apiService.deleteUrl).mockResolvedValue(undefined);
      const deletePromise = store.deleteUrl('1');
      await flushPromises();

      refetch.resolve(buildPage([buildUrl({ id: '2' })], { page: 1, total: 1, total_pages: 1 }));
      await deletePromise;

      pendingFetch.resolve(
        buildPage([buildUrl({ id: '1' }), buildUrl({ id: '2' })], { page: 1, total: 2, total_pages: 1 })
      );
      await listPromise;

      expect(apiService.getUrls).toHaveBeenCalledTimes(2);
      expect(store.urls.map((u) => u.id)).toEqual(['2']);
      expect(store.pagination.total).toBe(1);
      expect(store.listLoading).toBe(false);
    });
  });

  describe('console error context', () => {
    const SIGNED_ORIGINAL_URL = 'https://blob.example.com/file?sig=SECRET-SIGNATURE';

    /**
     * Console errors are forwarded to Sentry, so a raw Axios error would ship
     * `config.data`/`config.url`/`response.data` - which carry the customer's
     * original URL and its signed query credentials - into the issue payload.
     */
    function buildAxiosError(status: number, message: string) {
      const error = new Error(`Request failed with status code ${status}`) as Error & {
        code: string;
        config: unknown;
        request: unknown;
        response: unknown;
        status: number;
      };
      error.name = 'AxiosError';
      error.code = 'ERR_BAD_REQUEST';
      error.status = status;
      error.config = {
        url: `https://api.example.com/api/urls?token=${encodeURIComponent('SECRET-SIGNATURE')}`,
        data: JSON.stringify({ original_url: SIGNED_ORIGINAL_URL })
      };
      error.request = { responseURL: SIGNED_ORIGINAL_URL };
      error.response = {
        status,
        data: { message, original_url: SIGNED_ORIGINAL_URL }
      };
      return error;
    }

    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    function expectSafeConsoleContext(label: string) {
      expect(consoleError).toHaveBeenCalledTimes(1);
      const [loggedLabel, loggedContext] = consoleError.mock.calls[0];
      expect(loggedLabel).toBe(label);
      expect(loggedContext).toEqual({ name: 'AxiosError', code: 'ERR_BAD_REQUEST', status: 422 });
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('SECRET-SIGNATURE');
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('blob.example.com');
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('original_url');
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('Request failed with status');
    }

    it('logs only safe context and keeps the extracted message when fetchUrls fails', async () => {
      const error = buildAxiosError(422, 'List rejected');
      vi.mocked(apiService.getUrls).mockRejectedValue(error);
      const store = useUrlStore();

      await store.fetchUrls();

      expectSafeConsoleContext('Error fetching URLs:');
      expect(store.error).toBe('List rejected');
      expect(store.listError).toBe('List rejected');
    });

    it('logs only safe context and keeps the extracted message when fetchUrl fails', async () => {
      vi.mocked(apiService.getUrl).mockRejectedValue(buildAxiosError(422, 'Detail rejected'));
      const store = useUrlStore();

      await store.fetchUrl('url-1');

      expectSafeConsoleContext('Error fetching URL:');
      expect(store.error).toBe('Detail rejected');
    });

    it('logs only safe context and rethrows the original error when createUrl fails', async () => {
      const error = buildAxiosError(422, 'Create rejected');
      vi.mocked(apiService.createUrl).mockRejectedValue(error);
      const store = useUrlStore();

      await expect(store.createUrl({ original_url: SIGNED_ORIGINAL_URL })).rejects.toBe(error);

      expectSafeConsoleContext('Error creating URL:');
      expect(store.error).toBe('Create rejected');
    });

    it('logs only safe context and rethrows the original error when updateUrl fails', async () => {
      const error = buildAxiosError(422, 'Update rejected');
      vi.mocked(apiService.updateUrl).mockRejectedValue(error);
      const store = useUrlStore();

      await expect(store.updateUrl('url-1', { original_url: SIGNED_ORIGINAL_URL })).rejects.toBe(error);

      expectSafeConsoleContext('Error updating URL:');
      expect(store.error).toBe('Update rejected');
    });

    it('logs only safe context and rethrows the original error when deleteUrl fails', async () => {
      const error = buildAxiosError(422, 'Delete rejected');
      vi.mocked(apiService.deleteUrl).mockRejectedValue(error);
      const store = useUrlStore();

      await expect(store.deleteUrl('url-1')).rejects.toBe(error);

      expectSafeConsoleContext('Error deleting URL:');
      expect(store.error).toBe('Delete rejected');
    });

    it('logs only safe context and rethrows the original error when archiveUrl fails', async () => {
      const error = buildAxiosError(422, 'Archive rejected');
      vi.mocked(apiService.updateUrl).mockRejectedValue(error);
      const store = useUrlStore();

      await expect(store.archiveUrl('url-1')).rejects.toBe(error);

      expectSafeConsoleContext('Error archiveing URL:');
      expect(store.error).toBe('Archive rejected');
    });

    it('logs only safe context and rethrows the original error when restoreUrl fails', async () => {
      const error = buildAxiosError(422, 'Restore rejected');
      vi.mocked(apiService.updateUrl).mockRejectedValue(error);
      const store = useUrlStore();

      await expect(store.restoreUrl('url-1')).rejects.toBe(error);

      expectSafeConsoleContext('Error restoreing URL:');
      expect(store.error).toBe('Restore rejected');
    });
  });
});
