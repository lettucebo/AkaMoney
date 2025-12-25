import authService, { isAuthSkipped } from './auth';
import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  UrlResponse,
  CreateUrlRequest,
  UpdateUrlRequest,
  AnalyticsResponse,
  PaginatedResponse,
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
    short_url: 'http://localhost:8787/demo1',
    title: 'Example Website',
    description: 'A demo shortened URL for testing',
    created_at: Date.now() - 86400000,
    updated_at: Date.now() - 86400000,
    is_active: true,
    click_count: 42
  },
  {
    id: 'mock-url-2',
    short_code: 'github',
    original_url: 'https://github.com/AkaMoney/AkaMoney',
    short_url: 'http://localhost:8787/github',
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
    short_url: 'http://localhost:8787/docs',
    title: 'Documentation',
    description: 'Getting started guide',
    created_at: Date.now() - 259200000,
    updated_at: Date.now() - 259200000,
    is_active: true,
    click_count: 256
  },
  {
    id: 'mock-url-4',
    short_code: 'archived',
    original_url: 'https://example.com/archived-content',
    short_url: 'http://localhost:8787/archived',
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
        // Try to get a fresh token from MSAL
        const token = await authService.getToken();
        
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          // Update localStorage to keep it in sync
          localStorage.setItem('auth_token', token);
        } else {
          // Fallback to cached token if MSAL fails
          const cachedToken = localStorage.getItem('auth_token');
          if (cachedToken) {
            config.headers.Authorization = `Bearer ${cachedToken}`;
          }
        }
        return config;
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
          // Handle unauthorized access
          localStorage.removeItem('auth_token');
          // Store current path for redirect after login
          const currentPath = window.location.pathname + window.location.search;
          if (currentPath !== '/login') {
            sessionStorage.setItem('redirect_after_login', currentPath);
          }
          window.location.href = '/login';
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
        short_url: `http://localhost:8787/${data.short_code || `short${Date.now()}`}`,
        title: data.title,
        description: data.description,
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

  async getUrls(page: number = 1, limit: number = 20): Promise<PaginatedResponse<UrlResponse>> {
    // Return mock data in skip auth mode
    if (isAuthSkipped()) {
      const start = (page - 1) * limit;
      const end = start + limit;
      return {
        data: mockUrls.slice(start, end),
        pagination: {
          page,
          limit,
          total: mockUrls.length,
          total_pages: Math.ceil(mockUrls.length / limit)
        }
      };
    }

    const response = await this.api.get<PaginatedResponse<UrlResponse>>('/api/urls', {
      params: { page, limit }
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
        mockUrls[index] = { ...mockUrls[index], ...data, updated_at: Date.now() };
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

  // Health Check
  async healthCheck(): Promise<{ status: string; timestamp: number }> {
    const response = await this.api.get('/health');
    return response.data;
  }
}

export default new ApiService();
