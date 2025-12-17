import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { corsMiddleware } from '../cors';

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
});
