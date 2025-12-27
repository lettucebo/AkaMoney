import { nanoid } from 'nanoid';
import type { Env, ClickRecord, AnalyticsResponse, UrlResponse, OverallStatsResponse, TopLink } from '../types';
import { getUrlByShortCode, incrementClickCount, checkUrlOwnership } from './url';
import { NotFoundError } from '../types/errors';

// Constants
const ANALYTICS_DEFAULT_DAYS = 30;

/**
 * Parse User-Agent to extract device, browser, and OS info
 * Note: This is a simplified parser. For production use, consider a library like ua-parser-js
 */
export function parseUserAgent(userAgent: string): {
  device_type: string;
  browser: string;
  os: string;
} {
  const ua = userAgent.toLowerCase();
  
  // Device type
  let device_type = 'desktop';
  if (/mobile|android|iphone|ipad|ipod/.test(ua)) {
    device_type = 'mobile';
  } else if (/tablet|ipad/.test(ua)) {
    device_type = 'tablet';
  }

  // Browser
  let browser = 'unknown';
  if (ua.includes('edg/')) browser = 'edge';
  else if (ua.includes('chrome/')) browser = 'chrome';
  else if (ua.includes('firefox/')) browser = 'firefox';
  else if (ua.includes('safari/') && !ua.includes('chrome')) browser = 'safari';
  else if (ua.includes('opera/') || ua.includes('opr/')) browser = 'opera';

  // OS
  let os = 'unknown';
  if (ua.includes('windows')) os = 'windows';
  else if (ua.includes('mac os')) os = 'macos';
  else if (ua.includes('linux')) os = 'linux';
  else if (ua.includes('android')) os = 'android';
  else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'ios';

  return { device_type, browser, os };
}

/**
 * Record a click event
 */
export async function recordClick(
  db: D1Database,
  request: Request,
  shortCode: string,
  urlId: string
): Promise<void> {
  const id = nanoid();
  const now = Date.now();
  
  // Extract information from request
  const ipAddress = request.headers.get('CF-Connecting-IP') || 
                    request.headers.get('X-Forwarded-For') || 
                    null;
  const userAgent = request.headers.get('User-Agent') || null;
  const referer = request.headers.get('Referer') || null;
  
  // Get geolocation from Cloudflare
  const country = request.headers.get('CF-IPCountry') || null;
  const city = request.headers.get('CF-IPCity') || null;

  // Parse user agent
  let device_type = null;
  let browser = null;
  let os = null;
  
  if (userAgent) {
    const parsed = parseUserAgent(userAgent);
    device_type = parsed.device_type;
    browser = parsed.browser;
    os = parsed.os;
  }

  const clickRecord: ClickRecord = {
    id,
    url_id: urlId,
    short_code: shortCode,
    clicked_at: now,
    ip_address: ipAddress,
    user_agent: userAgent,
    referer,
    country,
    city,
    device_type,
    browser,
    os
  };

  // Insert click record
  await db
    .prepare(`
      INSERT INTO click_records (
        id, url_id, short_code, clicked_at, ip_address, user_agent,
        referer, country, city, device_type, browser, os
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      clickRecord.id,
      clickRecord.url_id,
      clickRecord.short_code,
      clickRecord.clicked_at,
      clickRecord.ip_address,
      clickRecord.user_agent,
      clickRecord.referer,
      clickRecord.country,
      clickRecord.city,
      clickRecord.device_type,
      clickRecord.browser,
      clickRecord.os
    )
    .run();

  // Increment click count
  await incrementClickCount(db, urlId);
}

/**
 * Get analytics for a URL
 */
export async function getAnalytics(
  db: D1Database,
  shortCode: string,
  userId?: string
): Promise<AnalyticsResponse | null> {
  // Get URL
  const url = await getUrlByShortCode(db, shortCode);
  if (!url) {
    return null;
  }

  // Check ownership if userId is provided
  if (userId) {
    checkUrlOwnership(url, userId);
  }

  // Get total clicks
  const totalResult = await db
    .prepare('SELECT COUNT(*) as count FROM click_records WHERE short_code = ?')
    .bind(shortCode)
    .first<{ count: number }>();
  
  const total_clicks = totalResult?.count || 0;

  // Get clicks by date (last ANALYTICS_DEFAULT_DAYS days)
  const daysAgo = Date.now() - (ANALYTICS_DEFAULT_DAYS * 24 * 60 * 60 * 1000);
  const clicksByDateResult = await db
    .prepare(`
      SELECT 
        DATE(clicked_at / 1000, 'unixepoch') as date,
        COUNT(*) as count
      FROM click_records
      WHERE short_code = ? AND clicked_at >= ?
      GROUP BY date
      ORDER BY date
    `)
    .bind(shortCode, daysAgo)
    .all<{ date: string; count: number }>();

  const clicks_by_date: Record<string, number> = {};
  for (const row of clicksByDateResult.results || []) {
    clicks_by_date[row.date] = row.count;
  }

  // Get clicks by country
  const clicksByCountryResult = await db
    .prepare(`
      SELECT country, COUNT(*) as count
      FROM click_records
      WHERE short_code = ? AND country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
      LIMIT 10
    `)
    .bind(shortCode)
    .all<{ country: string; count: number }>();

  const clicks_by_country: Record<string, number> = {};
  for (const row of clicksByCountryResult.results || []) {
    clicks_by_country[row.country] = row.count;
  }

  // Get clicks by device type
  const clicksByDeviceResult = await db
    .prepare(`
      SELECT device_type, COUNT(*) as count
      FROM click_records
      WHERE short_code = ? AND device_type IS NOT NULL
      GROUP BY device_type
      ORDER BY count DESC
    `)
    .bind(shortCode)
    .all<{ device_type: string; count: number }>();

  const clicks_by_device: Record<string, number> = {};
  for (const row of clicksByDeviceResult.results || []) {
    clicks_by_device[row.device_type] = row.count;
  }

  // Get clicks by browser
  const clicksByBrowserResult = await db
    .prepare(`
      SELECT browser, COUNT(*) as count
      FROM click_records
      WHERE short_code = ? AND browser IS NOT NULL
      GROUP BY browser
      ORDER BY count DESC
      LIMIT 5
    `)
    .bind(shortCode)
    .all<{ browser: string; count: number }>();

  const clicks_by_browser: Record<string, number> = {};
  for (const row of clicksByBrowserResult.results || []) {
    clicks_by_browser[row.browser] = row.count;
  }

  // Get recent clicks
  const recentClicksResult = await db
    .prepare(`
      SELECT *
      FROM click_records
      WHERE short_code = ?
      ORDER BY clicked_at DESC
      LIMIT 20
    `)
    .bind(shortCode)
    .all<ClickRecord>();

  const recent_clicks = recentClicksResult.results || [];

  // Format URL response
  const urlResponse: UrlResponse = {
    id: url.id,
    short_code: url.short_code,
    original_url: url.original_url,
    short_url: url.short_code,
    title: url.title || undefined,
    description: url.description || undefined,
    created_at: url.created_at,
    updated_at: url.updated_at,
    expires_at: url.expires_at || undefined,
    is_active: url.is_active === 1,
    click_count: url.click_count
  };

  return {
    url: urlResponse,
    total_clicks,
    clicks_by_date,
    clicks_by_country,
    clicks_by_device,
    clicks_by_browser,
    recent_clicks
  };
}

/**
 * Get overall statistics for all URLs owned by a user
 */
export async function getOverallStats(
  db: D1Database,
  userId: string,
  startDate?: Date,
  endDate?: Date
): Promise<OverallStatsResponse> {
  // Calculate date range
  let start: Date;
  let end: Date;
  
  if (startDate && endDate) {
    start = startDate;
    end = endDate;
  } else {
    // Default to current month
    const now = new Date();
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    // End of current month
    end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  }
  
  const startTimestamp = start.getTime();
  const endTimestamp = end.getTime();
  
  // Get all URLs for this user
  const urlsResult = await db
    .prepare('SELECT id, short_code, original_url, title, click_count, is_active FROM urls WHERE user_id = ?')
    .bind(userId)
    .all<{ id: string; short_code: string; original_url: string; title: string | null; click_count: number; is_active: number }>();
  
  const allUrls = urlsResult.results || [];
  const total_links = allUrls.length;
  const active_links = allUrls.filter(url => url.is_active === 1).length;
  
  // Get all URL IDs for filtering clicks
  const urlIds = allUrls.map(url => url.id);
  
  if (urlIds.length === 0) {
    // No URLs, return empty stats
    return {
      total_clicks: 0,
      active_links: 0,
      total_links: 0,
      click_trend: {},
      top_links: [],
      country_distribution: {},
      device_distribution: {},
      date_range: {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
      }
    };
  }
  
  // Build placeholders for IN clause
  const placeholders = urlIds.map(() => '?').join(',');
  
  // Get total clicks in date range
  const totalClicksResult = await db
    .prepare(`
      SELECT COUNT(*) as count 
      FROM click_records 
      WHERE url_id IN (${placeholders}) 
        AND clicked_at >= ? 
        AND clicked_at <= ?
    `)
    .bind(...urlIds, startTimestamp, endTimestamp)
    .first<{ count: number }>();
  
  const total_clicks = totalClicksResult?.count || 0;
  
  // Get click trend by date
  const clickTrendResult = await db
    .prepare(`
      SELECT 
        DATE(clicked_at / 1000, 'unixepoch') as date,
        COUNT(*) as count
      FROM click_records
      WHERE url_id IN (${placeholders})
        AND clicked_at >= ?
        AND clicked_at <= ?
      GROUP BY date
      ORDER BY date
    `)
    .bind(...urlIds, startTimestamp, endTimestamp)
    .all<{ date: string; count: number }>();
  
  const click_trend: Record<string, number> = {};
  for (const row of clickTrendResult.results || []) {
    click_trend[row.date] = row.count;
  }
  
  // Get top links by click count in date range
  const topLinksResult = await db
    .prepare(`
      SELECT 
        cr.short_code,
        COUNT(*) as click_count
      FROM click_records cr
      WHERE cr.url_id IN (${placeholders})
        AND cr.clicked_at >= ?
        AND cr.clicked_at <= ?
      GROUP BY cr.short_code
      ORDER BY click_count DESC
      LIMIT 10
    `)
    .bind(...urlIds, startTimestamp, endTimestamp)
    .all<{ short_code: string; click_count: number }>();
  
  const top_links: TopLink[] = [];
  for (const row of topLinksResult.results || []) {
    const url = allUrls.find(u => u.short_code === row.short_code);
    if (url) {
      top_links.push({
        short_code: row.short_code,
        original_url: url.original_url,
        click_count: row.click_count,
        title: url.title || undefined
      });
    }
  }
  
  // Get country distribution
  const countryResult = await db
    .prepare(`
      SELECT country, COUNT(*) as count
      FROM click_records
      WHERE url_id IN (${placeholders})
        AND clicked_at >= ?
        AND clicked_at <= ?
        AND country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
      LIMIT 10
    `)
    .bind(...urlIds, startTimestamp, endTimestamp)
    .all<{ country: string; count: number }>();
  
  const country_distribution: Record<string, number> = {};
  for (const row of countryResult.results || []) {
    country_distribution[row.country] = row.count;
  }
  
  // Get device distribution
  const deviceResult = await db
    .prepare(`
      SELECT device_type, COUNT(*) as count
      FROM click_records
      WHERE url_id IN (${placeholders})
        AND clicked_at >= ?
        AND clicked_at <= ?
        AND device_type IS NOT NULL
      GROUP BY device_type
      ORDER BY count DESC
    `)
    .bind(...urlIds, startTimestamp, endTimestamp)
    .all<{ device_type: string; count: number }>();
  
  const device_distribution: Record<string, number> = {};
  for (const row of deviceResult.results || []) {
    device_distribution[row.device_type] = row.count;
  }
  
  return {
    total_clicks,
    active_links,
    total_links,
    click_trend,
    top_links,
    country_distribution,
    device_distribution,
    date_range: {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    }
  };
}
