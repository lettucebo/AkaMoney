import type { Context } from 'hono';
import { cors as honoCors } from 'hono/cors';

/**
 * CORS configuration
 */
export const corsMiddleware = honoCors({
  origin: (origin) => {
    // Allow all origins in development
    if (process.env.ENVIRONMENT === 'development') {
      return origin;
    }
    
    // In production, allow specific domains
    const allowedOrigins = [
      'https://aka.money',
      'https://www.aka.money',
      'http://localhost:5173',
      'http://localhost:8787'
    ];
    
    return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
  credentials: true
});
