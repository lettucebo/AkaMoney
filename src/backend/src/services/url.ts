import { nanoid } from 'nanoid';
import type {
  Env,
  Url,
  CreateUrlRequest,
  UpdateUrlRequest,
  UrlResponse,
  UrlListSort,
  UrlListStatus,
  UrlStatusCounts
} from '../types';
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from '../types/errors';
import {
  DEFAULT_URL_LIST_LIMIT,
  DEFAULT_URL_LIST_PAGE,
  buildUrlCountsSelection,
  buildUrlListFilter,
  buildUrlListOrderBy,
  clampPage,
  toUrlStatusCounts
} from './urlListQuery';

export interface UrlListOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: UrlListStatus;
  sort?: UrlListSort;
  /** Single evaluation instant shared by every status predicate in one request. */
  now?: number;
}

export interface UserUrlsResult {
  urls: UrlResponse[];
  total: number;
  totalPages: number;
  /** The page actually served, after clamping against `totalPages`. */
  page: number;
  counts: UrlStatusCounts;
}

// Constants
const MAX_SHORT_CODE_GENERATION_ATTEMPTS = 5;
const DEFAULT_SHORT_CODE_LENGTH = 6;

/**
 * Generate a unique short code
 */
export function generateShortCode(length: number = DEFAULT_SHORT_CODE_LENGTH): string {
  return nanoid(length);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check if user owns the URL
 */
export function checkUrlOwnership(url: Url, userId: string): void {
  if (url.user_id && url.user_id !== userId) {
    throw new ForbiddenError('You do not have permission to access this URL');
  }
}

/**
 * Validate short code format
 */
export function isValidShortCode(code: string): boolean {
  // Allow alphanumeric and hyphens, 3-20 characters
  return /^[a-zA-Z0-9-_]{3,20}$/.test(code);
}

/**
 * Create a new shortened URL
 */
export async function createUrl(
  db: D1Database,
  data: CreateUrlRequest,
  userId?: string
): Promise<UrlResponse> {
  // Validate original URL
  if (!isValidUrl(data.original_url)) {
    throw new ValidationError('Invalid URL format');
  }

  // Validate short code is provided and trim whitespace
  const shortCode = data.short_code?.trim();
  if (!shortCode) {
    throw new ValidationError('Short code is required');
  }

  // Validate short code format
  if (!isValidShortCode(shortCode)) {
    throw new ValidationError('Invalid short code format. Use 3-20 alphanumeric characters, hyphens, or underscores.');
  }
  
  // Check if short code already exists (case-insensitive)
  const existing = await db
    .prepare('SELECT id FROM urls WHERE LOWER(short_code) = LOWER(?)')
    .bind(shortCode)
    .first();
  
  if (existing) {
    throw new ConflictError('Short code already exists. Please choose a different one.');
  }

  const now = Date.now();
  const id = nanoid();

  const url: Url = {
    id,
    short_code: shortCode,
    original_url: data.original_url,
    user_id: userId || null,
    title: data.title || null,
    description: data.description || null,
    image_url: data.image_url || null,
    created_at: now,
    updated_at: now,
    expires_at: data.expires_at || null,
    is_active: 1,
    click_count: 0
  };

  await db
    .prepare(`
      INSERT INTO urls (
        id, short_code, original_url, user_id, title, description, image_url,
        created_at, updated_at, expires_at, is_active, click_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      url.id,
      url.short_code,
      url.original_url,
      url.user_id,
      url.title,
      url.description,
      url.image_url,
      url.created_at,
      url.updated_at,
      url.expires_at,
      url.is_active,
      url.click_count
    )
    .run();

  return formatUrlResponse(url);
}

/**
 * Get URL by short code
 */
export async function getUrlByShortCode(
  db: D1Database,
  shortCode: string
): Promise<Url | null> {
  const result = await db
    .prepare('SELECT * FROM urls WHERE short_code = ? AND is_active = 1')
    .bind(shortCode)
    .first<Url>();

  return result || null;
}

/**
 * Get URL by ID
 */
export async function getUrlById(
  db: D1Database,
  id: string
): Promise<Url | null> {
  const result = await db
    .prepare('SELECT * FROM urls WHERE id = ?')
    .bind(id)
    .first<Url>();

  return result || null;
}

/**
 * Update URL
 */
export async function updateUrl(
  db: D1Database,
  id: string,
  data: UpdateUrlRequest,
  userId?: string
): Promise<UrlResponse> {
  const url = await getUrlById(db, id);
  if (!url) {
    throw new NotFoundError('URL not found');
  }

  // Check ownership if userId is provided
  if (userId) {
    checkUrlOwnership(url, userId);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (data.original_url !== undefined) {
    if (!isValidUrl(data.original_url)) {
      throw new ValidationError('Invalid URL format');
    }
    updates.push('original_url = ?');
    values.push(data.original_url);
  }

  if (data.title !== undefined) {
    updates.push('title = ?');
    values.push(data.title);
  }

  if (data.description !== undefined) {
    updates.push('description = ?');
    values.push(data.description);
  }

  if (data.image_url !== undefined) {
    updates.push('image_url = ?');
    values.push(data.image_url);
  }

  if (data.expires_at !== undefined) {
    updates.push('expires_at = ?');
    values.push(data.expires_at);
  }

  if (data.is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(data.is_active ? 1 : 0);
  }

  updates.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  await db
    .prepare(`UPDATE urls SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  const updatedUrl = await getUrlById(db, id);
  return formatUrlResponse(updatedUrl!);
}

/**
 * Delete URL
 */
export async function deleteUrl(
  db: D1Database,
  id: string,
  userId?: string
): Promise<void> {
  const url = await getUrlById(db, id);
  if (!url) {
    throw new NotFoundError('URL not found');
  }

  // Check ownership if userId is provided
  if (userId) {
    checkUrlOwnership(url, userId);
  }

  await db
    .prepare('DELETE FROM urls WHERE id = ?')
    .bind(id)
    .run();
}

/**
 * Increment click count
 */
export async function incrementClickCount(
  db: D1Database,
  urlId: string
): Promise<void> {
  await db
    .prepare('UPDATE urls SET click_count = click_count + 1 WHERE id = ?')
    .bind(urlId)
    .run();
}

/**
 * Format URL for API response
 */
function formatUrlResponse(url: Url, baseUrl?: string): UrlResponse {
  const shortUrl = baseUrl ? `${baseUrl}/${url.short_code}` : url.short_code;
  
  return {
    id: url.id,
    short_code: url.short_code,
    original_url: url.original_url,
    short_url: shortUrl,
    title: url.title || undefined,
    description: url.description || undefined,
    image_url: url.image_url || undefined,
    created_at: url.created_at,
    updated_at: url.updated_at,
    expires_at: url.expires_at || undefined,
    is_active: url.is_active === 1,
    click_count: url.click_count
  };
}

function redactText(value: string | undefined, redactions: string[]): string | undefined {
  if (!value) {
    return value;
  }

  const orderedRedactions = redactions
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  return orderedRedactions.reduce(
    (text, secret) => text.split(secret).join('[redacted-user-id]'),
    value
  );
}

/**
 * Get a page of URLs for a user, with account-wide search, status filtering,
 * sorting and status counts.
 *
 * The status counts double as the totals: `COUNT(CASE WHEN <status> ... END)`
 * over the owner+search scope is by definition the same number a
 * status-filtered `COUNT(*)` would return, so `total` is read straight out of
 * `counts`. That removes a second full scan per request (a searched scan cannot
 * use an index) and makes it impossible for `total` and `counts` to disagree.
 *
 * The paged SELECT is a separate statement because its OFFSET depends on the
 * total, so it can observe a write that landed after the counts were taken.
 * A single `now` is threaded through every status predicate so at least the
 * expiry boundary is evaluated identically everywhere.
 *
 * The requested page is clamped against the filtered total before the page
 * query runs, and the effective page is returned so callers never render a
 * page number the result set does not have.
 */
export async function getUserUrls(
  db: D1Database,
  userId: string,
  options: UrlListOptions = {}
): Promise<UserUrlsResult> {
  const {
    page: requestedPage = DEFAULT_URL_LIST_PAGE,
    limit = DEFAULT_URL_LIST_LIMIT,
    search = '',
    status = 'all',
    sort = 'default',
    now = Date.now()
  } = options;

  try {
    // Counts ignore the status filter (every tab needs its own total), so they
    // are scoped by owner + search only.
    const countsSelection = buildUrlCountsSelection(now);
    const countsFilter = buildUrlListFilter({ userId, search, status: 'all', now });

    const countsRow = await db
      .prepare(`${countsSelection.sql} ${countsFilter.sql}`)
      .bind(...countsSelection.params, ...countsFilter.params)
      .first<Record<string, unknown>>();

    const counts = toUrlStatusCounts(countsRow);
    const total = status === 'all' ? counts.all : counts[status];
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const page = clampPage(requestedPage, totalPages);
    const offset = (page - 1) * limit;

    const filter = buildUrlListFilter({ userId, search, status, now });
    const { results } = await db
      .prepare(`SELECT * FROM urls ${filter.sql} ${buildUrlListOrderBy(sort)} LIMIT ? OFFSET ?`)
      .bind(...filter.params, limit, offset)
      .all<Url>();

    return {
      urls: (results || []).map(url => formatUrlResponse(url)),
      total,
      totalPages,
      page,
      counts
    };
  } catch (error) {
    const redactions = [userId];
    const diagnosticMessage = redactText(error instanceof Error ? error.message : String(error), redactions);
    console.error('Error in getUserUrls:', {
      error: diagnosticMessage,
      stack: redactText(error instanceof Error ? error.stack : undefined, redactions),
      page: requestedPage,
      limit,
      status,
      sort,
      // The term itself is never logged - only whether one was present.
      hasSearch: search.length > 0
    });
    throw new Error(diagnosticMessage || 'Failed to get user URLs');
  }
}
