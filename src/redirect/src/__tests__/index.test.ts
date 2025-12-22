import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../index';

// Mock D1 database
const createMockDb = () => ({
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  first: vi.fn(),
  run: vi.fn(),
});

// Mock execution context
const createMockExecutionCtx = () => ({
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
});

describe('Redirect Endpoint', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let mockExecutionCtx: ReturnType<typeof createMockExecutionCtx>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockExecutionCtx = createMockExecutionCtx();
    vi.clearAllMocks();
  });

  describe('Archived URL Redirect', () => {
    it('should redirect archived URLs to configured ARCHIVED_REDIRECT_URL', async () => {
      const archivedUrl = {
        id: 'archived-id',
        short_code: 'archived123',
        original_url: 'https://example.com',
        user_id: null,
        title: null,
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        expires_at: null,
        is_active: 0, // Archived
        click_count: 10,
      };

      mockDb.first.mockResolvedValue(archivedUrl);

      const req = new Request('http://localhost/archived123');
      const env = {
        DB: mockDb as any,
        ENVIRONMENT: 'test',
        ARCHIVED_REDIRECT_URL: 'https://custom.archive.page',
      };

      const res = await app.fetch(req, env, mockExecutionCtx as any);

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('https://custom.archive.page');
    });

    it('should use default ARCHIVED_REDIRECT_URL when not configured', async () => {
      const archivedUrl = {
        id: 'archived-id',
        short_code: 'archived456',
        original_url: 'https://example.com',
        user_id: null,
        title: null,
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        expires_at: null,
        is_active: 0, // Archived
        click_count: 5,
      };

      mockDb.first.mockResolvedValue(archivedUrl);

      const req = new Request('http://localhost/archived456');
      const env = {
        DB: mockDb as any,
        ENVIRONMENT: 'test',
        // ARCHIVED_REDIRECT_URL not set - should use default
      };

      const res = await app.fetch(req, env, mockExecutionCtx as any);

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('https://aka.money/archived');
    });

    it('should NOT record clicks for archived URLs', async () => {
      const archivedUrl = {
        id: 'archived-id',
        short_code: 'archived789',
        original_url: 'https://example.com',
        user_id: null,
        title: null,
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        expires_at: null,
        is_active: 0, // Archived
        click_count: 15,
      };

      mockDb.first.mockResolvedValue(archivedUrl);

      const req = new Request('http://localhost/archived789');
      const env = {
        DB: mockDb as any,
        ENVIRONMENT: 'test',
        ARCHIVED_REDIRECT_URL: 'https://archive.page',
      };

      await app.fetch(req, env, mockExecutionCtx as any);

      // Verify waitUntil was NOT called (no click recording for archived URLs)
      expect(mockExecutionCtx.waitUntil).not.toHaveBeenCalled();
    });

    it('should redirect active URLs to original URL with click recording', async () => {
      const activeUrl = {
        id: 'active-id',
        short_code: 'active123',
        original_url: 'https://example.com/target',
        user_id: null,
        title: null,
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        expires_at: null,
        is_active: 1, // Active
        click_count: 50,
      };

      mockDb.first.mockResolvedValue(activeUrl);
      mockDb.run.mockResolvedValue({ success: true });

      const req = new Request('http://localhost/active123');
      const env = {
        DB: mockDb as any,
        ENVIRONMENT: 'test',
        ARCHIVED_REDIRECT_URL: 'https://archive.page',
      };

      const res = await app.fetch(req, env, mockExecutionCtx as any);

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('https://example.com/target');
      // Verify waitUntil WAS called (click recording for active URLs)
      expect(mockExecutionCtx.waitUntil).toHaveBeenCalled();
    });

    it('should return 404 for non-existent short codes', async () => {
      mockDb.first.mockResolvedValue(null);

      const req = new Request('http://localhost/nonexistent');
      const env = {
        DB: mockDb as any,
        ENVIRONMENT: 'test',
      };

      const res = await app.fetch(req, env, mockExecutionCtx as any);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({
        error: 'Not Found',
        message: 'Short URL not found',
      });
    });

    it('should return 410 for expired URLs', async () => {
      const expiredUrl = {
        id: 'expired-id',
        short_code: 'expired123',
        original_url: 'https://example.com',
        user_id: null,
        title: null,
        description: null,
        created_at: Date.now() - 1000000,
        updated_at: Date.now() - 1000000,
        expires_at: Date.now() - 1000, // Expired
        is_active: 1, // Active but expired
        click_count: 5,
      };

      mockDb.first.mockResolvedValue(expiredUrl);

      const req = new Request('http://localhost/expired123');
      const env = {
        DB: mockDb as any,
        ENVIRONMENT: 'test',
      };

      const res = await app.fetch(req, env, mockExecutionCtx as any);

      expect(res.status).toBe(410);
      const body = await res.json();
      expect(body).toEqual({
        error: 'Gone',
        message: 'This short URL has expired',
      });
    });
  });

  describe('Health Check', () => {
    it('should return 200 for health check endpoint', async () => {
      const req = new Request('http://localhost/health');
      const env = {
        DB: mockDb as any,
        ENVIRONMENT: 'test',
      };

      const res = await app.fetch(req, env, mockExecutionCtx as any);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('status', 'ok');
      expect(body).toHaveProperty('service', 'redirect');
      expect(body).toHaveProperty('timestamp');
    });
  });
});
