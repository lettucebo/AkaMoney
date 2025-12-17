/**
 * Shared types between frontend and backend
 */

export interface UrlData {
  id: string;
  short_code: string;
  original_url: string;
  user_id: string | null;
  title: string | null;
  description: string | null;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
  is_active: boolean;
  click_count: number;
}

export interface CreateUrlDto {
  original_url: string;
  short_code?: string;
  title?: string;
  description?: string;
  expires_at?: number;
}

export interface UpdateUrlDto {
  original_url?: string;
  title?: string;
  description?: string;
  expires_at?: number;
  is_active?: boolean;
}

export interface ClickData {
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

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedData<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}
