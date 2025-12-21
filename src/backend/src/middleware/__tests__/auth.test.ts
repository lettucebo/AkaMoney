import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware, optionalAuthMiddleware, getAuthUser } from '../auth';

// Mock the jose library
vi.mock('jose', () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => 'mocked-jwks')
}));

import { jwtVerify } from 'jose';

const TENANT_ID = 'test-tenant-id';
const CLIENT_ID = 'test-client-id';

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  describe('authMiddleware', () => {
    it('should reject request without Authorization header', async () => {
      const app = new Hono<{ Bindings: { ENTRA_ID_TENANT_ID: string; ENTRA_ID_CLIENT_ID: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { ENTRA_ID_TENANT_ID: TENANT_ID, ENTRA_ID_CLIENT_ID: CLIENT_ID };
        await next();
      });
      app.get('/protected', authMiddleware, (c) => c.json({ success: true }));

      const res = await app.request('/protected');
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Missing or invalid authorization header');
    });

    it('should reject request with invalid Authorization format', async () => {
      const app = new Hono<{ Bindings: { ENTRA_ID_TENANT_ID: string; ENTRA_ID_CLIENT_ID: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { ENTRA_ID_TENANT_ID: TENANT_ID, ENTRA_ID_CLIENT_ID: CLIENT_ID };
        await next();
      });
      app.get('/protected', authMiddleware, (c) => c.json({ success: true }));

      const res = await app.request('/protected', {
        headers: { Authorization: 'Basic token123' }
      });
      expect(res.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      vi.mocked(jwtVerify).mockRejectedValueOnce(new Error('Invalid token'));

      const app = new Hono<{ Bindings: { ENTRA_ID_TENANT_ID: string; ENTRA_ID_CLIENT_ID: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { ENTRA_ID_TENANT_ID: TENANT_ID, ENTRA_ID_CLIENT_ID: CLIENT_ID };
        await next();
      });
      app.get('/protected', authMiddleware, (c) => c.json({ success: true }));

      const res = await app.request('/protected', {
        headers: { Authorization: 'Bearer invalid-token' }
      });
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Invalid or expired token');
    });

    it('should allow request with valid token', async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: {
          oid: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        protectedHeader: { alg: 'RS256' }
      } as any);

      const app = new Hono<{ Bindings: { ENTRA_ID_TENANT_ID: string; ENTRA_ID_CLIENT_ID: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { ENTRA_ID_TENANT_ID: TENANT_ID, ENTRA_ID_CLIENT_ID: CLIENT_ID };
        await next();
      });
      app.get('/protected', authMiddleware, (c) => {
        const user = getAuthUser(c);
        return c.json({ success: true, userId: user?.userId });
      });

      const res = await app.request('/protected', {
        headers: { Authorization: 'Bearer valid-token' }
      });
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.userId).toBe('user-123');
    });

    it('should use sub claim if oid is not present', async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: {
          sub: 'user-456',
          preferred_username: 'test@example.com',
          name: 'Test User',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        protectedHeader: { alg: 'RS256' }
      } as any);

      const app = new Hono<{ Bindings: { ENTRA_ID_TENANT_ID: string; ENTRA_ID_CLIENT_ID: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { ENTRA_ID_TENANT_ID: TENANT_ID, ENTRA_ID_CLIENT_ID: CLIENT_ID };
        await next();
      });
      app.get('/protected', authMiddleware, (c) => {
        const user = getAuthUser(c);
        return c.json({ success: true, userId: user?.userId, email: user?.email });
      });

      const res = await app.request('/protected', {
        headers: { Authorization: 'Bearer valid-token' }
      });
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.userId).toBe('user-456');
      expect(body.email).toBe('test@example.com');
    });

    it('should reject token without user identifier', async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: {
          email: 'test@example.com',
          name: 'Test User',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        protectedHeader: { alg: 'RS256' }
      } as any);

      const app = new Hono<{ Bindings: { ENTRA_ID_TENANT_ID: string; ENTRA_ID_CLIENT_ID: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { ENTRA_ID_TENANT_ID: TENANT_ID, ENTRA_ID_CLIENT_ID: CLIENT_ID };
        await next();
      });
      app.get('/protected', authMiddleware, (c) => c.json({ success: true }));

      const res = await app.request('/protected', {
        headers: { Authorization: 'Bearer token-without-id' }
      });
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Invalid or expired token');
    });

    it('should return 500 when Entra ID configuration is missing', async () => {
      const app = new Hono<{ Bindings: { ENTRA_ID_TENANT_ID?: string; ENTRA_ID_CLIENT_ID?: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = {};
        await next();
      });
      app.get('/protected', authMiddleware, (c) => c.json({ success: true }));

      const res = await app.request('/protected', {
        headers: { Authorization: 'Bearer some-token' }
      });
      expect(res.status).toBe(500);
      
      const body = await res.json();
      expect(body.error).toBe('Server Error');
      expect(body.message).toBe('Authentication is not properly configured');
    });
  });

  describe('optionalAuthMiddleware', () => {
    it('should allow request without Authorization header', async () => {
      const app = new Hono<{ Bindings: { ENTRA_ID_TENANT_ID: string; ENTRA_ID_CLIENT_ID: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { ENTRA_ID_TENANT_ID: TENANT_ID, ENTRA_ID_CLIENT_ID: CLIENT_ID };
        await next();
      });
      app.get('/optional', optionalAuthMiddleware, (c) => {
        const user = getAuthUser(c);
        return c.json({ user: user || null });
      });

      const res = await app.request('/optional');
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.user).toBeNull();
    });

    it('should set user when valid token is provided', async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: {
          oid: 'user-456',
          email: 'test2@example.com',
          name: 'Admin User',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        protectedHeader: { alg: 'RS256' }
      } as any);

      const app = new Hono<{ Bindings: { ENTRA_ID_TENANT_ID: string; ENTRA_ID_CLIENT_ID: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { ENTRA_ID_TENANT_ID: TENANT_ID, ENTRA_ID_CLIENT_ID: CLIENT_ID };
        await next();
      });
      app.get('/optional', optionalAuthMiddleware, (c) => {
        const user = getAuthUser(c);
        return c.json({ userId: user?.userId, name: user?.name });
      });

      const res = await app.request('/optional', {
        headers: { Authorization: 'Bearer valid-token' }
      });
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.userId).toBe('user-456');
      expect(body.name).toBe('Admin User');
    });

    it('should ignore invalid token and continue without user', async () => {
      vi.mocked(jwtVerify).mockRejectedValueOnce(new Error('Invalid token'));

      const app = new Hono<{ Bindings: { ENTRA_ID_TENANT_ID: string; ENTRA_ID_CLIENT_ID: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { ENTRA_ID_TENANT_ID: TENANT_ID, ENTRA_ID_CLIENT_ID: CLIENT_ID };
        await next();
      });
      app.get('/optional', optionalAuthMiddleware, (c) => {
        const user = getAuthUser(c);
        return c.json({ user: user || null });
      });

      const res = await app.request('/optional', {
        headers: { Authorization: 'Bearer invalid-token' }
      });
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.user).toBeNull();
    });

    it('should ignore request without Entra ID configuration', async () => {
      const app = new Hono<{ Bindings: { ENTRA_ID_TENANT_ID?: string; ENTRA_ID_CLIENT_ID?: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = {};
        await next();
      });
      app.get('/optional', optionalAuthMiddleware, (c) => {
        const user = getAuthUser(c);
        return c.json({ user: user || null });
      });

      const res = await app.request('/optional', {
        headers: { Authorization: 'Bearer some-token' }
      });
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.user).toBeNull();
    });
  });

  describe('getAuthUser', () => {
    it('should return null when no user is set', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        const user = getAuthUser(c);
        return c.json({ user: user || null });
      });

      const res = await app.request('/test');
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.user).toBeNull();
    });
  });
});
