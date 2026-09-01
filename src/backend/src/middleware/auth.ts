import type { Context } from 'hono';
import type { Env, JWTPayload } from '../types';
import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import { upsertUser } from '../services/user';

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

function redactText(value: string | undefined, redactions: Array<string | undefined>): string | undefined {
  if (!value) {
    return value;
  }

  const orderedRedactions = redactions
    .filter((value): value is string => !!value)
    .sort((left, right) => right.length - left.length);

  return orderedRedactions.reduce(
    (text, secret) => text.split(secret).join('[redacted-identity]'),
    value
  );
}

function safeErrorDetails(error: unknown, redactions: Array<string | undefined>) {
  return {
    error: redactText(error instanceof Error ? error.message : String(error), redactions),
    stack: redactText(error instanceof Error ? error.stack : undefined, redactions)
  };
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

    // The verified user identifier is deliberately absent: this log is captured as a
    // Sentry log/breadcrumb, and the Entra object id is the raw account identifier.
    console.log('Token verified successfully:', {
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
      message: 'Authentication is not properly configured'
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

    // Upsert user in database (create if new, update if exists)
    // Gracefully handle database errors to prevent authentication failures
    try {
      const dbUser = await upsertUser(
        c.env.DB,
        user.email,
        user.name || 'Unknown User',
        'entra',
        user.userId
      );

      // Store user info in context with database user ID
      c.set('user', {
        ...user,
        role: dbUser.role,
        dbUserId: dbUser.id
      });
    } catch (dbError) {
      console.error('Failed to upsert user in auth middleware:', safeErrorDetails(dbError, [user.userId, user.email, user.name]));
      // Fall back to using the verified token payload without DB-derived fields
      c.set('user', user);
    }
    
    await next();
  } catch (error) {
    const user = getAuthUser(c);
    console.error('Auth middleware error:', safeErrorDetails(error, [user?.userId, user?.email, user?.name]));
    return c.json({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    }, 500);
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
        // Upsert user in database (create if new, update if exists)
        try {
          const dbUser = await upsertUser(
            c.env.DB,
            user.email,
            user.name || 'Unknown User',
            'entra',
            user.userId
          );

          c.set('user', {
            ...user,
            role: dbUser.role,
            dbUserId: dbUser.id
          });
        } catch (error) {
          console.error('Failed to upsert user in optional auth:', safeErrorDetails(error, [user.userId, user.email, user.name]));
          // Continue without setting user context if upsert fails
        }
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
