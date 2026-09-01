import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { corsMiddleware } from '../cors';

/**
 * Normalizes an Access-Control-Allow-Headers value into a sorted, lowercase,
 * trimmed list so assertions are order- and case-insensitive but still detect
 * extra or duplicated entries.
 */
function parseAllowHeaders(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter((header) => header.length > 0)
    .sort();
}

const EXPECTED_ALLOW_HEADERS = ['authorization', 'baggage', 'content-type', 'sentry-trace'];

describe('CORS Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use('*', corsMiddleware);
    app.get('/test', (c) => c.json({ success: true }));
    app.options('/test', (c) => c.text(''));
  });

  it('should add CORS headers for allowed origin', async () => {
    const res = await app.request('/test', {
      headers: { Origin: 'http://localhost:5173' }
    });
    
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('should handle localhost origins', async () => {
    const res = await app.request('/test', {
      headers: { Origin: 'http://localhost:3000' }
    });
    
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
  });

  it('should handle production domain', async () => {
    const res = await app.request('/test', {
      headers: { Origin: 'https://aka.money' }
    });
    
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://aka.money');
  });

  it('should handle Cloudflare Pages deployment domain', async () => {
    const res = await app.request('/test', {
      headers: { Origin: 'https://akamoney-admin.pages.dev' }
    });
    
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://akamoney-admin.pages.dev');
  });

  it('should return first allowed origin for unrecognized origin', async () => {
    const res = await app.request('/test', {
      headers: { Origin: 'https://malicious.com' }
    });
    
    expect(res.status).toBe(200);
    // For unrecognized origins, returns the first allowed origin
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://aka.money');
  });

  it('should handle preflight requests', async () => {
    const res = await app.request('/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization'
      }
    });
    
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
  });

  it('should expose Content-Length header', async () => {
    const res = await app.request('/test', {
      headers: { Origin: 'http://localhost:5173' }
    });
    
    expect(res.headers.get('Access-Control-Expose-Headers')).toBe('Content-Length');
  });

  it('should allow Sentry trace headers for the production admin origin', async () => {
    const res = await app.request('/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://admin.aka.money',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'sentry-trace,baggage'
      }
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.aka.money');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(parseAllowHeaders(res.headers.get('Access-Control-Allow-Headers'))).toEqual(
      EXPECTED_ALLOW_HEADERS
    );
  });

  it('should allow Sentry trace headers for the local development origin', async () => {
    const res = await app.request('/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'sentry-trace,baggage'
      }
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(parseAllowHeaders(res.headers.get('Access-Control-Allow-Headers'))).toEqual(
      EXPECTED_ALLOW_HEADERS
    );
  });

  it('should not reflect unapproved request headers in the preflight response', async () => {
    const res = await app.request('/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://admin.aka.money',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'x-unapproved'
      }
    });

    const allowHeaders = parseAllowHeaders(res.headers.get('Access-Control-Allow-Headers'));

    expect(res.status).toBe(204);
    expect(allowHeaders).not.toContain('x-unapproved');
    expect(allowHeaders).toEqual(EXPECTED_ALLOW_HEADERS);
  });

  it('should keep the existing methods, expose headers and max age preflight contract', async () => {
    const res = await app.request('/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://admin.aka.money',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'sentry-trace,baggage'
      }
    });

    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET,POST,PUT,DELETE,OPTIONS');
    expect(res.headers.get('Access-Control-Expose-Headers')).toBe('Content-Length');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
  });
});
