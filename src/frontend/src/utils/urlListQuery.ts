/**
 * Pure helpers for the dashboard list query (search / status / sort / page).
 *
 * This module is the single translation layer between the three places the
 * query lives: the browser's query string, the Pinia store, and the Admin API
 * request. Serialization deliberately does NOT live in `services/api.ts` -
 * that file is excluded from coverage, so a dropped `search` parameter there
 * would silently pass every test.
 */
import type { UrlListQueryState, UrlListSort, UrlListStatus } from '@/types';

export const URL_LIST_STATUSES: readonly UrlListStatus[] = ['all', 'active', 'expired', 'archived'];
export const URL_LIST_SORTS: readonly UrlListSort[] = [
  'default',
  'clicks-desc',
  'clicks-asc',
  'created-asc',
  'updated-desc'
];

export const DEFAULT_URL_LIST_QUERY: UrlListQueryState = {
  page: 1,
  search: '',
  status: 'all',
  sort: 'default'
};

/** Route query values may be repeated or null; only a single string is usable. */
type RawQueryValue = string | null | (string | null)[] | undefined;

const firstString = (value: RawQueryValue): string => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' ? candidate : '';
};

const toPage = (value: RawQueryValue): number => {
  const parsed = parseInt(firstString(value), 10);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : DEFAULT_URL_LIST_QUERY.page;
};

/**
 * Reads a list query out of a route's query object.
 *
 * Unknown or malformed values fall back to defaults rather than propagating, so
 * a hand-edited or stale URL can never put the list into an unrepresentable
 * state.
 */
export function parseUrlListRouteQuery(query: Record<string, RawQueryValue> = {}): UrlListQueryState {
  const status = firstString(query.status) as UrlListStatus;
  const sort = firstString(query.sort) as UrlListSort;

  return {
    page: toPage(query.page),
    search: firstString(query.q).trim(),
    status: URL_LIST_STATUSES.includes(status) ? status : DEFAULT_URL_LIST_QUERY.status,
    sort: URL_LIST_SORTS.includes(sort) ? sort : DEFAULT_URL_LIST_QUERY.sort
  };
}

/**
 * Serializes a list query for the address bar, omitting defaults so a plain
 * dashboard visit keeps a clean `/dashboard` URL.
 */
export function toUrlListRouteQuery(state: UrlListQueryState): Record<string, string> {
  const query: Record<string, string> = {};

  if (state.search) {
    query.q = state.search;
  }
  if (state.status !== DEFAULT_URL_LIST_QUERY.status) {
    query.status = state.status;
  }
  if (state.sort !== DEFAULT_URL_LIST_QUERY.sort) {
    query.sort = state.sort;
  }
  if (state.page > 1) {
    query.page = String(state.page);
  }

  return query;
}

/** Serializes a list query for `GET /api/urls`, omitting defaults. */
export function toUrlListApiParams(
  state: UrlListQueryState,
  limit: number
): Record<string, string | number> {
  const params: Record<string, string | number> = { page: state.page, limit };

  if (state.search) {
    params.search = state.search;
  }
  if (state.status !== DEFAULT_URL_LIST_QUERY.status) {
    params.status = state.status;
  }
  if (state.sort !== DEFAULT_URL_LIST_QUERY.sort) {
    params.sort = state.sort;
  }

  return params;
}

/**
 * Compares two list queries.
 *
 * The route watcher uses this to drop no-op navigations, which is what stops a
 * user-initiated `push` from triggering a second, identical fetch.
 */
export function isSameUrlListQuery(a: UrlListQueryState, b: UrlListQueryState): boolean {
  return a.page === b.page && a.search === b.search && a.status === b.status && a.sort === b.sort;
}

/**
 * Whether anything narrows the result set.
 *
 * Sort and page are excluded on purpose: they change presentation, not
 * membership, so they must not turn an empty account into a "no results" state.
 */
export function hasActiveUrlListFilters(state: UrlListQueryState): boolean {
  return state.search !== '' || state.status !== DEFAULT_URL_LIST_QUERY.status;
}

/**
 * Whether the store may apply local list optimizations after a mutation.
 *
 * Only the unfiltered, default-sorted first page is predictable enough to
 * update in place; anywhere else the server decides what the page contains.
 */
export function isDefaultUrlListView(state: UrlListQueryState): boolean {
  return (
    state.page === DEFAULT_URL_LIST_QUERY.page &&
    state.search === DEFAULT_URL_LIST_QUERY.search &&
    state.status === DEFAULT_URL_LIST_QUERY.status &&
    state.sort === DEFAULT_URL_LIST_QUERY.sort
  );
}
