/**
 * Query-parameter normalization and SQL fragment builders for the URL list.
 *
 * Everything here is pure so it can be unit tested directly: backend coverage
 * excludes `src/index.ts`, so no validation or SQL assembly may live in the
 * route handler.
 *
 * Nothing from the caller ever reaches SQL as text. Search terms are bound as
 * parameters, and `status`/`sort` are mapped through closed whitelists before
 * any fragment is produced.
 */
import type { UrlListSort, UrlListStatus, UrlStatusCounts } from '../types';

export const DEFAULT_URL_LIST_PAGE = 1;
export const DEFAULT_URL_LIST_LIMIT = 20;
export const MAX_URL_LIST_LIMIT = 100;
export const MAX_URL_SEARCH_LENGTH = 200;

export const URL_LIST_STATUSES: readonly UrlListStatus[] = ['all', 'active', 'expired', 'archived'];
export const URL_LIST_SORTS: readonly UrlListSort[] = [
  'default',
  'clicks-desc',
  'clicks-asc',
  'created-asc',
  'updated-desc'
];

export interface NormalizedUrlListQuery {
  page: number;
  limit: number;
  search: string;
  status: UrlListStatus;
  sort: UrlListSort;
}

export interface UrlListFilterInput {
  userId: string;
  search: string;
  status: UrlListStatus;
  now: number;
}

export interface SqlFragment {
  sql: string;
  params: (string | number)[];
}

const toPositiveInt = (raw: unknown, fallback: number): number => {
  const parsed = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const floored = Math.floor(parsed);
  return floored >= 1 ? floored : fallback;
};

const isStatus = (value: unknown): value is UrlListStatus =>
  URL_LIST_STATUSES.includes(value as UrlListStatus);

const isSort = (value: unknown): value is UrlListSort => URL_LIST_SORTS.includes(value as UrlListSort);

/**
 * Normalizes raw query parameters into a fully validated shape.
 *
 * `page`/`limit` are clamped rather than passed through: the previous
 * implementation fed `parseInt` output straight into SQL, so `?page=abc`
 * produced `NaN` and a 500.
 */
export function normalizeUrlListQuery(raw: Record<string, string | undefined> = {}): NormalizedUrlListQuery {
  const limit = Math.min(toPositiveInt(raw.limit, DEFAULT_URL_LIST_LIMIT), MAX_URL_LIST_LIMIT);
  const search = (raw.search ?? '').trim().slice(0, MAX_URL_SEARCH_LENGTH);

  return {
    page: toPositiveInt(raw.page, DEFAULT_URL_LIST_PAGE),
    limit,
    search,
    status: isStatus(raw.status) ? raw.status : 'all',
    sort: isSort(raw.sort) ? raw.sort : 'default'
  };
}

/**
 * Clamps a requested page into the range the result set actually has.
 *
 * Without this a bookmarked `?page=999` renders "第 999 / 3 頁" with a working
 * previous-page button, because the pagination component assumes
 * `page <= total_pages`.
 */
export function clampPage(page: number, totalPages: number): number {
  const upperBound = Math.max(totalPages, 1);
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }
  return Math.min(Math.floor(page), upperBound);
}

/**
 * Escapes the LIKE wildcards `%` and `_` (and the escape character itself) so a
 * search for "50%" matches a literal "50%" instead of every row.
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Folds only ASCII letters, matching SQLite's `LOWER()`.
 *
 * The comparison has to be symmetric: the column side is folded by SQLite,
 * which leaves non-ASCII untouched. Folding the search term with
 * `String.prototype.toLowerCase()` instead would turn "École" into "école"
 * while the stored value stays "École", so a user could not find a link by
 * typing its exact title. Case-insensitivity is therefore ASCII-only, which is
 * what `src/frontend/src/services/mockUrlList.ts` also implements.
 */
export function asciiLower(value: string): string {
  return value.replace(/[A-Z]/g, (char) => char.toLowerCase());
}

/**
 * SQL predicates mirroring the runtime status semantics used everywhere else.
 *
 * "No expiry" is `expires_at IS NULL OR expires_at = 0`, not just `IS NULL`:
 * the redirect worker tests `url.expires_at && url.expires_at < Date.now()`
 * (src/redirect/src/index.ts) and `formatUrlResponse` maps the column through
 * `url.expires_at || undefined`, so a stored `0` behaves as "never expires"
 * in every existing code path.
 *
 * "Archived" is `is_active IS NOT 1`, not `is_active = 0`: the column is
 * nullable (migration 0001) and `formatUrlResponse` reports `is_active === 1`,
 * so any other value already renders as archived. `IS NOT` also matches NULL,
 * which `<> 1` would not.
 */
const NO_EXPIRY = '(urls.expires_at IS NULL OR urls.expires_at = 0)';
const HAS_EXPIRY = '(urls.expires_at IS NOT NULL AND urls.expires_at <> 0)';

export const ACTIVE_PREDICATE = `(urls.is_active = 1 AND (${NO_EXPIRY} OR urls.expires_at >= ?))`;
export const EXPIRED_PREDICATE = `(urls.is_active = 1 AND ${HAS_EXPIRY} AND urls.expires_at < ?)`;
export const ARCHIVED_PREDICATE = '(urls.is_active IS NOT 1)';

const SEARCH_COLUMNS = ['urls.short_code', 'urls.original_url', "COALESCE(urls.title, '')"];

/**
 * Builds the shared `WHERE` clause for the list, total and counts queries.
 *
 * All three use this builder so they can never disagree about which rows belong
 * to the result set, and every one of them keeps the `user_id` ownership scope.
 */
export function buildUrlListFilter({ userId, search, status, now }: UrlListFilterInput): SqlFragment {
  const clauses = ['urls.user_id = ?'];
  const params: (string | number)[] = [userId];

  if (search) {
    const pattern = `%${escapeLikeTerm(asciiLower(search))}%`;
    const matchers = SEARCH_COLUMNS.map((column) => `LOWER(${column}) LIKE ? ESCAPE '\\'`);
    clauses.push(`(${matchers.join(' OR ')})`);
    SEARCH_COLUMNS.forEach(() => params.push(pattern));
  }

  if (status === 'active') {
    clauses.push(ACTIVE_PREDICATE);
    params.push(now);
  } else if (status === 'expired') {
    clauses.push(EXPIRED_PREDICATE);
    params.push(now);
  } else if (status === 'archived') {
    clauses.push(ARCHIVED_PREDICATE);
  }

  return { sql: `WHERE ${clauses.join(' AND ')}`, params };
}

/**
 * Builds the status-counts projection.
 *
 * `COUNT(CASE WHEN ... THEN 1 END)` is deliberate: `SUM(CASE ... ELSE 0 END)`
 * returns NULL when the aggregate sees zero rows, and "search matched nothing"
 * is a routine response - that would break the numeric contract of `counts`.
 *
 * The returned params bind the two `now` placeholders inside the projection.
 * They must be bound *before* the `WHERE` clause params, because the projection
 * precedes the `WHERE` clause in the assembled statement.
 */
export function buildUrlCountsSelection(now: number): SqlFragment {
  const sql = [
    'SELECT',
    '  COUNT(*) AS all_count,',
    `  COUNT(CASE WHEN ${ACTIVE_PREDICATE} THEN 1 END) AS active_count,`,
    `  COUNT(CASE WHEN ${EXPIRED_PREDICATE} THEN 1 END) AS expired_count,`,
    `  COUNT(CASE WHEN ${ARCHIVED_PREDICATE} THEN 1 END) AS archived_count`,
    'FROM urls'
  ].join('\n');

  return { sql, params: [now, now] };
}

/**
 * Whitelisted `ORDER BY` clauses.
 *
 * Every option ends with a unique tiebreaker (`id`) so two rows with the same
 * click count or timestamp can never swap places between page requests, which
 * would otherwise duplicate or skip rows while paging.
 */
const ORDER_BY: Record<UrlListSort, string> = {
  default: 'ORDER BY urls.created_at DESC, urls.id DESC',
  'created-asc': 'ORDER BY urls.created_at ASC, urls.id ASC',
  'updated-desc': 'ORDER BY urls.updated_at DESC, urls.id DESC',
  'clicks-desc': 'ORDER BY urls.click_count DESC, urls.created_at DESC, urls.id DESC',
  'clicks-asc': 'ORDER BY urls.click_count ASC, urls.created_at DESC, urls.id DESC'
};

export function buildUrlListOrderBy(sort: UrlListSort): string {
  return ORDER_BY[sort] ?? ORDER_BY.default;
}

/** Coerces a raw counts row into the numeric contract callers rely on. */
export function toUrlStatusCounts(row: Record<string, unknown> | null | undefined): UrlStatusCounts {
  const read = (key: string): number => {
    const value = Number(row?.[key]);
    return Number.isFinite(value) ? value : 0;
  };

  return {
    all: read('all_count'),
    active: read('active_count'),
    expired: read('expired_count'),
    archived: read('archived_count')
  };
}
