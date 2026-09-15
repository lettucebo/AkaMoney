/**
 * In-memory implementation of `GET /api/urls` for `VITE_SKIP_AUTH` mode.
 *
 * This mirrors the D1 query in `src/backend/src/services/urlListQuery.ts` field
 * for field. UI development and screenshots run entirely against this path, so
 * any divergence here shows up as behavior that only exists in dev mode.
 */
import type { UrlListQueryState, UrlListResponse, UrlResponse, UrlStatusCounts } from '@/types';
import { getLinkStatus } from '@/components/dashboard/dashboardUrlList';

/**
 * Folds only ASCII letters, matching SQLite's `LOWER()`.
 *
 * `String.prototype.toLowerCase()` also folds non-ASCII (e.g. `İ`, `Σ`), which
 * D1 does not - using it here would make the mock match rows the real API
 * misses.
 */
export function asciiLower(value: string): string {
  return value.replace(/[A-Z]/g, (char) => char.toLowerCase());
}

const matchesSearch = (url: UrlResponse, term: string): boolean => {
  if (!term) {
    return true;
  }
  const needle = asciiLower(term);
  return (
    asciiLower(url.short_code).includes(needle) ||
    asciiLower(url.original_url).includes(needle) ||
    asciiLower(url.title ?? '').includes(needle)
  );
};

const matchesStatus = (url: UrlResponse, status: UrlListQueryState['status'], now: number): boolean => {
  if (status === 'all') {
    return true;
  }
  const linkStatus = getLinkStatus(url, now);
  if (status === 'active') {
    return linkStatus === 'on';
  }
  if (status === 'expired') {
    return linkStatus === 'exp';
  }
  return linkStatus === 'off';
};

/** Counts every status bucket for the given (already search-filtered) rows. */
export function countMockUrlStatuses(urls: UrlResponse[], now: number = Date.now()): UrlStatusCounts {
  const counts: UrlStatusCounts = { all: urls.length, active: 0, expired: 0, archived: 0 };
  for (const url of urls) {
    const status = getLinkStatus(url, now);
    if (status === 'on') {
      counts.active += 1;
    } else if (status === 'exp') {
      counts.expired += 1;
    } else {
      counts.archived += 1;
    }
  }
  return counts;
}

/** String comparison matching SQLite's BINARY collation on the `id` column. */
const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Comparators matching `buildUrlListOrderBy`, including the `id` tiebreaker
 * that keeps paging stable when two rows share a click count or timestamp.
 */
const COMPARATORS: Record<UrlListQueryState['sort'], (a: UrlResponse, b: UrlResponse) => number> = {
  default: (a, b) => b.created_at - a.created_at || compareIds(b.id, a.id),
  'created-asc': (a, b) => a.created_at - b.created_at || compareIds(a.id, b.id),
  'updated-desc': (a, b) => b.updated_at - a.updated_at || compareIds(b.id, a.id),
  'clicks-desc': (a, b) =>
    b.click_count - a.click_count || b.created_at - a.created_at || compareIds(b.id, a.id),
  'clicks-asc': (a, b) =>
    a.click_count - b.click_count || b.created_at - a.created_at || compareIds(b.id, a.id)
};

/**
 * Applies the full list query to an in-memory collection.
 *
 * Counts are computed from the search-filtered rows but before the status
 * filter, and the page is clamped against the filtered total, exactly as the
 * Admin API does.
 */
export function queryMockUrls(
  urls: UrlResponse[],
  state: UrlListQueryState,
  limit: number,
  now: number = Date.now()
): UrlListResponse {
  const searched = urls.filter((url) => matchesSearch(url, state.search));
  const counts = countMockUrlStatuses(searched, now);

  const filtered = searched.filter((url) => matchesStatus(url, state.status, now));
  const total = filtered.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const page = Math.min(Math.max(state.page, 1), Math.max(totalPages, 1));
  const offset = (page - 1) * limit;

  const sorted = [...filtered].sort(COMPARATORS[state.sort] ?? COMPARATORS.default);

  return {
    data: sorted.slice(offset, offset + limit),
    pagination: { page, limit, total, total_pages: totalPages },
    counts
  };
}
