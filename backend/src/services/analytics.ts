import { nanoid } from 'nanoid';
import type { Env, ClickRecord, AnalyticsResponse, UrlResponse } from '../types';
import { getUrlByShortCode, incrementClickCount } from './url';

/**
 * Parse User-Agent to extract device, browser, and OS info
 */
function parseUserAgent(userAgent: string): {
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
  shortCode: string
): Promise<AnalyticsResponse | null> {
  // Get URL
  const url = await getUrlByShortCode(db, shortCode);
  if (!url) {
    return null;
  }

  // Get total clicks
  const totalResult = await db
    .prepare('SELECT COUNT(*) as count FROM click_records WHERE short_code = ?')
    .bind(shortCode)
    .first<{ count: number }>();
  
  const total_clicks = totalResult?.count || 0;

  // Get clicks by date (last 30 days)
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
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
    .bind(shortCode, thirtyDaysAgo)
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
