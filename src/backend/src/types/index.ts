// Environment bindings
export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  ENTRA_ID_TENANT_ID?: string;
  ENTRA_ID_CLIENT_ID?: string;
  ENTRA_ID_CLIENT_SECRET?: string;
  ENVIRONMENT: string;
  SHORT_DOMAIN?: string;
  D1_ANALYTICS_ACCOUNT_ID?: string;
  D1_ANALYTICS_API_TOKEN?: string;
  D1_ANALYTICS_DATABASE_ID?: string;
}

// Database Models
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

export interface ClickRecord {
  id: string;
  url_id: string;
  short_code: string;
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

export interface User {
  id: string;
  email: string;
  password_hash: string | null;
  entra_id: string | null;
  name: string | null;
  role: string;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
  is_active: number;
}

// API Request/Response types
export interface CreateUrlRequest {
  original_url: string;
  short_code?: string;
  title?: string;
  description?: string;
  expires_at?: number;
}

export interface UpdateUrlRequest {
  original_url?: string;
  title?: string;
  description?: string;
  expires_at?: number;
  is_active?: boolean;
}

export interface UrlResponse {
  id: string;
  short_code: string;
  original_url: string;
  short_url: string;
  title?: string;
  description?: string;
  created_at: number;
  updated_at: number;
  expires_at?: number;
  is_active: boolean;
  click_count: number;
}

export interface AnalyticsResponse {
  url: UrlResponse;
  total_clicks: number;
  clicks_by_date: Record<string, number>;
  clicks_by_country: Record<string, number>;
  clicks_by_device: Record<string, number>;
  clicks_by_browser: Record<string, number>;
  recent_clicks: ClickRecord[];
}

export interface TopLink {
  short_code: string;
  original_url: string;
  click_count: number;
  title?: string;
}

export interface OverallStatsResponse {
  total_clicks: number;
  active_links: number;
  total_links: number;
  click_trend: Record<string, number>;
  top_links: TopLink[];
  country_distribution: Record<string, number>;
  device_distribution: Record<string, number>;
  date_range: {
    start: string;
    end: string;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  };
}

export interface JWTPayload {
  userId: string;
  email: string;
  name?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

export interface ApiError {
  error: string;
  message: string;
  code?: string;
}

// Utility types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}
