import { defineStore } from 'pinia';
import type { CreateUrlRequest, PaginatedResponse, UpdateUrlRequest, UrlResponse } from '@/types';
import apiService from '@/services/api';
import { extractErrorMessage } from '@/utils/format';
import { toSafeErrorContext } from '@/utils/safeError';

interface ListRequestTarget {
  page: number;
  limit: number;
}

interface UrlState {
  urls: UrlResponse[];
  currentUrl: UrlResponse | null;
  /** Generic loading flag kept for backwards compatibility with existing consumers. */
  loading: boolean;
  /** Generic error kept for backwards compatibility; every action writes it. */
  error: string | null;
  /** Loading flag for the paginated list only - mutations never touch it. */
  listLoading: boolean;
  /** Error for the paginated list only - mutation failures never overwrite it. */
  listError: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
  /** Monotonic id handed to each list fetch; only the newest id may write state. */
  listRequestId: number;
  /** List fetches with an id at or below this watermark were invalidated by a mutation. */
  listStaleBefore: number;
  /** How many list fetches are currently in flight. */
  listPending: number;
  /** Page/limit the newest in-flight list fetch is targeting. */
  listPendingRequest: ListRequestTarget | null;
}

type CreateUrlPayload = Omit<CreateUrlRequest, 'short_code'> & { short_code?: string };

/**
 * URL list + mutation store.
 *
 * List reads and mutations are deliberately isolated:
 * - `listLoading`/`listError` describe the paginated list only, so an archive or
 *   create can never blank the table or replace a list error.
 * - Every list fetch carries a monotonic id. A response may only write state when
 *   its id is still the newest AND has not been invalidated by a mutation that
 *   landed while it was in flight, which is what stops an out-of-order page
 *   response from resurrecting stale rows.
 */
export const useUrlStore = defineStore('url', {
  state: (): UrlState => ({
    urls: [],
    currentUrl: null,
    loading: false,
    error: null,
    listLoading: false,
    listError: null,
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      total_pages: 0
    },
    listRequestId: 0,
    listStaleBefore: 0,
    listPending: 0,
    listPendingRequest: null
  }),

  actions: {
    /**
     * Marks every in-flight list fetch as stale and returns the newest one's target,
     * so the caller can re-request the exact page whose response was dropped.
     */
    invalidateListFetches(): ListRequestTarget | null {
      const pending = this.listPending > 0 ? this.listPendingRequest : null;
      this.listStaleBefore = this.listRequestId;
      return pending ? { ...pending } : null;
    },

    async fetchUrls(page: number = 1, limit: number = 20) {
      const requestId = ++this.listRequestId;
      const isStale = (): boolean => requestId !== this.listRequestId || requestId <= this.listStaleBefore;

      this.listPending += 1;
      this.listPendingRequest = { page, limit };
      this.listLoading = true;
      this.loading = true;
      this.listError = null;
      this.error = null;

      try {
        const response: PaginatedResponse<UrlResponse> = await apiService.getUrls(page, limit);
        if (isStale()) {
          return;
        }
        this.urls = response.data;
        this.pagination = response.pagination;
      } catch (error: unknown) {
        if (isStale()) {
          return;
        }
        const message = extractErrorMessage(error, 'Failed to fetch URLs');
        this.listError = message;
        this.error = message;
        console.error('Error fetching URLs:', toSafeErrorContext(error));
      } finally {
        this.listPending = Math.max(0, this.listPending - 1);
        if (this.listPending === 0) {
          this.listLoading = false;
          this.loading = false;
          this.listPendingRequest = null;
        }
      }
    },

    async fetchUrl(id: string) {
      this.loading = true;
      this.error = null;

      try {
        this.currentUrl = await apiService.getUrl(id);
      } catch (error: unknown) {
        this.error = extractErrorMessage(error, 'Failed to fetch URL');
        console.error('Error fetching URL:', toSafeErrorContext(error));
      } finally {
        this.loading = false;
      }
    },

    async createUrl(data: CreateUrlPayload) {
      this.error = null;

      try {
        const newUrl = await apiService.createUrl(data as CreateUrlRequest);
        const droppedFetch = this.invalidateListFetches();

        // A created URL always belongs at the top of page 1. When the displayed
        // page is not page 1 - or when a list fetch was racing this create - the
        // server is the only honest source for what page 1 now contains.
        if (droppedFetch || this.pagination.page > 1) {
          await this.fetchUrls(1, this.pagination.limit);
          return newUrl;
        }

        this.urls = [newUrl, ...this.urls];
        this.pagination.total += 1;
        this.pagination.total_pages = Math.ceil(this.pagination.total / this.pagination.limit);
        if (this.urls.length > this.pagination.limit) {
          this.urls.pop();
        }
        return newUrl;
      } catch (error: unknown) {
        this.error = extractErrorMessage(error, 'Failed to create short URL');
        console.error('Error creating URL:', toSafeErrorContext(error));
        throw error;
      }
    },

    async updateUrl(id: string, data: UpdateUrlRequest) {
      this.error = null;

      try {
        const updatedUrl = await apiService.updateUrl(id, data);
        const droppedFetch = this.invalidateListFetches();
        this.applyUpdatedUrl(id, updatedUrl);
        if (droppedFetch) {
          await this.fetchUrls(droppedFetch.page, droppedFetch.limit);
        }
        return updatedUrl;
      } catch (error: unknown) {
        this.error = extractErrorMessage(error, 'Failed to update URL');
        console.error('Error updating URL:', toSafeErrorContext(error));
        throw error;
      }
    },

    async deleteUrl(id: string) {
      this.error = null;

      try {
        await apiService.deleteUrl(id);
        const droppedFetch = this.invalidateListFetches();
        this.urls = this.urls.filter(u => u.id !== id);
        this.pagination.total = Math.max(0, this.pagination.total - 1);
        this.pagination.total_pages =
          this.pagination.total === 0 ? 0 : Math.ceil(this.pagination.total / this.pagination.limit);

        // Deleting the last row on the final page can drop total_pages below the
        // page currently on screen (e.g. the sole row on page N). The server is
        // the only honest source for what the new final page actually contains,
        // so it must be re-fetched immediately - never leave a locally clamped
        // page number whose rows/metadata no longer match. A page 0 (empty
        // account) needs no fetch at all.
        const needsFinalPageRefetch =
          !droppedFetch && this.pagination.total_pages > 0 && this.pagination.page > this.pagination.total_pages;
        if (this.pagination.page > this.pagination.total_pages && this.pagination.total_pages > 0) {
          this.pagination.page = this.pagination.total_pages;
        }
        if (this.currentUrl?.id === id) {
          this.currentUrl = null;
        }
        if (droppedFetch) {
          await this.fetchUrls(droppedFetch.page, droppedFetch.limit);
        } else if (needsFinalPageRefetch) {
          await this.fetchUrls(this.pagination.page, this.pagination.limit);
        }
      } catch (error: unknown) {
        this.error = extractErrorMessage(error, 'Failed to delete URL');
        console.error('Error deleting URL:', toSafeErrorContext(error));
        throw error;
      }
    },

    async archiveUrl(id: string) {
      return this.updateUrlActiveStatus(id, false, 'archive');
    },

    async restoreUrl(id: string) {
      return this.updateUrlActiveStatus(id, true, 'restore');
    },

    async updateUrlActiveStatus(id: string, isActive: boolean, action: string) {
      this.error = null;

      try {
        const updatedUrl = await apiService.updateUrl(id, { is_active: isActive });
        const droppedFetch = this.invalidateListFetches();
        this.applyUpdatedUrl(id, updatedUrl);
        if (droppedFetch) {
          await this.fetchUrls(droppedFetch.page, droppedFetch.limit);
        }
        return updatedUrl;
      } catch (error: unknown) {
        this.error = extractErrorMessage(error, `Failed to ${action} URL`);
        console.error(`Error ${action}ing URL:`, toSafeErrorContext(error));
        throw error;
      }
    },

    /** Replaces a row in place (and `currentUrl` when it matches) without touching list state. */
    applyUpdatedUrl(id: string, updatedUrl: UrlResponse) {
      const index = this.urls.findIndex(u => u.id === id);
      if (index !== -1) {
        this.urls[index] = updatedUrl;
      }
      if (this.currentUrl?.id === id) {
        this.currentUrl = updatedUrl;
      }
    },

    clearError() {
      this.error = null;
    }
  }
});
