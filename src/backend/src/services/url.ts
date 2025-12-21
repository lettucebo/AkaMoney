import { nanoid } from 'nanoid';
import type { Env, Url, CreateUrlRequest, UpdateUrlRequest, UrlResponse } from '../types';
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from '../types/errors';

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

  // Generate or validate short code
  let shortCode = data.short_code;
  if (shortCode) {
    if (!isValidShortCode(shortCode)) {
      throw new ValidationError('Invalid short code format. Use 3-20 alphanumeric characters, hyphens, or underscores.');
    }
    
    // Check if short code already exists
    const existing = await db
      .prepare('SELECT id FROM urls WHERE short_code = ?')
      .bind(shortCode)
      .first();
    
    if (existing) {
      throw new ConflictError('Short code already exists. Please choose a different one.');
    }
  } else {
    // Generate unique short code
    let attempts = 0;
    while (attempts < MAX_SHORT_CODE_GENERATION_ATTEMPTS) {
      shortCode = generateShortCode();
      const existing = await db
        .prepare('SELECT id FROM urls WHERE short_code = ?')
        .bind(shortCode)
        .first();
      
      if (!existing) break;
      attempts++;
    }
    
    if (attempts === MAX_SHORT_CODE_GENERATION_ATTEMPTS) {
      throw new Error('Failed to generate unique short code');
    }
  }

  const now = Date.now();
  const id = nanoid();

  const url: Url = {
    id,
    short_code: shortCode!,
    original_url: data.original_url,
    user_id: userId || null,
    title: data.title || null,
    description: data.description || null,
    created_at: now,
    updated_at: now,
    expires_at: data.expires_at || null,
    is_active: 1,
    click_count: 0
  };

  await db
    .prepare(`
      INSERT INTO urls (
        id, short_code, original_url, user_id, title, description,
        created_at, updated_at, expires_at, is_active, click_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      url.id,
      url.short_code,
      url.original_url,
      url.user_id,
      url.title,
      url.description,
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
    created_at: url.created_at,
    updated_at: url.updated_at,
    expires_at: url.expires_at || undefined,
    is_active: url.is_active === 1,
    click_count: url.click_count
  };
}

/**
 * Get all URLs for a user
 */
export async function getUserUrls(
  db: D1Database,
  userId: string,
  page: number = 1,
  limit: number = 20
): Promise<{ urls: UrlResponse[], total: number }> {
  try {
    console.log('getUserUrls called with:', { userId, page, limit });

    const offset = (page - 1) * limit;

    console.log('Executing SELECT query...');
    const { results } = await db
      .prepare(`
        SELECT * FROM urls 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `)
      .bind(userId, limit, offset)
      .all<Url>();

    console.log('SELECT query completed, rows:', results?.length || 0);

    console.log('Executing COUNT query...');
    const countResult = await db
      .prepare('SELECT COUNT(*) as count FROM urls WHERE user_id = ?')
      .bind(userId)
      .first<{ count: number }>();

    console.log('COUNT query completed:', countResult);

    return {
      urls: results.map(url => formatUrlResponse(url)),
      total: countResult?.count || 0
    };
  } catch (error) {
    console.error('Error in getUserUrls:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId,
      page,
      limit
    });
    throw error;
  }
}
