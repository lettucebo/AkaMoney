import authService from './auth';
import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  UrlResponse,
  CreateUrlRequest,
  UpdateUrlRequest,
  AnalyticsResponse,
  PaginatedResponse,
  ApiError,
  UsageStats
} from '@/types';

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
    const response = await this.api.post<UrlResponse>('/api/shorten', data);
    return response.data;
  }

  async getUrls(page: number = 1, limit: number = 20): Promise<PaginatedResponse<UrlResponse>> {
    const response = await this.api.get<PaginatedResponse<UrlResponse>>('/api/urls', {
      params: { page, limit }
    });
    return response.data;
  }

  async getUrl(id: string): Promise<UrlResponse> {
    const response = await this.api.get<UrlResponse>(`/api/urls/${id}`);
    return response.data;
  }

  async updateUrl(id: string, data: UpdateUrlRequest): Promise<UrlResponse> {
    const response = await this.api.put<UrlResponse>(`/api/urls/${id}`, data);
    return response.data;
  }

  async deleteUrl(id: string): Promise<void> {
    await this.api.delete(`/api/urls/${id}`);
  }

  // Analytics
  async getAnalytics(shortCode: string): Promise<AnalyticsResponse> {
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

  // Usage Statistics
  async getUsageStats(): Promise<UsageStats> {
    const response = await this.api.get<UsageStats>('/api/stats/usage');
    return response.data;
  }
}

export default new ApiService();
