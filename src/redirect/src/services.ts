import type { Env, Url, ClickRecord } from './types';

/**
 * Generate a unique ID for click records
 */
function generateId(): string {
  return crypto.randomUUID();
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
 * Parse user agent to detect device type, browser, and OS
 */
function parseUserAgent(userAgent: string | null): {
  device_type: string;
  browser: string;
  os: string;
} {
  if (!userAgent) {
    return { device_type: 'unknown', browser: 'unknown', os: 'unknown' };
  }

  const ua = userAgent.toLowerCase();

  // Detect device type
  let device_type = 'desktop';
  if (/mobile|android|iphone|ipad|ipod|blackberry|opera mini|iemobile/i.test(ua)) {
    device_type = /ipad|tablet/i.test(ua) ? 'tablet' : 'mobile';
  }

  // Detect browser
  let browser = 'other';
  if (ua.includes('chrome') && !ua.includes('edge')) {
    browser = 'chrome';
  } else if (ua.includes('firefox')) {
    browser = 'firefox';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'safari';
  } else if (ua.includes('edge')) {
    browser = 'edge';
  } else if (ua.includes('opera') || ua.includes('opr')) {
    browser = 'opera';
  }

  // Detect OS
  let os = 'other';
  if (ua.includes('windows')) {
    os = 'windows';
  } else if (ua.includes('mac os') || ua.includes('macos')) {
    os = 'macos';
  } else if (ua.includes('linux') && !ua.includes('android')) {
    os = 'linux';
  } else if (ua.includes('android')) {
    os = 'android';
  } else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    os = 'ios';
  }

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
  const userAgent = request.headers.get('user-agent');
  const referer = request.headers.get('referer');
  const cfData = (request as any).cf as { country?: string; city?: string } | undefined;
  
  const { device_type, browser, os } = parseUserAgent(userAgent);

  const clickRecord: ClickRecord = {
    id: generateId(),
    url_id: urlId,
    clicked_at: Date.now(),
    ip_address: request.headers.get('cf-connecting-ip') || null,
    user_agent: userAgent,
    referer: referer,
    country: cfData?.country || null,
    city: cfData?.city || null,
    device_type,
    browser,
    os
  };

  // Insert click record
  await db
    .prepare(`
      INSERT INTO click_records (
        id, url_id, clicked_at, ip_address, user_agent, referer,
        country, city, device_type, browser, os
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      clickRecord.id,
      clickRecord.url_id,
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

  // Update click count
  await db
    .prepare('UPDATE urls SET click_count = click_count + 1 WHERE id = ?')
    .bind(urlId)
    .run();
}
