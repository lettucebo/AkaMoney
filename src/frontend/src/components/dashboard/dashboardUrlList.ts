/**
 * Pure, framework-free helpers for the dashboard's current-page URL list.
 *
 * Everything here operates on whatever page `useUrlStore` already has loaded
 * (`urlStore.urls`). The list API only supports `page`/`limit` pagination
 * today, so search/status/sort can only ever act on the current page -
 * implying a global/account-wide query here would be dishonest UX.
 */
import type { UrlResponse } from '@/types';

export type LinkStatus = 'on' | 'off' | 'exp';

/** Derives a 3-state visual status from `is_active` + `expires_at`. */
export function getLinkStatus(url: UrlResponse, now: number = Date.now()): LinkStatus {
  if (!url.is_active) {
    return 'off';
  }
  if (typeof url.expires_at === 'number' && url.expires_at < now) {
    return 'exp';
  }
  return 'on';
}

export type StatusFilter = 'all' | 'active' | 'archived';
export type SortOption = 'default' | 'clicks-desc' | 'clicks-asc';

export interface StatusCounts {
  all: number;
  active: number;
  archived: number;
  /**
   * Links that are unarchived but past their expiry. The redirect worker answers
   * 410 for these (src/redirect/src/index.ts), so they are never counted as active.
   * The toolbar has no expired tab today; the count exists so `active` stays honest.
   */
  expired: number;
}

/**
 * Counts all/active/archived/expired links among the given (current-page) urls only.
 *
 * `active` means "actually redirecting" (`getLinkStatus` === 'on'), so an expired
 * link is never counted as active even though its `is_active` flag is still set.
 */
export function statusCounts(urls: UrlResponse[], now: number = Date.now()): StatusCounts {
  const counts: StatusCounts = { all: urls.length, active: 0, archived: 0, expired: 0 };
  for (const url of urls) {
    const status = getLinkStatus(url, now);
    if (status === 'on') {
      counts.active += 1;
    } else if (status === 'off') {
      counts.archived += 1;
    } else {
      counts.expired += 1;
    }
  }
  return counts;
}

export interface UrlListFilters {
  status: StatusFilter;
  search: string;
  sort: SortOption;
}

export interface UrlListResult {
  /** The rows to render after status/search filtering and sorting. */
  visible: UrlResponse[];
  /** How many rows matched status+search, before sorting (for the "no results" check). */
  matchingCount: number;
  /** Status counts for the whole current page, unaffected by the active filters. */
  counts: StatusCounts;
}

const matchesSearch = (url: UrlResponse, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return (
    url.short_code.toLowerCase().includes(q) ||
    url.original_url.toLowerCase().includes(q) ||
    (url.title ?? '').toLowerCase().includes(q)
  );
};

/**
 * Filters and sorts the current page of urls for display.
 *
 * `counts` always reflects the whole current page (ignoring the active
 * status/search filters) so toolbar tabs can show honest per-tab totals.
 *
 * Status filtering uses `getLinkStatus`, so 'active' is strictly "still
 * redirecting" and 'archived' is strictly "unarchived = false". Expired links
 * belong to neither tab; they remain visible under 'all'. A single `now` is
 * threaded through so counts and filtering can never disagree mid-render.
 */
export function deriveVisibleUrls(
  urls: UrlResponse[],
  filters: UrlListFilters,
  now: number = Date.now()
): UrlListResult {
  const counts = statusCounts(urls, now);

  let filtered = urls;
  if (filters.status === 'active') {
    filtered = filtered.filter((u) => getLinkStatus(u, now) === 'on');
  } else if (filters.status === 'archived') {
    filtered = filtered.filter((u) => getLinkStatus(u, now) === 'off');
  }
  filtered = filtered.filter((u) => matchesSearch(u, filters.search));

  const matchingCount = filtered.length;

  let visible = filtered;
  if (filters.sort === 'clicks-desc') {
    visible = [...filtered].sort((a, b) => b.click_count - a.click_count);
  } else if (filters.sort === 'clicks-asc') {
    visible = [...filtered].sort((a, b) => a.click_count - b.click_count);
  }

  return { visible, matchingCount, counts };
}
