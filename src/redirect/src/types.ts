/**
 * Environment bindings for the redirect worker
 */
export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
}

/**
 * URL record from database
 */
export interface Url {
  id: string;
  short_code: string;
  original_url: string;
  user_id: string | null;
  title: string | null;
  description: string | null;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
  is_active: number;
  click_count: number;
}

/**
 * Click record for analytics
 */
export interface ClickRecord {
  id: string;
  url_id: string;
  clicked_at: number;
  ip_address: string | null;
  user_agent: string | null;
  referer: string | null;
  country: string | null;
  city: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
}
