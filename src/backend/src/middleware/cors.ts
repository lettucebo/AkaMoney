import type { Context } from 'hono';
import { cors as honoCors } from 'hono/cors';

/**
 * Decides whether an Origin header value is a local development origin.
 *
 * The origin is accepted only when it is the canonical browser serialization of
 * an `http`/`https` URL whose hostname is exactly `localhost`. Only the port may
 * vary, for local tooling. Requiring `origin === parsed.origin` rejects any
 * path, query, fragment, userinfo, trailing slash, explicit default port or
 * casing variant, and the exact hostname check rejects substring lookalikes
 * such as `https://localhost.attacker.example`, subdomains, trailing-dot hosts
 * and loopback IP literals. Parsing is contained so a malformed or opaque
 * origin (including `null`) never throws and falls through to the caller's
 * fail-closed fallback.
 */
function isLocalDevelopmentOrigin(origin: string): boolean {
  if (!origin) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  return (
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    parsed.hostname === 'localhost' &&
    origin === parsed.origin
  );
}

/**
 * CORS configuration
 */
export const corsMiddleware = honoCors({
  origin: (origin) => {
    // In production, allow specific domains
    const allowedOrigins = [
      'https://aka.money',
      'https://admin.aka.money',
      'https://akamoney-admin.pages.dev',
      'http://localhost:5173',
      'http://localhost:8787'
    ];
    
    // Allow canonical localhost origins in development, or an exact allowed origin
    if (isLocalDevelopmentOrigin(origin) || allowedOrigins.includes(origin)) {
      return origin;
    }
    
    return allowedOrigins[0];
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'sentry-trace', 'baggage'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
  credentials: true
});
