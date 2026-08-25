import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useUrlStore } from '../url';
import apiService from '@/services/api';
import type { PaginatedResponse, UrlResponse } from '@/types';

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
  pagination: Partial<PaginatedResponse<UrlResponse>['pagination']> = {}
): PaginatedResponse<UrlResponse> {
  return {
    data: urls,
    pagination: { page: 1, limit: 20, total: urls.length, total_pages: 1, ...pagination }
  };
}

describe('URL Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
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
      const mockResponse = {
        data: [
          {
            id: '1',
            short_code: 'abc',
            original_url: 'https://example.com',
            short_url: 'https://aka.money/abc',
            created_at: 1700000000000,
            updated_at: 1700000000000,
            is_active: true,
            click_count: 0
          }
        ],
        pagination: { page: 1, limit: 20, total: 1, total_pages: 1 }
      };
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
      
      // Suppress console.error
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await store.fetchUrls();
      
      expect(store.error).toBe('Failed to fetch');
      expect(store.loading).toBe(false);
    });

    it('should set loading state during fetch', async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => { resolvePromise = resolve; });
      vi.mocked(apiService.getUrls).mockReturnValue(promise as any);
      
      const store = useUrlStore();
      const fetchPromise = store.fetchUrls();
      
      expect(store.loading).toBe(true);
      
      resolvePromise!({ data: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } });
      await fetchPromise;
      
      expect(store.loading).toBe(false);
    });
  });

  describe('fetchUrl', () => {
    it('should fetch single URL successfully', async () => {
      const mockUrl = { id: '1', short_code: 'abc', original_url: 'https://example.com', is_active: true, click_count: 5 };
      vi.mocked(apiService.getUrl).mockResolvedValue(mockUrl as any);
      
      const store = useUrlStore();
      await store.fetchUrl('1');
      
      expect(store.currentUrl).toEqual(mockUrl);
      expect(store.loading).toBe(false);
    });

    it('should handle fetch URL error', async () => {
      const mockError = { response: { data: { message: 'Not found' } } };
      vi.mocked(apiService.getUrl).mockRejectedValue(mockError);
      
      const store = useUrlStore();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await store.fetchUrl('notfound');
      
      expect(store.error).toBe('Not found');
    });
  });

  describe('createUrl', () => {
    it('should create URL successfully', async () => {
      const newUrl = { id: '2', short_code: 'xyz', original_url: 'https://new.com', is_active: true, click_count: 0 };
      vi.mocked(apiService.createUrl).mockResolvedValue(newUrl as any);
      
      const store = useUrlStore();
      store.pagination = { page: 1, limit: 1, total: 1, total_pages: 1 };
      store.urls = [{ id: '1', short_code: 'old', original_url: 'https://old.example' } as any];
      const result = await store.createUrl({ original_url: 'https://new.com', short_code: 'xyz' });
      
      expect(result).toEqual(newUrl);
      expect(store.urls[0]).toEqual(newUrl);
      expect(store.urls).toHaveLength(1);
      expect(store.pagination).toEqual({ page: 1, limit: 1, total: 2, total_pages: 2 });
    });

    it('should handle create URL error', async () => {
      const mockError = { response: { data: { message: 'Invalid URL' } } };
      vi.mocked(apiService.createUrl).mockRejectedValue(mockError);
      
      const store = useUrlStore();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await expect(store.createUrl({ original_url: 'invalid', short_code: 'xyz' })).rejects.toEqual(mockError);
      expect(store.error).toBe('Invalid URL');
    });
  });

  describe('updateUrl', () => {
    it('should update URL successfully', async () => {
      const existingUrl = { id: '1', short_code: 'abc', original_url: 'https://example.com', is_active: true, click_count: 0 };
      const updatedUrl = { ...existingUrl, title: 'New Title' };
      
      vi.mocked(apiService.updateUrl).mockResolvedValue(updatedUrl as any);
      
      const store = useUrlStore();
      store.urls = [existingUrl as any];
      store.currentUrl = existingUrl as any;
      
      const result = await store.updateUrl('1', { title: 'New Title' });
      
      expect(result.title).toBe('New Title');
      expect(store.urls[0].title).toBe('New Title');
      expect(store.currentUrl?.title).toBe('New Title');
    });

    it('should handle update URL error', async () => {
      const mockError = { response: { data: { message: 'Update failed' } } };
      vi.mocked(apiService.updateUrl).mockRejectedValue(mockError);
      
      const store = useUrlStore();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await expect(store.updateUrl('1', { title: 'New' })).rejects.toEqual(mockError);
      expect(store.error).toBe('Update failed');
    });
  });

  describe('deleteUrl', () => {
    it('should delete URL successfully', async () => {
      const existingUrl = { id: '1', short_code: 'abc', original_url: 'https://example.com' };
      vi.mocked(apiService.deleteUrl).mockResolvedValue(undefined);
      
      const store = useUrlStore();
      store.urls = [existingUrl as any];
      store.currentUrl = existingUrl as any;
      store.pagination = { page: 1, limit: 20, total: 1, total_pages: 1 };
      
      await store.deleteUrl('1');
      
      expect(store.urls).toEqual([]);
      expect(store.currentUrl).toBeNull();
      expect(store.pagination).toEqual({ page: 1, limit: 20, total: 0, total_pages: 0 });
    });

    it('refetches the new final page when deleting the sole row on the last page', async () => {
      vi.mocked(apiService.deleteUrl).mockResolvedValue(undefined);
      vi.mocked(apiService.getUrls).mockResolvedValue(
        buildPage([buildUrl({ id: 'last-of-prev-page' })], { page: 2, limit: 1, total: 2, total_pages: 2 })
      );

      const store = useUrlStore();
      store.urls = [buildUrl({ id: 'sole-row' })];
      store.pagination = { page: 3, limit: 1, total: 3, total_pages: 3 };

      await store.deleteUrl('sole-row');

      // Deleting the only row on page 3 drops total_pages to 2, so the store
      // must immediately fetch the new final page - not leave page 3 clamped
      // locally with rows/metadata that no longer match each other.
      expect(apiService.getUrls).toHaveBeenCalledWith(2, 1);
      expect(store.pagination).toEqual({ page: 2, limit: 1, total: 2, total_pages: 2 });
      expect(store.urls.map((u) => u.id)).toEqual(['last-of-prev-page']);
    });

    it('does not refetch when total becomes zero after deleting the only remaining row', async () => {
      vi.mocked(apiService.deleteUrl).mockResolvedValue(undefined);

      const store = useUrlStore();
      store.urls = [buildUrl({ id: 'only-row' })];
      store.pagination = { page: 1, limit: 20, total: 1, total_pages: 1 };

      await store.deleteUrl('only-row');

      expect(apiService.getUrls).not.toHaveBeenCalled();
      expect(store.urls).toEqual([]);
      expect(store.pagination).toEqual({ page: 1, limit: 20, total: 0, total_pages: 0 });
    });

    it('should handle delete URL error', async () => {
      const mockError = { response: { data: { message: 'Delete failed' } } };
      vi.mocked(apiService.deleteUrl).mockRejectedValue(mockError);
      
      const store = useUrlStore();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await expect(store.deleteUrl('1')).rejects.toEqual(mockError);
      expect(store.error).toBe('Delete failed');
    });
  });

  describe('archiveUrl', () => {
    it('should archive URL successfully', async () => {
      const existingUrl = { id: '1', short_code: 'abc', original_url: 'https://example.com', is_active: true, click_count: 10 };
      const archivedUrl = { ...existingUrl, is_active: false, updated_at: Date.now() };
      
      vi.mocked(apiService.updateUrl).mockResolvedValue(archivedUrl as any);
      
      const store = useUrlStore();
      store.urls = [existingUrl as any];
      store.currentUrl = existingUrl as any;
      
      const result = await store.archiveUrl('1');
      
      expect(result.is_active).toBe(false);
      expect(store.urls[0].is_active).toBe(false);
      expect(store.currentUrl?.is_active).toBe(false);
    });

    it('should handle archive URL error', async () => {
      const mockError = { response: { data: { message: 'Archive failed' } } };
      vi.mocked(apiService.updateUrl).mockRejectedValue(mockError);
      
      const store = useUrlStore();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await expect(store.archiveUrl('1')).rejects.toEqual(mockError);
      expect(store.error).toBe('Archive failed');
    });
  });

  describe('restoreUrl', () => {
    it('should restore URL successfully', async () => {
      const existingUrl = { id: '1', short_code: 'abc', original_url: 'https://example.com', is_active: false, click_count: 10 };
      const restoredUrl = { ...existingUrl, is_active: true, updated_at: Date.now() };
      
      vi.mocked(apiService.updateUrl).mockResolvedValue(restoredUrl as any);
      
      const store = useUrlStore();
      store.urls = [existingUrl as any];
      store.currentUrl = existingUrl as any;
      
      const result = await store.restoreUrl('1');
      
      expect(result.is_active).toBe(true);
      expect(store.urls[0].is_active).toBe(true);
      expect(store.currentUrl?.is_active).toBe(true);
    });

    it('should handle restore URL error', async () => {
      const mockError = { response: { data: { message: 'Restore failed' } } };
      vi.mocked(apiService.updateUrl).mockRejectedValue(mockError);
      
      const store = useUrlStore();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
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
      const updatedUrl = { id: '99', short_code: 'xx', original_url: 'https://x.com', is_active: true, click_count: 0 };
      vi.mocked(apiService.updateUrl).mockResolvedValue(updatedUrl as any);
      const store = useUrlStore();
      const result = await store.updateUrl('99', { title: 't' });
      expect(result).toEqual(updatedUrl);
      expect(store.urls).toEqual([]);
      expect(store.currentUrl).toBeNull();
    });

    it('updateUrl does not mutate currentUrl when ids differ', async () => {
      const existing = { id: '1', short_code: 'abc', original_url: 'https://example.com', is_active: true, click_count: 0 };
      const otherCurrent = { id: '2', short_code: 'def', original_url: 'https://other.com', is_active: true, click_count: 0 };
      const updated = { ...existing, title: 'New' };
      vi.mocked(apiService.updateUrl).mockResolvedValue(updated as any);
      const store = useUrlStore();
      store.urls = [existing as any];
      store.currentUrl = otherCurrent as any;
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
      const other = { id: '2', short_code: 'def', original_url: 'https://other.com' };
      vi.mocked(apiService.deleteUrl).mockResolvedValue(undefined);
      const store = useUrlStore();
      store.urls = [{ id: '1', short_code: 'abc', original_url: 'https://example.com' } as any];
      store.currentUrl = other as any;
      await store.deleteUrl('1');
      expect(store.urls).toEqual([]);
      expect(store.currentUrl?.id).toBe('2');
    });

    it('updateUrlActiveStatus (via archive) succeeds when URL is not in list and currentUrl is null', async () => {
      const updated = { id: '99', short_code: 'zz', original_url: 'https://z.com', is_active: false, click_count: 0 };
      vi.mocked(apiService.updateUrl).mockResolvedValue(updated as any);
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
      const listFetch = deferred<PaginatedResponse<UrlResponse>>();
      vi.mocked(apiService.getUrls).mockReturnValue(listFetch.promise);
      const store = useUrlStore();

      const listPromise = store.fetchUrls(1, 20);
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
      const firstPage = deferred<PaginatedResponse<UrlResponse>>();
      const secondPage = deferred<PaginatedResponse<UrlResponse>>();
      vi.mocked(apiService.getUrls)
        .mockReturnValueOnce(firstPage.promise)
        .mockReturnValueOnce(secondPage.promise);
      const store = useUrlStore();

      const firstPromise = store.fetchUrls(1, 20);
      const secondPromise = store.fetchUrls(2, 20);

      secondPage.resolve(buildPage([buildUrl({ id: 'p2' })], { page: 2, total: 45, total_pages: 3 }));
      await secondPromise;
      firstPage.resolve(buildPage([buildUrl({ id: 'p1' })], { page: 1, total: 45, total_pages: 3 }));
      await firstPromise;

      expect(store.urls.map((u) => u.id)).toEqual(['p2']);
      expect(store.pagination).toEqual({ page: 2, limit: 20, total: 45, total_pages: 3 });
      expect(store.listLoading).toBe(false);
    });

    it('does not surface a stale page failure once a newer page fetch has landed', async () => {
      const firstPage = deferred<PaginatedResponse<UrlResponse>>();
      const secondPage = deferred<PaginatedResponse<UrlResponse>>();
      vi.mocked(apiService.getUrls)
        .mockReturnValueOnce(firstPage.promise)
        .mockReturnValueOnce(secondPage.promise);
      const store = useUrlStore();

      const firstPromise = store.fetchUrls(1, 20);
      const secondPromise = store.fetchUrls(2, 20);

      secondPage.resolve(buildPage([buildUrl({ id: 'p2' })], { page: 2 }));
      await secondPromise;
      firstPage.reject({ response: { data: { message: '舊頁面失敗' } } });
      await firstPromise;

      expect(store.listError).toBeNull();
      expect(store.urls.map((u) => u.id)).toEqual(['p2']);
    });

    it('optimistically prepends a created url on page 1 without any refetch', async () => {
      vi.mocked(apiService.getUrls).mockResolvedValue(buildPage([buildUrl({ id: 'old' })]));
      const store = useUrlStore();
      await store.fetchUrls(1, 20);
      vi.mocked(apiService.getUrls).mockClear();

      const created = buildUrl({ id: 'new', short_code: 'new-link' });
      vi.mocked(apiService.createUrl).mockResolvedValue(created);
      await store.createUrl({ original_url: 'https://example.com/target', short_code: 'new-link' });

      expect(apiService.getUrls).not.toHaveBeenCalled();
      expect(store.urls.map((u) => u.id)).toEqual(['new', 'old']);
      expect(store.pagination).toEqual({ page: 1, limit: 20, total: 2, total_pages: 1 });
    });

    it('refetches page 1 after a create that raced a pending list fetch and ignores the stale page', async () => {
      const pendingFetch = deferred<PaginatedResponse<UrlResponse>>();
      const refetch = deferred<PaginatedResponse<UrlResponse>>();
      vi.mocked(apiService.getUrls)
        .mockReturnValueOnce(pendingFetch.promise)
        .mockReturnValueOnce(refetch.promise);
      const created = buildUrl({ id: 'new', short_code: 'new-link' });
      vi.mocked(apiService.createUrl).mockResolvedValue(created);
      const store = useUrlStore();

      const listPromise = store.fetchUrls(1, 20);
      const createPromise = store.createUrl({ original_url: 'https://example.com/target', short_code: 'new-link' });
      await flushPromises();

      refetch.resolve(buildPage([created, buildUrl({ id: 'old' })], { page: 1, total: 2, total_pages: 1 }));
      await createPromise;

      pendingFetch.resolve(buildPage([buildUrl({ id: 'stale' })], { page: 1, total: 1, total_pages: 1 }));
      await listPromise;

      expect(apiService.getUrls).toHaveBeenCalledTimes(2);
      expect(apiService.getUrls).toHaveBeenLastCalledWith(1, 20);
      expect(store.urls.map((u) => u.id)).toEqual(['new', 'old']);
      expect(store.pagination).toEqual({ page: 1, limit: 20, total: 2, total_pages: 1 });
      expect(store.listLoading).toBe(false);
    });

    it('refetches page 1 instead of prepending when creating from a later page', async () => {
      const store = useUrlStore();
      store.urls = [buildUrl({ id: 'p2-a' })];
      store.pagination = { page: 2, limit: 20, total: 45, total_pages: 3 };

      vi.mocked(apiService.getUrls).mockResolvedValue(
        buildPage([buildUrl({ id: 'new' }), buildUrl({ id: 'p1-a' })], { page: 1, total: 46, total_pages: 3 })
      );
      vi.mocked(apiService.createUrl).mockResolvedValue(buildUrl({ id: 'new' }));

      await store.createUrl({ original_url: 'https://example.com/target', short_code: 'new-link' });

      expect(apiService.getUrls).toHaveBeenCalledWith(1, 20);
      expect(store.urls.map((u) => u.id)).toEqual(['new', 'p1-a']);
      expect(store.pagination).toEqual({ page: 1, limit: 20, total: 46, total_pages: 3 });
    });

    it('keeps an archived row when a list fetch that started earlier resolves later', async () => {
      const pendingFetch = deferred<PaginatedResponse<UrlResponse>>();
      const refetch = deferred<PaginatedResponse<UrlResponse>>();
      vi.mocked(apiService.getUrls)
        .mockReturnValueOnce(pendingFetch.promise)
        .mockReturnValueOnce(refetch.promise);
      const store = useUrlStore();
      store.urls = [buildUrl({ id: '1', is_active: true })];
      store.pagination = { page: 1, limit: 20, total: 1, total_pages: 1 };

      const listPromise = store.fetchUrls(1, 20);
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

    it('does not refetch after a mutation when no list fetch was in flight', async () => {
      const store = useUrlStore();
      store.urls = [buildUrl({ id: '1', is_active: false })];
      vi.mocked(apiService.updateUrl).mockResolvedValue(buildUrl({ id: '1', is_active: true }));

      await store.restoreUrl('1');

      expect(apiService.getUrls).not.toHaveBeenCalled();
      expect(store.urls[0].is_active).toBe(true);
    });

    it('refetches the page that was in flight, not the currently displayed page', async () => {      const pendingFetch = deferred<PaginatedResponse<UrlResponse>>();
      const refetch = deferred<PaginatedResponse<UrlResponse>>();
      vi.mocked(apiService.getUrls)
        .mockReturnValueOnce(pendingFetch.promise)
        .mockReturnValueOnce(refetch.promise);
      const store = useUrlStore();
      store.urls = [buildUrl({ id: '1' })];
      store.pagination = { page: 1, limit: 20, total: 45, total_pages: 3 };

      const listPromise = store.fetchUrls(3, 20);
      vi.mocked(apiService.updateUrl).mockResolvedValue(buildUrl({ id: '1', title: 'Updated' }));
      const updatePromise = store.updateUrl('1', { title: 'Updated' });
      await flushPromises();

      refetch.resolve(buildPage([buildUrl({ id: 'p3' })], { page: 3, total: 45, total_pages: 3 }));
      await updatePromise;
      pendingFetch.resolve(buildPage([buildUrl({ id: 'stale' })], { page: 3, total: 45, total_pages: 3 }));
      await listPromise;

      expect(apiService.getUrls).toHaveBeenLastCalledWith(3, 20);
      expect(store.urls.map((u) => u.id)).toEqual(['p3']);
    });

    it('refetches after a delete that raced a pending list fetch, dropping the stale page', async () => {
      const pendingFetch = deferred<PaginatedResponse<UrlResponse>>();
      const refetch = deferred<PaginatedResponse<UrlResponse>>();
      vi.mocked(apiService.getUrls)
        .mockReturnValueOnce(pendingFetch.promise)
        .mockReturnValueOnce(refetch.promise);
      const store = useUrlStore();
      store.urls = [buildUrl({ id: '1' }), buildUrl({ id: '2' })];
      store.pagination = { page: 1, limit: 20, total: 2, total_pages: 1 };

      const listPromise = store.fetchUrls(1, 20);
      vi.mocked(apiService.deleteUrl).mockResolvedValue(undefined);
      const deletePromise = store.deleteUrl('1');
      await flushPromises();

      refetch.resolve(buildPage([buildUrl({ id: '2' })], { page: 1, total: 1, total_pages: 1 }));
      await deletePromise;

      pendingFetch.resolve(buildPage([buildUrl({ id: '1' }), buildUrl({ id: '2' })], { page: 1, total: 2, total_pages: 1 }));
      await listPromise;

      expect(apiService.getUrls).toHaveBeenCalledTimes(2);
      expect(store.urls.map((u) => u.id)).toEqual(['2']);
      expect(store.pagination.total).toBe(1);
      expect(store.listLoading).toBe(false);
    });

    it('does not refetch after a delete when no list fetch was in flight', async () => {
      const store = useUrlStore();
      store.urls = [buildUrl({ id: '1' })];
      store.pagination = { page: 1, limit: 20, total: 1, total_pages: 1 };
      vi.mocked(apiService.deleteUrl).mockResolvedValue(undefined);

      await store.deleteUrl('1');

      expect(apiService.getUrls).not.toHaveBeenCalled();
      expect(store.urls).toEqual([]);
      expect(store.pagination).toEqual({ page: 1, limit: 20, total: 0, total_pages: 0 });
    });
  });
});
