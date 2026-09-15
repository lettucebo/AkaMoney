import { defineStore } from 'pinia';
import type {
  CreateUrlRequest,
  UpdateUrlRequest,
  UrlListQueryState,
  UrlListResponse,
  UrlResponse,
  UrlStatusCounts
} from '@/types';
import apiService from '@/services/api';
import { extractErrorMessage } from '@/utils/format';
import { toSafeErrorContext } from '@/utils/safeError';
import { DEFAULT_URL_LIST_QUERY, isDefaultUrlListView } from '@/utils/urlListQuery';

interface ListRequestTarget extends UrlListQueryState {
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
  /** The search/status/sort/page the currently displayed list was fetched with. */
  query: UrlListQueryState;
  /** Account-wide status totals for the current search, from the server. */
  counts: UrlStatusCounts;
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
  /** Query the newest in-flight list fetch is targeting. */
  listPendingRequest: ListRequestTarget | null;
}

type CreateUrlPayload = Omit<CreateUrlRequest, 'short_code'> & { short_code?: string };

const emptyCounts = (): UrlStatusCounts => ({ all: 0, active: 0, expired: 0, archived: 0 });

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
 *
 * Search, status filtering and sorting are server-side: `query` is sent with
 * every fetch and the response is authoritative for which rows belong on the
 * page, in what order, and what the status counts are. That is why every
 * successful mutation ends in a *silent* refetch (`refreshList`) - an edit can
 * move a row out of the current search, or reorder it under the "recently
 * updated" sort, and only the server knows what fills the gap.
 */
export const useUrlStore = defineStore('url', {
  state: (): UrlState => ({
    urls: [],
    currentUrl: null,
    loading: false,
    error: null,
    listLoading: false,
    listError: null,
    query: { ...DEFAULT_URL_LIST_QUERY },
    counts: emptyCounts(),
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

  getters: {
    /**
     * True when nothing narrows or reorders the result set.
     *
     * Only in this view is a locally prepended row guaranteed to actually
     * belong at the top of the server's page 1.
     */
    isDefaultView: (state): boolean => isDefaultUrlListView(state.query)
  },

  actions: {
    /**
     * Marks every in-flight list fetch as stale and returns the newest one's target,
     * so the caller can re-request the exact query whose response was dropped.
     */
    invalidateListFetches(): ListRequestTarget | null {
      const pending = this.listPending > 0 ? this.listPendingRequest : null;
      this.listStaleBefore = this.listRequestId;
      return pending ? { ...pending } : null;
    },

    /** The query + limit a refetch should replay. */
    currentTarget(): ListRequestTarget {
      return { ...this.query, limit: this.pagination.limit };
    },

    /**
     * Fetches a page of URLs for the given query.
     *
     * `silent` keeps the current rows and skips the loading flags. It is used for
     * post-mutation reconciliation so the table never blanks out, while the
     * response still passes through the same staleness guard.
     */
    async fetchUrls(target: Partial<ListRequestTarget> = {}, options: { silent?: boolean } = {}) {
      const request: ListRequestTarget = { ...this.currentTarget(), ...target };
      const silent = options.silent === true;
      const requestId = ++this.listRequestId;
      const isStale = (): boolean => requestId !== this.listRequestId || requestId <= this.listStaleBefore;

      this.listPending += 1;
      this.listPendingRequest = request;
      if (!silent) {
        this.listLoading = true;
        this.loading = true;
        this.listError = null;
        this.error = null;
      }

      const { limit, ...query } = request;
      this.query = query;

      try {
        const response: UrlListResponse = await apiService.getUrls(query, limit);
        if (isStale()) {
          return;
        }
        this.urls = response.data;
        this.pagination = response.pagination;
        this.counts = response.counts ?? emptyCounts();
        // The server clamps a page past the end of the result set, so the
        // effective page is whatever came back - never what was requested.
        this.query = { ...query, page: response.pagination.page };
      } catch (error: unknown) {
        if (isStale()) {
          return;
        }
        const message = extractErrorMessage(error, 'Failed to fetch URLs');
        // A silent refresh must not replace a rendered table with an error
        // banner; the visible rows stay and the failure is reported generically.
        if (!silent) {
          this.listError = message;
        }
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

    /**
     * Re-fetches the current page without any loading state.
     *
     * Called after every successful mutation, because membership, ordering and
     * the status counts are all server-owned once search/status/sort apply.
     */
    async refreshList(target?: ListRequestTarget) {
      await this.fetchUrls(target ?? this.currentTarget(), { silent: true });
    },

    /** Applies new filter values and returns to page 1 (results shift underneath). */
    async applyQuery(next: Partial<UrlListQueryState>) {
      await this.fetchUrls({ ...next, page: next.page ?? 1 });
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

        // A created URL only belongs at the top in the unfiltered, default-sorted
        // first page. Under any search, status filter or sort it may not belong
        // on this page at all, so prepending would be a lie - the silent refresh
        // below settles it either way.
        if (!droppedFetch && this.isDefaultView) {
          this.urls = [newUrl, ...this.urls];
          if (this.urls.length > this.pagination.limit) {
            this.urls.pop();
          }
        }

        await this.refreshList(droppedFetch ?? undefined);
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
        await this.refreshList(droppedFetch ?? undefined);
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
        if (this.currentUrl?.id === id) {
          this.currentUrl = null;
        }

        // Deleting the last row on the final page can drop the page count below
        // the page on screen. The server clamps the requested page against the
        // new total and reports the effective one, so replaying the same request
        // is enough - no local page arithmetic is needed.
        await this.refreshList(droppedFetch ?? undefined);
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
        await this.refreshList(droppedFetch ?? undefined);
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
