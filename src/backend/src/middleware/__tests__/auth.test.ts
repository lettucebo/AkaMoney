import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware, optionalAuthMiddleware, getAuthUser } from '../auth';
import { generateToken } from '../../services/jwt';

const JWT_SECRET = 'test-secret-key-12345';

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('authMiddleware', () => {
    it('should reject request without Authorization header', async () => {
      const app = new Hono<{ Bindings: { JWT_SECRET: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { JWT_SECRET };
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
      const app = new Hono<{ Bindings: { JWT_SECRET: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { JWT_SECRET };
        await next();
      });
      app.get('/protected', authMiddleware, (c) => c.json({ success: true }));

      const res = await app.request('/protected', {
        headers: { Authorization: 'Basic token123' }
      });
      expect(res.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const app = new Hono<{ Bindings: { JWT_SECRET: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { JWT_SECRET };
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
      const token = await generateToken(
        { userId: 'user-123', email: 'test@example.com', role: 'user' },
        JWT_SECRET,
        '1h'
      );

      const app = new Hono<{ Bindings: { JWT_SECRET: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { JWT_SECRET };
        await next();
      });
      app.get('/protected', authMiddleware, (c) => {
        const user = getAuthUser(c);
        return c.json({ success: true, userId: user?.userId });
      });

      const res = await app.request('/protected', {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.userId).toBe('user-123');
    });

    it('should return 500 when JWT_SECRET is not configured', async () => {
      const app = new Hono<{ Bindings: { JWT_SECRET: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { JWT_SECRET: '' };
        await next();
      });
      app.get('/protected', authMiddleware, (c) => c.json({ success: true }));

      const res = await app.request('/protected', {
        headers: { Authorization: 'Bearer some-token' }
      });
      expect(res.status).toBe(500);
      
      const body = await res.json();
      expect(body.error).toBe('Server Error');
    });
  });

  describe('optionalAuthMiddleware', () => {
    it('should allow request without Authorization header', async () => {
      const app = new Hono<{ Bindings: { JWT_SECRET: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { JWT_SECRET };
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
      const token = await generateToken(
        { userId: 'user-456', email: 'test2@example.com', role: 'admin' },
        JWT_SECRET,
        '1h'
      );

      const app = new Hono<{ Bindings: { JWT_SECRET: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { JWT_SECRET };
        await next();
      });
      app.get('/optional', optionalAuthMiddleware, (c) => {
        const user = getAuthUser(c);
        return c.json({ userId: user?.userId, role: user?.role });
      });

      const res = await app.request('/optional', {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.userId).toBe('user-456');
      expect(body.role).toBe('admin');
    });

    it('should ignore invalid token and continue without user', async () => {
      const app = new Hono<{ Bindings: { JWT_SECRET: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { JWT_SECRET };
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

    it('should ignore request without JWT_SECRET configured', async () => {
      const token = await generateToken(
        { userId: 'user-123', email: 'test@example.com', role: 'user' },
        JWT_SECRET,
        '1h'
      );

      const app = new Hono<{ Bindings: { JWT_SECRET: string } }>();
      app.use('*', async (c, next) => {
        (c.env as any) = { JWT_SECRET: '' };
        await next();
      });
      app.get('/optional', optionalAuthMiddleware, (c) => {
        const user = getAuthUser(c);
        return c.json({ user: user || null });
      });

      const res = await app.request('/optional', {
        headers: { Authorization: `Bearer ${token}` }
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
