import authService, { isAuthSkipped } from './auth';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { applyMockUrlUpdate } from './mockUrlUpdate';
import { queryMockUrls } from './mockUrlList';
import { toUrlListApiParams } from '@/utils/urlListQuery';
import { markSessionExpired, type SessionExpiryReason } from '@/utils/sessionExpiry';
import type {
  UrlResponse,
  CreateUrlRequest,
  UpdateUrlRequest,
  AnalyticsResponse,
  OverallStatsResponse,
  UrlListQueryState,
  UrlListResponse,
  ApiError
} from '@/types';

/**
 * Mock URL data for development mode with skipped authentication.
 * 
 * This data is only used when `VITE_SKIP_AUTH=true` is set in development mode.
 * It provides sample URL entries for testing, screenshots, and UI demos
 * without requiring a real backend server.
 * 
 * **Mock Entries:**
 * - demo1: Example website with 42 clicks
 * - github: AkaMoney repository link with 128 clicks
 * - docs: Documentation page with 256 clicks
 * - archived: Archived content example with 89 clicks
 * 
 * **Note:** This array is mutable - created/updated/deleted URLs will modify it.
 * The state persists for the duration of the browser session but resets on page refresh.
 * 
 * To add or modify mock data for different testing scenarios, edit the entries below.
 */
const getInitialMockUrls = (): UrlResponse[] => [
  {
    id: 'mock-url-1',
    short_code: 'demo1',
    original_url: 'https://example.com/very-long-url-that-needs-shortening',
    short_url: 'https://aka.money/demo1',
    title: 'Example Website',
    description: 'A demo shortened URL for testing',
    image_url: 'https://picsum.photos/seed/demo1/1200/630',
    created_at: Date.now() - 86400000,
    updated_at: Date.now() - 86400000,
    is_active: true,
    click_count: 42
  },
  {
    id: 'mock-url-2',
    short_code: 'github',
    original_url: 'https://github.com/AkaMoney/AkaMoney',
    short_url: 'https://aka.money/github',
    title: 'AkaMoney Repository',
    description: 'Project GitHub repository',
    created_at: Date.now() - 172800000,
    updated_at: Date.now() - 172800000,
    is_active: true,
    click_count: 128
  },
  {
    id: 'mock-url-3',
    short_code: 'docs',
    original_url: 'https://docs.example.com/getting-started/introduction',
    short_url: 'https://aka.money/docs',
    title: 'Documentation',
    description: 'Getting started guide',
    image_url: 'https://picsum.photos/seed/docs/1200/630',
    created_at: Date.now() - 259200000,
    updated_at: Date.now() - 259200000,
    is_active: true,
    click_count: 256
  },
  {
    id: 'mock-url-4',
    short_code: 'archived',
    original_url: 'https://example.com/archived-content',
    short_url: 'https://aka.money/archived',
    title: 'Archived Link',
    description: 'This is an archived URL example',
    created_at: Date.now() - 345600000,
    updated_at: Date.now() - 86400000,
    is_active: false,
    click_count: 89
  }
];

// Mutable mock data store - initialized with default mock URLs
let mockUrls: UrlResponse[] = getInitialMockUrls();

/**
 * Resets mock URL data to initial state.
 * Useful for testing scenarios that need a fresh state.
 */
export function resetMockUrls(): void {
  mockUrls = getInitialMockUrls();
}

/**
 * Creates an error object that matches the structure expected by error handlers.
 * This ensures mock errors behave consistently with real API errors.
 */
function createMockApiError(message: string, status: number = 404): Error {
  const error = new Error(message) as Error & { response?: { data?: { message: string }; status: number } };
  error.response = {
    data: { message },
    status
  };
  return error;
}

/**
 * Rejected by the request interceptor when no acquired token is available.
 * Distinguishes an intentionally-aborted request (missing/invalid auth) from
 * a network/axios failure, without ever sending a request that has no valid
 * Authorization header.
 */
export class AuthTokenUnavailableError extends Error {
  constructor(public readonly reason: string) {
    super(`Request aborted: no acquired auth token available (${reason}).`);
    this.name = 'AuthTokenUnavailableError';
  }
}

export type AuthFailureHandler = (reason: SessionExpiryReason) => void;

let authFailureHandler: AuthFailureHandler | null = null;
let authFailureInFlight = false;

/**
 * Registers the single handler invoked when the API layer detects the
 * session can no longer be used (interaction-required/no-account/
 * initialization-failed from the request interceptor, or an unauthorized
 * 401 from the response interceptor). The router registers this once, at
 * router-creation time, so navigation only ever happens there - `api.ts`
 * itself never touches `window.location` or the router.
 *
 * Passing `null` clears the handler (used by tests, and reflects the state
 * before the router has registered one).
 */
export function registerAuthFailureHandler(handler: AuthFailureHandler | null): void {
  authFailureHandler = handler;
}

/**
 * Persists the expiry reason and, if a handler is registered, invokes it
 * exactly once for a burst of concurrent failures. Multiple requests that
 * fail in the same synchronous window (e.g. several in-flight calls all
 * losing their token together) must not each independently trigger
 * navigation/redirect-fuse accounting - only the first of the burst does,
 * and the in-flight flag resets on the next microtask so a later, distinct
 * failure can still trigger again.
 */
function triggerAuthFailure(reason: SessionExpiryReason): void {
  if (authFailureInFlight) {
    return;
  }
  authFailureInFlight = true;

  if (authFailureHandler) {
    authFailureHandler(reason);
  } else {
    // Before the router has registered a handler (e.g. during early
    // bootstrap), only persist the expiry marker. Never fall back to a
    // full-page navigation here.
    markSessionExpired(reason);
  }

  Promise.resolve().then(() => {
    authFailureInFlight = false;
  });
}

/** Maps a non-acquired `getToken()` status to a persisted expiry reason. */
function toExpiryReason(status: 'interaction-required' | 'initialization-failed' | 'no-account'): SessionExpiryReason {
  if (status === 'no-account') {
    return 'unauthorized';
  }
  return status;
}

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8787',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add request interceptor to include auth token
    this.api.interceptors.request.use(
      async (config) => {
        const tokenResult = await authService.getToken();

        if (tokenResult.status === 'acquired') {
          config.headers.Authorization = `Bearer ${tokenResult.token}`;
          // Update localStorage to keep it in sync
          localStorage.setItem('auth_token', tokenResult.token);
          return config;
        }

        if (
          tokenResult.status === 'interaction-required' ||
          tokenResult.status === 'no-account' ||
          tokenResult.status === 'initialization-failed'
        ) {
          triggerAuthFailure(toExpiryReason(tokenResult.status));
        }
        // A transient/'unavailable' failure must not invalidate the session
        // or trigger navigation - only abort this one request.

        // No acquired token: abort before the adapter/network request runs.
        // There is intentionally no cached-token fallback here.
        return Promise.reject(new AuthTokenUnavailableError(tokenResult.status));
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiError>) => {
        if (error.response?.status === 401) {
          const authHeader = error.config?.headers?.Authorization;
          const bearerMatch =
            typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/) : null;
          const failingToken = bearerMatch ? bearerMatch[1] : null;
          const currentToken = localStorage.getItem('auth_token');

          if (failingToken && currentToken && failingToken !== currentToken) {
            // A delayed 401 for a request that used an old token: the
            // session has already been successfully refreshed, so this
            // stale response must not tear down the new one.
            return Promise.reject(error);
          }

          localStorage.removeItem('auth_token');
          triggerAuthFailure('unauthorized');
        }
        return Promise.reject(error);
      }
    );
  }

  // URL Management
  async createUrl(data: CreateUrlRequest): Promise<UrlResponse> {
    // Return mock response in skip auth mode
    if (isAuthSkipped()) {
      const newUrl: UrlResponse = {
        id: `mock-url-${Date.now()}`,
        short_code: data.short_code || `short${Date.now()}`,
        original_url: data.original_url,
        short_url: `https://aka.money/${data.short_code || `short${Date.now()}`}`,
        title: data.title,
        description: data.description,
        image_url: data.image_url,
        created_at: Date.now(),
        updated_at: Date.now(),
        expires_at: data.expires_at,
        is_active: true,
        click_count: 0
      };
      mockUrls.unshift(newUrl);
      return newUrl;
    }

    const response = await this.api.post<UrlResponse>('/api/shorten', data);
    return response.data;
  }

  async getUrls(state: UrlListQueryState, limit: number = 20): Promise<UrlListResponse> {
    // Return mock data in skip auth mode
    if (isAuthSkipped()) {
      return queryMockUrls(mockUrls, state, limit);
    }

    const response = await this.api.get<UrlListResponse>('/api/urls', {
      params: toUrlListApiParams(state, limit)
    });
    return response.data;
  }

  async getUrl(id: string): Promise<UrlResponse> {
    // Return mock data in skip auth mode
    if (isAuthSkipped()) {
      const url = mockUrls.find(u => u.id === id);
      if (url) return url;
      throw createMockApiError('URL not found', 404);
    }

    const response = await this.api.get<UrlResponse>(`/api/urls/${id}`);
    return response.data;
  }

  async updateUrl(id: string, data: UpdateUrlRequest): Promise<UrlResponse> {
    // Return mock response in skip auth mode
    if (isAuthSkipped()) {
      const index = mockUrls.findIndex(u => u.id === id);
      if (index !== -1) {
        mockUrls[index] = applyMockUrlUpdate(mockUrls[index], data);
        return mockUrls[index];
      }
      throw createMockApiError('URL not found', 404);
    }

    const response = await this.api.put<UrlResponse>(`/api/urls/${id}`, data);
    return response.data;
  }

  async deleteUrl(id: string): Promise<void> {
    // Handle mock deletion in skip auth mode
    if (isAuthSkipped()) {
      const index = mockUrls.findIndex(u => u.id === id);
      if (index !== -1) {
        mockUrls.splice(index, 1);
      }
      return;
    }

    await this.api.delete(`/api/urls/${id}`);
  }

  // Analytics
  async getAnalytics(shortCode: string): Promise<AnalyticsResponse> {
    // Return mock analytics in skip auth mode
    if (isAuthSkipped()) {
      const url = mockUrls.find(u => u.short_code === shortCode);
      if (url) {
        return {
          url,
          total_clicks: url.click_count,
          clicks_by_date: {
            [new Date().toISOString().split('T')[0]]: Math.floor(url.click_count * 0.3),
            [new Date(Date.now() - 86400000).toISOString().split('T')[0]]: Math.floor(url.click_count * 0.4),
            [new Date(Date.now() - 172800000).toISOString().split('T')[0]]: Math.floor(url.click_count * 0.3)
          },
          clicks_by_country: { 'TW': Math.floor(url.click_count * 0.6), 'US': Math.floor(url.click_count * 0.4) },
          clicks_by_device: { 'Desktop': Math.floor(url.click_count * 0.7), 'Mobile': Math.floor(url.click_count * 0.3) },
          clicks_by_browser: { 'Chrome': Math.floor(url.click_count * 0.5), 'Firefox': Math.floor(url.click_count * 0.3), 'Safari': Math.floor(url.click_count * 0.2) },
          recent_clicks: []
        };
      }
      throw createMockApiError('URL not found', 404);
    }

    const response = await this.api.get<AnalyticsResponse>(`/api/analytics/${shortCode}`);
    return response.data;
  }

  async getPublicAnalytics(shortCode: string): Promise<{ short_code: string; total_clicks: number; created_at: number }> {
    const response = await this.api.get(`/api/public/analytics/${shortCode}`);
    return response.data;
  }

  // Overall Statistics
  async getOverallStats(startDate?: string, endDate?: string): Promise<OverallStatsResponse> {
    // Return mock overall stats in skip auth mode
    if (isAuthSkipped()) {
      const now = new Date();
      const start = startDate || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().split('T')[0];
      const end = endDate || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().split('T')[0];
      
      return {
        total_clicks: 515,
        active_links: 3,
        total_links: 4,
        click_trend: {
          [new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0]]: 45,
          [new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0]]: 62,
          [new Date(Date.now() - 4 * 86400000).toISOString().split('T')[0]]: 78,
          [new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]]: 91,
          [new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]]: 85,
          [new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0]]: 72,
          [new Date().toISOString().split('T')[0]]: 82
        },
        top_links: [
          { short_code: 'docs', original_url: 'https://docs.example.com/getting-started/introduction', click_count: 256, title: 'Documentation' },
          { short_code: 'github', original_url: 'https://github.com/AkaMoney/AkaMoney', click_count: 128, title: 'AkaMoney Repository' },
          { short_code: 'archived', original_url: 'https://example.com/archived-content', click_count: 89, title: 'Archived Link' },
          { short_code: 'demo1', original_url: 'https://example.com/very-long-url-that-needs-shortening', click_count: 42, title: 'Example Website' }
        ],
        country_distribution: {
          'TW': 310,
          'US': 103,
          'JP': 52,
          'CN': 30,
          'KR': 20
        },
        device_distribution: {
          'desktop': 360,
          'mobile': 130,
          'tablet': 25
        },
        date_range: {
          start,
          end
        }
      };
    }

    // Build query string with optional date parameters
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    const queryString = params.toString();
    const url = queryString ? `/api/stats/overall?${queryString}` : '/api/stats/overall';
    
    const response = await this.api.get<OverallStatsResponse>(url);
    return response.data;
  }

  // Health Check
  async healthCheck(): Promise<{ status: string; timestamp: number }> {
    const response = await this.api.get('/health');
    return response.data;
  }

  // Storage API

  // Get storage configuration
  async getStorageConfig(): Promise<{ configured: boolean; provider: string; hasPublicUrl: boolean }> {
    // Return mock config in skip auth mode
    if (isAuthSkipped()) {
      return {
        configured: true,
        provider: 'r2',
        hasPublicUrl: true
      };
    }

    const response = await this.api.get('/api/storage/config');
    return response.data;
  }

  // Upload an image
  async uploadImage(file: File): Promise<{
    key: string;
    url?: string;
    size?: number;
    contentType: string;
    originalName: string;
  }> {
    // Return mock response in skip auth mode
    if (isAuthSkipped()) {
      return {
        key: `uploads/mock-user/${Date.now()}-${file.name}`,
        url: `https://storage.example.com/uploads/mock-user/${Date.now()}-${file.name}`,
        size: file.size,
        contentType: file.type,
        originalName: file.name
      };
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await this.api.post('/api/storage/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  }

  // List user files
  async listFiles(limit: number = 50, cursor?: string): Promise<{
    files: Array<{
      key: string;
      size: number;
      lastModified?: string;
      contentType?: string;
      url?: string;
    }>;
    hasMore: boolean;
    cursor?: string;
  }> {
    // Return mock files in skip auth mode
    if (isAuthSkipped()) {
      return {
        files: [
          {
            key: 'uploads/mock-user/1702834567890-example.jpg',
            size: 102400,
            lastModified: new Date().toISOString(),
            contentType: 'image/jpeg',
            url: 'https://storage.example.com/uploads/mock-user/example.jpg'
          },
          {
            key: 'uploads/mock-user/1702834567891-logo.png',
            size: 51200,
            lastModified: new Date(Date.now() - 86400000).toISOString(),
            contentType: 'image/png',
            url: 'https://storage.example.com/uploads/mock-user/logo.png'
          }
        ],
        hasMore: false
      };
    }

    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    if (cursor) params.append('cursor', cursor);

    const response = await this.api.get(`/api/storage/files?${params.toString()}`);
    return response.data;
  }

  // Delete a file
  async deleteFile(key: string): Promise<void> {
    // Handle mock deletion in skip auth mode
    if (isAuthSkipped()) {
      return;
    }

    await this.api.delete(`/api/storage/files/${encodeURIComponent(key)}`);
  }
}

export default new ApiService();
