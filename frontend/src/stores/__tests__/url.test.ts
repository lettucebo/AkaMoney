import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUrlStore } from '../url';
import apiService from '@/services/api';

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
          { id: '1', short_code: 'abc', original_url: 'https://example.com', is_active: true, click_count: 0 }
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
      const result = await store.createUrl({ original_url: 'https://new.com' });
      
      expect(result).toEqual(newUrl);
      expect(store.urls[0]).toEqual(newUrl);
    });

    it('should handle create URL error', async () => {
      const mockError = { response: { data: { message: 'Invalid URL' } } };
      vi.mocked(apiService.createUrl).mockRejectedValue(mockError);
      
      const store = useUrlStore();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await expect(store.createUrl({ original_url: 'invalid' })).rejects.toEqual(mockError);
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
      
      await store.deleteUrl('1');
      
      expect(store.urls).toEqual([]);
      expect(store.currentUrl).toBeNull();
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

  describe('clearError', () => {
    it('should clear error', () => {
      const store = useUrlStore();
      store.error = 'Some error';
      
      store.clearError();
      
      expect(store.error).toBeNull();
    });
  });
});
