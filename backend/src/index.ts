import { Hono } from 'hono';
import type { Env } from './types';
import { corsMiddleware } from './middleware/cors';
import { errorMiddleware } from './middleware/error';
import { authMiddleware, optionalAuthMiddleware, getAuthUser } from './middleware/auth';
import {
  createUrl,
  getUrlByShortCode,
  getUrlById,
  updateUrl,
  deleteUrl,
  getUserUrls
} from './services/url';
import { recordClick, getAnalytics } from './services/analytics';
import type { CreateUrlRequest, UpdateUrlRequest } from './types';

const app = new Hono<{ Bindings: Env }>();

// Apply global middleware
app.use('*', corsMiddleware);
app.use('*', errorMiddleware);

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

// Redirect endpoint (public)
app.get('/:shortCode', async (c) => {
  const shortCode = c.req.param('shortCode');
  
  // Check if it's an API route
  if (shortCode === 'api' || shortCode === 'health') {
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

// API Routes

// Create short URL (with optional auth)
app.post('/api/shorten', optionalAuthMiddleware, async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json<CreateUrlRequest>();

  if (!body.original_url) {
    return c.json({ error: 'Bad Request', message: 'original_url is required' }, 400);
  }

  const url = await createUrl(c.env.DB, body, user?.userId);
  
  return c.json(url, 201);
});

// Get all URLs for authenticated user
app.get('/api/urls', authMiddleware, async (c) => {
  const user = getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
  }

  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');

  const result = await getUserUrls(c.env.DB, user.userId, page, limit);

  return c.json({
    data: result.urls,
    pagination: {
      page,
      limit,
      total: result.total,
      total_pages: Math.ceil(result.total / limit)
    }
  });
});

// Get specific URL
app.get('/api/urls/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const url = await getUrlById(c.env.DB, id);

  if (!url) {
    return c.json({ error: 'Not Found', message: 'URL not found' }, 404);
  }

  return c.json({
    id: url.id,
    short_code: url.short_code,
    original_url: url.original_url,
    short_url: url.short_code,
    title: url.title || undefined,
    description: url.description || undefined,
    created_at: url.created_at,
    updated_at: url.updated_at,
    expires_at: url.expires_at || undefined,
    is_active: url.is_active === 1,
    click_count: url.click_count
  });
});

// Update URL
app.put('/api/urls/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<UpdateUrlRequest>();

  const url = await updateUrl(c.env.DB, id, body);

  return c.json(url);
});

// Delete URL
app.delete('/api/urls/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');

  await deleteUrl(c.env.DB, id);

  return c.json({ message: 'URL deleted successfully' });
});

// Get analytics for a short code
app.get('/api/analytics/:shortCode', authMiddleware, async (c) => {
  const shortCode = c.req.param('shortCode');

  const analytics = await getAnalytics(c.env.DB, shortCode);

  if (!analytics) {
    return c.json({ error: 'Not Found', message: 'URL not found' }, 404);
  }

  return c.json(analytics);
});

// Get public analytics (limited info, no auth required)
app.get('/api/public/analytics/:shortCode', async (c) => {
  const shortCode = c.req.param('shortCode');

  const analytics = await getAnalytics(c.env.DB, shortCode);

  if (!analytics) {
    return c.json({ error: 'Not Found', message: 'URL not found' }, 404);
  }

  // Return limited public analytics
  return c.json({
    short_code: analytics.url.short_code,
    total_clicks: analytics.total_clicks,
    created_at: analytics.url.created_at
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found', message: 'The requested resource was not found' }, 404);
});

export default app;
