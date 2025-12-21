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

    // Define both v1.0 and v2.0 issuer formats
    const v1Issuer = `https://sts.windows.net/${tenantId}/`;
    const v2Issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;

    console.log('Verifying token with:', {
      tenantId,
      clientId,
      expectedIssuers: [v1Issuer, v2Issuer],
      expectedAudiences: [clientId, `api://${clientId}`]
    });

    // Verify the token - accept both v1.0 and v2.0 issuers and both audience formats
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: [v2Issuer, v1Issuer],
      audience: [clientId, `api://${clientId}`],
    });

    console.log('Token verified successfully:', {
      userId: payload.oid || payload.sub,
      issuer: payload.iss,
      audience: payload.aud
    });

    // Extract user information from token
    const userId = (payload.oid as string) || (payload.sub as string);
    const email = payload.email as string || payload.preferred_username as string;
    const name = payload.name as string;

    if (!userId) {
      console.error('Token missing user identifier');
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
    // Log detailed error information
    console.error('Token verification failed:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      tenantId,
      clientId
    });
    return null;
  }
}

/**
 * JWT Authentication middleware
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ 
      error: 'Unauthorized', 
      message: 'Missing or invalid authorization header',
      details: 'Expected format: Authorization: Bearer <token>'
    }, 401);
  }

  const token = authHeader.substring(7);
  
  // Get tenant ID and client ID from environment
  const tenantId = c.env.ENTRA_ID_TENANT_ID;
  const clientId = c.env.ENTRA_ID_CLIENT_ID;
  
  if (!tenantId || !clientId) {
    console.error('Entra ID configuration is missing:', { 
      hasTenantId: !!tenantId, 
      hasClientId: !!clientId 
    });
    return c.json({ 
      error: 'Server Error', 
      message: 'Authentication is not properly configured',
      details: 'ENTRA_ID_TENANT_ID or ENTRA_ID_CLIENT_ID is missing'
    }, 500);
  }

  try {
    const user = await verifyEntraIdToken(token, tenantId, clientId);

    if (!user) {
      return c.json({ 
        error: 'Unauthorized', 
        message: 'Invalid or expired token',
        details: 'Token verification failed - check server logs for details'
      }, 401);
    }

    // Store user info in context
    c.set('user', user);
    
    await next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    const errorResponse: any = {
      error: 'Internal Server Error',
      message: 'Authentication failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    };
    
    // Only include stack trace in non-production environments
    if (c.env.ENVIRONMENT !== 'production' && error instanceof Error) {
      errorResponse.stack = error.stack;
    }
    
    return c.json(errorResponse, 500);
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
