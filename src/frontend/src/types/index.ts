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
  short_code: string;
  title?: string;
  description?: string;
  image_url?: string;
  expires_at?: number;
}

export interface UpdateUrlRequest {
  original_url?: string;
  /** `null` clears the field; omitting it leaves the stored value untouched. */
  title?: string | null;
  /** `null` clears the field; omitting it leaves the stored value untouched. */
  description?: string | null;
  /** `null` clears the field; omitting it leaves the stored value untouched. */
  image_url?: string | null;
  /** `null` clears the expiry: the API treats any defined value as an explicit write. */
  expires_at?: number | null;
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

/**
 * Status filter accepted by `GET /api/urls`.
 *
 * Mirrors `getLinkStatus`: 'active' means still redirecting, 'expired' means
 * unarchived but past its expiry, 'archived' means `is_active` is not set.
 */
export type UrlListStatus = 'all' | 'active' | 'expired' | 'archived';

/** Sort order accepted by `GET /api/urls`. */
export type UrlListSort = 'default' | 'clicks-desc' | 'clicks-asc' | 'created-asc' | 'updated-desc';

/**
 * Account-wide status totals returned alongside the URL list.
 *
 * These respect the active `search` term but ignore the active `status`, so the
 * toolbar can show every tab's total for the current search at once.
 * `active` + `expired` + `archived` always equals `all`.
 */
export interface UrlStatusCounts {
  all: number;
  active: number;
  expired: number;
  archived: number;
}

/** `GET /api/urls` response: a paginated list plus the status counts. */
export interface UrlListResponse extends PaginatedResponse<UrlResponse> {
  counts: UrlStatusCounts;
}

/** Fully resolved list query - the shape the store, router and API all share. */
export interface UrlListQueryState {
  page: number;
  search: string;
  status: UrlListStatus;
  sort: UrlListSort;
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

