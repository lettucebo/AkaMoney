import type { Context } from 'hono';
import type { Env, JWTPayload } from '../types';
import { verifyToken } from '../services/jwt';

/**
 * JWT Authentication middleware
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized', message: 'Missing or invalid authorization header' }, 401);
  }

  const token = authHeader.substring(7);
  const jwtSecret = c.env.JWT_SECRET;

  if (!jwtSecret) {
    console.error('JWT_SECRET is not configured');
    return c.json({ error: 'Server Error', message: 'Authentication is not properly configured' }, 500);
  }

  const payload = await verifyToken(token, jwtSecret);

  if (!payload) {
    return c.json({ error: 'Unauthorized', message: 'Invalid or expired token' }, 401);
  }

  // Store user info in context
  c.set('user', payload);
  
  await next();
}

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export async function optionalAuthMiddleware(c: Context<{ Bindings: Env }>, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET;

    if (jwtSecret) {
      const payload = await verifyToken(token, jwtSecret);
      if (payload) {
        c.set('user', payload);
      }
    }
  }
  
  await next();
}

/**
 * Get authenticated user from context
 */
export function getAuthUser(c: Context): JWTPayload | null {
  return c.get('user') || null;
}
