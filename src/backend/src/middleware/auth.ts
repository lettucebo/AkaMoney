import type { Context } from 'hono';
import type { Env, JWTPayload } from '../types';
import { jwtVerify, createRemoteJWKSet } from 'jose';

/**
 * JWT Authentication middleware
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized', message: 'Missing or invalid authorization header' }, 401);
  }

  const token = authHeader.substring(7);
  
  // Get tenant ID from environment
  const tenantId = c.env.ENTRA_ID_TENANT_ID;
  const clientId = c.env.ENTRA_ID_CLIENT_ID;
  
  if (!tenantId || !clientId) {
    console.error('Entra ID configuration is missing');
    return c.json({ error: 'Server Error', message: 'Authentication is not properly configured' }, 500);
  }

  try {
    // Microsoft's JWKS endpoint
    const JWKS = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
    );

    // Verify the token
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      audience: clientId,
    });

    // Extract user information from token
    const userId = (payload.oid as string) || (payload.sub as string);
    const email = payload.email as string || payload.preferred_username as string;
    const name = payload.name as string;

    if (!userId) {
      return c.json({ error: 'Unauthorized', message: 'Invalid token: missing user identifier' }, 401);
    }

    // Store user info in context (matching the existing JWTPayload interface)
    c.set('user', {
      userId,
      email,
      name,
      iat: payload.iat,
      exp: payload.exp
    });
    
    await next();
  } catch (error) {
    console.error('Token validation failed:', error);
    return c.json({ error: 'Unauthorized', message: 'Invalid or expired token' }, 401);
  }
}

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export async function optionalAuthMiddleware(c: Context<{ Bindings: Env }>, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const tenantId = c.env.ENTRA_ID_TENANT_ID;
    const clientId = c.env.ENTRA_ID_CLIENT_ID;

    if (tenantId && clientId) {
      try {
        // Microsoft's JWKS endpoint
        const JWKS = createRemoteJWKSet(
          new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
        );

        // Verify the token
        const { payload } = await jwtVerify(token, JWKS, {
          issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
          audience: clientId,
        });

        // Extract user information from token
        const userId = (payload.oid as string) || (payload.sub as string);
        const email = payload.email as string || payload.preferred_username as string;
        const name = payload.name as string;

        if (userId) {
          c.set('user', {
            userId,
            email,
            name,
            iat: payload.iat,
            exp: payload.exp
          });
        }
      } catch (error) {
        // Silently ignore token validation errors for optional auth
        console.debug('Optional auth token validation failed:', error);
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
