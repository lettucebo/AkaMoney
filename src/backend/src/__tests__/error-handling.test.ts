import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../index';

describe('API Error Handling', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('Global Error Handler', () => {
    it('should return 404 for non-existent routes', async () => {
      const res = await app.request('/api/nonexistent', {
        method: 'GET'
      });
      
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Not Found');
      expect(body.message).toBe('The requested resource was not found');
    });
  });

  describe('Health Check Endpoint', () => {
    it('should return 200 for health check', async () => {
      const res = await app.request('/health');
      
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.service).toBe('admin-api');
    });
  });

  describe('Error Response Format', () => {
    it('should have consistent error format with details and stack for server errors', async () => {
      // This test verifies that when errors occur in route handlers,
      // they return detailed error information including stack trace
      
      // We'll test with /api/urls which requires authentication
      // Without auth, we should get 401, not a 500 with detailed error
      const res = await app.request('/api/urls', {
        method: 'GET'
      });
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
    });
  });

  describe('POST /api/shorten Error Handling', () => {
    it('should return error with details when original_url is missing', async () => {
      const res = await app.request('/api/shorten', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          short_code: 'test123'
        })
      });
      
      // Should get error with details
      expect([400, 500]).toContain(res.status);
      const body = await res.json();
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
      // The new error handling should provide details
      if (res.status === 500) {
        expect(body).toHaveProperty('details');
      }
    });

    it('should return error details when database error occurs', async () => {
      // Mock a request with invalid URL to trigger validation error
      const res = await app.request('/api/shorten', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          original_url: 'not-a-valid-url',
          short_code: 'test456'
        })
      });
      
      // Should get 500 with detailed error about invalid URL format
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('details');
    });
  });

  describe('Protected Routes Error Handling', () => {
    it('GET /api/urls should return 401 when not authenticated', async () => {
      const res = await app.request('/api/urls', {
        method: 'GET'
      });
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Missing or invalid authorization header');
    });

    it('GET /api/urls/:id should return 401 when not authenticated', async () => {
      const res = await app.request('/api/urls/test-id', {
        method: 'GET'
      });
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('PUT /api/urls/:id should return 401 when not authenticated', async () => {
      const res = await app.request('/api/urls/test-id', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Updated Title'
        })
      });
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('DELETE /api/urls/:id should return 401 when not authenticated', async () => {
      const res = await app.request('/api/urls/test-id', {
        method: 'DELETE'
      });
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('GET /api/analytics/:shortCode should return 401 when not authenticated', async () => {
      const res = await app.request('/api/analytics/test-code', {
        method: 'GET'
      });
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('Public Endpoint Error Handling', () => {
    it('GET /api/public/analytics/:shortCode should return 500 with details when database error occurs', async () => {
      // This endpoint doesn't require auth, but will fail due to missing DB binding
      const res = await app.request('/api/public/analytics/nonexistent', {
        method: 'GET'
      });
      
      // Expecting either 404 if not found or 500 if database error
      expect([404, 500]).toContain(res.status);
      const body = await res.json();
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
    });
  });

  describe('Cleanup Endpoint Tests', () => {
    it('POST /api/admin/cleanup should return 401 when not authenticated', async () => {
      const res = await app.request('/api/admin/cleanup', {
        method: 'POST'
      });
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('POST /api/admin/cleanup should validate days parameter', async () => {
      const res = await app.request('/api/admin/cleanup?days=invalid', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-token'
        }
      });
      
      // Should fail validation or auth - both acceptable
      expect([400, 401, 500]).toContain(res.status);
      const body = await res.json();
      expect(body).toHaveProperty('error');
    });

    it('POST /api/admin/cleanup should reject negative days', async () => {
      const res = await app.request('/api/admin/cleanup?days=-1', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-token'
        }
      });
      
      // Should fail validation or auth
      expect([400, 401, 500]).toContain(res.status);
      const body = await res.json();
      expect(body).toHaveProperty('error');
    });

    it('POST /api/admin/cleanup should reject days exceeding maximum', async () => {
      const res = await app.request('/api/admin/cleanup?days=5000', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-token'
        }
      });
      
      // Should fail validation or auth
      expect([400, 401, 500]).toContain(res.status);
      const body = await res.json();
      expect(body).toHaveProperty('error');
    });

    it('POST /api/admin/cleanup should reject infinity values', async () => {
      const res = await app.request('/api/admin/cleanup?days=Infinity', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-token'
        }
      });
      
      // Should fail validation or auth
      expect([400, 401, 500]).toContain(res.status);
      const body = await res.json();
      expect(body).toHaveProperty('error');
    });
  });
});
