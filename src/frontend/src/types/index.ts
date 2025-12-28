// API Types
export interface UrlResponse {
  id: string;
  short_code: string;
  original_url: string;
  short_url: string;
  title?: string;
  description?: string;
  image_url?: string;
  created_at: number;
  updated_at: number;
  expires_at?: number;
  is_active: boolean;
  click_count: number;
}

export interface CreateUrlRequest {
  original_url: string;
  short_code?: string;
  title?: string;
  description?: string;
  image_url?: string;
  expires_at?: number;
}

export interface UpdateUrlRequest {
  original_url?: string;
  title?: string;
  description?: string;
  image_url?: string;
  expires_at?: number;
  is_active?: boolean;
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

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface ApiError {
  error: string;
  message: string;
  code?: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface D1UsageStats {
  storage: {
    estimatedSizeMB: number;
    estimatedSizeGB: number;
    limitGB: number;
    usagePercent: number;
  };
  reads: {
    total: number;
    limitPerDay: number;
    usagePercent: number;
  };
  writes: {
    total: number;
    limitPerDay: number;
    usagePercent: number;
  };
  dateRange: {
    start: string;
    end: string;
  };
  dataSource: 'cloudflare' | 'estimated';
  fallbackReason?: string;
  timestamp: string;
}
