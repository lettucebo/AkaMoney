import { Hono } from 'hono';
import type { Env } from './types';
import { getUrlByShortCode, recordClick } from './services';

const app = new Hono<{ Bindings: Env }>();

// CORS middleware for public access
app.use('*', async (c, next) => {
  await next();
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
});

// Handle OPTIONS requests
app.options('*', (c) => {
  return c.text('', 204);
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    service: 'redirect',
    timestamp: Date.now() 
  });
});

// Redirect endpoint (public - no authentication required)
app.get('/:shortCode', async (c) => {
  const shortCode = c.req.param('shortCode');
  
  // Skip health endpoint (already handled)
  if (shortCode === 'health') {
    return c.notFound();
  }

  const url = await getUrlByShortCode(c.env.DB, shortCode);

  if (!url) {
    return c.json({ error: 'Not Found', message: 'Short URL not found' }, 404);
  }

  // Check if URL is expired
  if (url.expires_at && url.expires_at < Date.now()) {
    return c.json({ error: 'Gone', message: 'This short URL has expired' }, 410);
  }

  // Record click asynchronously
  c.executionCtx.waitUntil(
    recordClick(c.env.DB, c.req.raw, shortCode, url.id)
  );

  // Redirect to original URL
  return c.redirect(url.original_url, 302);
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found', message: 'The requested resource was not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Redirect service error:', err);
  return c.json({ error: 'Internal Server Error', message: 'An unexpected error occurred' }, 500);
});

export default app;
