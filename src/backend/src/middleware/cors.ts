import type { Context } from 'hono';
import { cors as honoCors } from 'hono/cors';

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
    
    // Allow localhost origins in development or if origin matches allowed list
    if (origin && (origin.includes('localhost') || allowedOrigins.includes(origin))) {
      return origin;
    }
    
    return allowedOrigins[0];
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
  credentials: true
});
