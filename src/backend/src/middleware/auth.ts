import type { Context } from 'hono';
import type { Env, JWTPayload } from '../types';
import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

// Cache JWKS keysets by tenant ID to avoid repeated network requests
const jwksCache = new Map<string, JWTVerifyGetKey>();

/**
 * Get or create a cached JWKS keyset for a tenant
 */
function getJWKS(tenantId: string): JWTVerifyGetKey {
  if (!jwksCache.has(tenantId)) {
    const jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
    );
    jwksCache.set(tenantId, jwks);
  }
  return jwksCache.get(tenantId)!;
}

/**
 * Verify Microsoft Entra ID token and extract user information
 */
async function verifyEntraIdToken(
  token: string,
  tenantId: string,
  clientId: string
): Promise<JWTPayload | null> {
  try {
    const JWKS = getJWKS(tenantId);

    // Verify the token - accept both v1.0 and v2.0 issuers
    // v1.0: https://sts.windows.net/{tenantId}/
    // v2.0: https://login.microsoftonline.com/{tenantId}/v2.0
    const v1Issuer = `https://sts.windows.net/${tenantId}/`;
    const v2Issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;

    // Audience can be either clientId or api://{clientId}
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: [v2Issuer, v1Issuer],
      audience: [clientId, `api://${clientId}`],
    });

    // Extract user information from token
    const userId = (payload.oid as string) || (payload.sub as string);
    const email = payload.email as string || payload.preferred_username as string;
    const name = payload.name as string;

    if (!userId) {
      return null;
    }

    return {
      userId,
      email,
      name,
      iat: payload.iat,
      exp: payload.exp
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

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

  const user = await verifyEntraIdToken(token, tenantId, clientId);

  if (!user) {
    return c.json({ error: 'Unauthorized', message: 'Invalid or expired token' }, 401);
  }

  // Store user info in context
  c.set('user', user);
  
  await next();
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
      const user = await verifyEntraIdToken(token, tenantId, clientId);
      if (user) {
        c.set('user', user);
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
