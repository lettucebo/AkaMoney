import { Hono } from 'hono';
import * as Sentry from '@sentry/cloudflare/nodejs_compat';
import type { Env } from './types';
import { getUrlByShortCode, observeClickRecording, recordClick } from './services';
import { createBackgroundClickErrorReporter, createSentryOptions } from './sentry';

export const app = new Hono<{ Bindings: Env }>();

// CORS middleware for public access
app.use('*', async (c, next) => {
  await next();
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
});

// Handle OPTIONS requests
app.options('*', (c) => {
  return new Response(null, { status: 204 });
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

  const url = await getUrlByShortCode(c.env.DB, shortCode);

  if (!url) {
    return c.json({ error: 'Not Found', message: 'Short URL not found' }, 404);
  }

  // Check if URL is expired
  if (url.expires_at && url.expires_at < Date.now()) {
    return c.json({ error: 'Gone', message: 'This short URL has expired' }, 410);
  }

  // Capture the request-scoped Sentry client before registering background work,
  // because the waitUntil continuation no longer resolves to the request client.
  const reportBackgroundClickError = createBackgroundClickErrorReporter();

  // Record click asynchronously
  c.executionCtx.waitUntil(
    observeClickRecording(
      recordClick(c.env.DB, c.req.raw, shortCode, url.id),
      { shortCode, urlId: url.id },
      reportBackgroundClickError
    )
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

const workerHandler: ExportedHandler<Env> = {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
};

const sentryHandler: ExportedHandler<Env> = Sentry.withSentry<Env>(
  createSentryOptions,
  workerHandler
);

export default sentryHandler;
