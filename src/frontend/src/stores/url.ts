import { defineStore } from 'pinia';
import type { UrlResponse, PaginatedResponse } from '@/types';
import apiService from '@/services/api';

interface UrlState {
  urls: UrlResponse[];
  currentUrl: UrlResponse | null;
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export const useUrlStore = defineStore('url', {
  state: (): UrlState => ({
    urls: [],
    currentUrl: null,
    loading: false,
    error: null,
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      total_pages: 0
    }
  }),

  actions: {
    async fetchUrls(page: number = 1, limit: number = 20) {
      this.loading = true;
      this.error = null;
      
      try {
        const response: PaginatedResponse<UrlResponse> = await apiService.getUrls(page, limit);
        this.urls = response.data;
        this.pagination = response.pagination;
      } catch (error: any) {
        this.error = error.response?.data?.message || 'Failed to fetch URLs';
        console.error('Error fetching URLs:', error);
      } finally {
        this.loading = false;
      }
    },

    async fetchUrl(id: string) {
      this.loading = true;
      this.error = null;
      
      try {
        this.currentUrl = await apiService.getUrl(id);
      } catch (error: any) {
        this.error = error.response?.data?.message || 'Failed to fetch URL';
        console.error('Error fetching URL:', error);
      } finally {
        this.loading = false;
      }
    },

    async createUrl(data: { original_url: string; short_code?: string; title?: string; description?: string }) {
      this.loading = true;
      this.error = null;
      
      try {
        const newUrl = await apiService.createUrl(data);
        this.urls.unshift(newUrl);
        return newUrl;
      } catch (error: any) {
        this.error = error.response?.data?.message || 'Failed to create short URL';
        console.error('Error creating URL:', error);
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async updateUrl(id: string, data: any) {
      this.loading = true;
      this.error = null;
      
      try {
        const updatedUrl = await apiService.updateUrl(id, data);
        const index = this.urls.findIndex(u => u.id === id);
        if (index !== -1) {
          this.urls[index] = updatedUrl;
        }
        if (this.currentUrl?.id === id) {
          this.currentUrl = updatedUrl;
        }
        return updatedUrl;
      } catch (error: any) {
        this.error = error.response?.data?.message || 'Failed to update URL';
        console.error('Error updating URL:', error);
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async deleteUrl(id: string) {
      this.loading = true;
      this.error = null;
      
      try {
        await apiService.deleteUrl(id);
        this.urls = this.urls.filter(u => u.id !== id);
        if (this.currentUrl?.id === id) {
          this.currentUrl = null;
        }
      } catch (error: any) {
        this.error = error.response?.data?.message || 'Failed to delete URL';
        console.error('Error deleting URL:', error);
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async archiveUrl(id: string) {
      this.loading = true;
      this.error = null;
      
      try {
        const updatedUrl = await apiService.updateUrl(id, { is_active: false });
        const index = this.urls.findIndex(u => u.id === id);
        if (index !== -1) {
          this.urls[index] = updatedUrl;
        }
        if (this.currentUrl?.id === id) {
          this.currentUrl = updatedUrl;
        }
        return updatedUrl;
      } catch (error: any) {
        this.error = error.response?.data?.message || 'Failed to archive URL';
        console.error('Error archiving URL:', error);
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async restoreUrl(id: string) {
      this.loading = true;
      this.error = null;
      
      try {
        const updatedUrl = await apiService.updateUrl(id, { is_active: true });
        const index = this.urls.findIndex(u => u.id === id);
        if (index !== -1) {
          this.urls[index] = updatedUrl;
        }
        if (this.currentUrl?.id === id) {
          this.currentUrl = updatedUrl;
        }
        return updatedUrl;
      } catch (error: any) {
        this.error = error.response?.data?.message || 'Failed to restore URL';
        console.error('Error restoring URL:', error);
        throw error;
      } finally {
        this.loading = false;
      }
    },

    clearError() {
      this.error = null;
    }
  }
});
