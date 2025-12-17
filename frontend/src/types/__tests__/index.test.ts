import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import types only for type checking
import type { UrlResponse, CreateUrlRequest, UpdateUrlRequest, AnalyticsResponse } from '@/types';

// Test API service types
describe('Types', () => {
  describe('UrlResponse', () => {
    it('should have correct structure', () => {
      const url: UrlResponse = {
        id: 'test-id',
        short_code: 'abc123',
        original_url: 'https://example.com',
        short_url: 'https://short.url/abc123',
        created_at: Date.now(),
        updated_at: Date.now(),
        is_active: true,
        click_count: 0
      };
      
      expect(url.id).toBeDefined();
      expect(url.short_code).toBeDefined();
      expect(url.original_url).toBeDefined();
    });

    it('should allow optional properties', () => {
      const url: UrlResponse = {
        id: 'test-id',
        short_code: 'abc123',
        original_url: 'https://example.com',
        short_url: 'https://short.url/abc123',
        title: 'Optional Title',
        description: 'Optional Description',
        expires_at: Date.now() + 86400000,
        created_at: Date.now(),
        updated_at: Date.now(),
        is_active: true,
        click_count: 5
      };
      
      expect(url.title).toBe('Optional Title');
      expect(url.description).toBe('Optional Description');
      expect(url.expires_at).toBeDefined();
    });
  });

  describe('CreateUrlRequest', () => {
    it('should require original_url', () => {
      const request: CreateUrlRequest = {
        original_url: 'https://example.com'
      };
      
      expect(request.original_url).toBeDefined();
    });

    it('should allow optional properties', () => {
      const request: CreateUrlRequest = {
        original_url: 'https://example.com',
        short_code: 'custom',
        title: 'My Link',
        description: 'Description',
        expires_at: Date.now()
      };
      
      expect(request.short_code).toBe('custom');
    });
  });

  describe('UpdateUrlRequest', () => {
    it('should allow partial updates', () => {
      const request: UpdateUrlRequest = {
        title: 'New Title'
      };
      
      expect(request.title).toBe('New Title');
      expect(request.original_url).toBeUndefined();
    });
  });

  describe('AnalyticsResponse', () => {
    it('should have correct structure', () => {
      const analytics: AnalyticsResponse = {
        url: {
          id: 'test-id',
          short_code: 'abc123',
          original_url: 'https://example.com',
          short_url: 'https://short.url/abc123',
          created_at: Date.now(),
          updated_at: Date.now(),
          is_active: true,
          click_count: 100
        },
        total_clicks: 100,
        clicks_by_date: { '2024-01-01': 50, '2024-01-02': 50 },
        clicks_by_country: { 'US': 60, 'UK': 40 },
        clicks_by_device: { 'desktop': 70, 'mobile': 30 },
        clicks_by_browser: { 'chrome': 80, 'firefox': 20 },
        recent_clicks: []
      };
      
      expect(analytics.total_clicks).toBe(100);
      expect(analytics.clicks_by_date['2024-01-01']).toBe(50);
    });
  });
});
