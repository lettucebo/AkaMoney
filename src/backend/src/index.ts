import { Hono } from 'hono';
import type { Env } from './types';
import { corsMiddleware } from './middleware/cors';
import { errorMiddleware } from './middleware/error';
import { authMiddleware, optionalAuthMiddleware, getAuthUser } from './middleware/auth';
import {
  createUrl,
  getUrlById,
  updateUrl,
  deleteUrl,
  getUserUrls
} from './services/url';
import { getAnalytics } from './services/analytics';
import { cleanupOldClickRecords } from './services/cleanup';
import { fetchD1Analytics } from './services/cloudflare-analytics';
import type { CreateUrlRequest, UpdateUrlRequest } from './types';
import type { ExecutionContext, ExportedHandler, ScheduledEvent } from '@cloudflare/workers-types';

const app = new Hono<{ Bindings: Env }>();

// Apply global middleware
app.use('*', corsMiddleware);
app.use('*', errorMiddleware);

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'admin-api', timestamp: Date.now() });
});

// API Routes
// Note: URL redirect functionality is handled by the separate redirect service (akamoney-redirect)
// This admin API requires JWT authentication for all management endpoints

// Create short URL (with optional auth)
app.post('/api/shorten', optionalAuthMiddleware, async (c) => {
  try {
    const user = getAuthUser(c);
    
    console.log('Creating short URL', user ? `for user: ${user.userId}` : '(anonymous)');

    // Check if DB is available
    if (!c.env.DB) {
      console.error('Database binding (DB) is not available');
      return c.json({ 
        error: 'Configuration Error', 
        message: 'Database is not configured',
        details: 'DB binding is missing from worker environment'
      }, 500);
    }

    const body = await c.req.json<CreateUrlRequest>();

    if (!body.original_url) {
      return c.json({ error: 'Bad Request', message: 'original_url is required' }, 400);
    }

    const url = await createUrl(c.env.DB, body, user?.userId);

    console.log('Short URL created successfully:', { id: url.id, short_code: url.short_code });
    
    return c.json(url, 201);
  } catch (error) {
    console.error('Error in POST /api/shorten:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to create short URL',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 500);
  }
});

// Get all URLs for authenticated user
app.get('/api/urls', authMiddleware, async (c) => {
  try {
    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    console.log('Fetching URLs for user:', user.userId);

    // Check if DB is available
    if (!c.env.DB) {
      console.error('Database binding (DB) is not available');
      return c.json({ 
        error: 'Configuration Error', 
        message: 'Database is not configured',
        details: 'DB binding is missing from worker environment'
      }, 500);
    }

    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');

    console.log('Query parameters:', { page, limit, userId: user.userId });

    const result = await getUserUrls(c.env.DB, user.userId, page, limit);

    console.log('URLs fetched successfully:', { 
      count: result.urls.length, 
      total: result.total 
    });

    return c.json({
      data: result.urls,
      pagination: {
        page,
        limit,
        total: result.total,
        total_pages: Math.ceil(result.total / limit)
      }
    });
  } catch (error) {
    console.error('Error in GET /api/urls:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to fetch URLs',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 500);
  }
});

// Get specific URL
app.get('/api/urls/:id', authMiddleware, async (c) => {
  try {
    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    console.log('Fetching URL by ID:', c.req.param('id'), 'for user:', user.userId);

    // Check if DB is available
    if (!c.env.DB) {
      console.error('Database binding (DB) is not available');
      return c.json({ 
        error: 'Configuration Error', 
        message: 'Database is not configured',
        details: 'DB binding is missing from worker environment'
      }, 500);
    }

    const id = c.req.param('id');
    const url = await getUrlById(c.env.DB, id);

    if (!url) {
      return c.json({ error: 'Not Found', message: 'URL not found' }, 404);
    }

    // Check ownership
    if (url.user_id && url.user_id !== user.userId) {
      return c.json({ error: 'Forbidden', message: 'You do not have permission to access this URL' }, 403);
    }

    console.log('URL fetched successfully:', { id: url.id, short_code: url.short_code });

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
  } catch (error) {
    console.error('Error in GET /api/urls/:id:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to fetch URL',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 500);
  }
});

// Update URL
app.put('/api/urls/:id', authMiddleware, async (c) => {
  try {
    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    console.log('Updating URL:', c.req.param('id'), 'for user:', user.userId);

    // Check if DB is available
    if (!c.env.DB) {
      console.error('Database binding (DB) is not available');
      return c.json({ 
        error: 'Configuration Error', 
        message: 'Database is not configured',
        details: 'DB binding is missing from worker environment'
      }, 500);
    }

    const id = c.req.param('id');
    const body = await c.req.json<UpdateUrlRequest>();

    const url = await updateUrl(c.env.DB, id, body, user.userId);

    console.log('URL updated successfully:', { id: url.id, short_code: url.short_code });

    return c.json(url);
  } catch (error) {
    console.error('Error in PUT /api/urls/:id:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to update URL',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 500);
  }
});

// Delete URL
app.delete('/api/urls/:id', authMiddleware, async (c) => {
  try {
    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    console.log('Deleting URL:', c.req.param('id'), 'for user:', user.userId);

    // Check if DB is available
    if (!c.env.DB) {
      console.error('Database binding (DB) is not available');
      return c.json({ 
        error: 'Configuration Error', 
        message: 'Database is not configured',
        details: 'DB binding is missing from worker environment'
      }, 500);
    }

    const id = c.req.param('id');

    await deleteUrl(c.env.DB, id, user.userId);

    console.log('URL deleted successfully:', { id });

    return c.json({ message: 'URL deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/urls/:id:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to delete URL',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 500);
  }
});

// Get analytics for a short code
app.get('/api/analytics/:shortCode', authMiddleware, async (c) => {
  try {
    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    console.log('Fetching analytics for short code:', c.req.param('shortCode'), 'for user:', user.userId);

    // Check if DB is available
    if (!c.env.DB) {
      console.error('Database binding (DB) is not available');
      return c.json({ 
        error: 'Configuration Error', 
        message: 'Database is not configured',
        details: 'DB binding is missing from worker environment'
      }, 500);
    }

    const shortCode = c.req.param('shortCode');

    const analytics = await getAnalytics(c.env.DB, shortCode, user.userId);

    if (!analytics) {
      return c.json({ error: 'Not Found', message: 'URL not found' }, 404);
    }

    console.log('Analytics fetched successfully:', { short_code: shortCode, total_clicks: analytics.total_clicks });

    return c.json(analytics);
  } catch (error) {
    console.error('Error in GET /api/analytics/:shortCode:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to fetch analytics',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 500);
  }
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

// Get D1 database usage statistics
app.get('/api/stats/d1', authMiddleware, async (c) => {
  try {
    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Constants for estimation (used as fallback)
    const BYTES_PER_CLICK_RECORD = 500;  // Estimated bytes per click record
    const BYTES_PER_URL = 300;            // Estimated bytes per URL record
    const READS_PER_CLICK = 3;            // Each click: 1 read for URL + 2 for analytics
    const WRITES_PER_CLICK = 1;           // Each click: 1 write to click_records

    // Get total record counts for size estimation
    const totalClicksResult = await c.env.DB
      .prepare('SELECT COUNT(*) as count FROM click_records')
      .first<{ count: number }>();
    
    const totalClicks = totalClicksResult?.count || 0;

    const totalUrlsResult = await c.env.DB
      .prepare('SELECT COUNT(*) as count FROM urls')
      .first<{ count: number }>();
    
    const totalUrls = totalUrlsResult?.count || 0;

    // Estimate database size (rough calculation)
    const estimatedSizeBytes = (totalClicks * BYTES_PER_CLICK_RECORD) + (totalUrls * BYTES_PER_URL);
    const estimatedSizeMB = estimatedSizeBytes / (1024 * 1024);

    // D1 Free tier limits
    const freeStorageLimitGB = 5;
    const freeStorageLimitMB = freeStorageLimitGB * 1024;
    const storageUsagePercent = (estimatedSizeMB / freeStorageLimitMB) * 100;

    const freeReadLimitPerDay = 5000000; // 5M reads/day
    const freeWriteLimitPerDay = 100000; // 100K writes/day

    // Helper function to estimate daily operations from local DB
    const estimateDailyOperations = async (): Promise<{ reads: number; writes: number }> => {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayStartTimestamp = todayStart.getTime();

      const todayClicksResult = await c.env.DB
        .prepare('SELECT COUNT(*) as count FROM click_records WHERE clicked_at >= ?')
        .bind(todayStartTimestamp)
        .first<{ count: number }>();
      
      const todayClicks = todayClicksResult?.count || 0;
      return {
        reads: todayClicks * READS_PER_CLICK,
        writes: todayClicks * WRITES_PER_CLICK
      };
    };

    // Try to fetch real analytics from Cloudflare GraphQL API
    let actualDailyReads = 0;
    let actualDailyWrites = 0;
    let dataSource = 'estimated';
    let fallbackReason: string | undefined;

    const accountId = c.env.D1_ANALYTICS_ACCOUNT_ID;
    const databaseId = c.env.D1_ANALYTICS_DATABASE_ID;
    const apiToken = c.env.D1_ANALYTICS_API_TOKEN;

    // Check if all required credentials are available
    if (accountId && databaseId && apiToken) {
      try {
        console.info('Fetching real D1 analytics from Cloudflare GraphQL API...');
        const analytics = await fetchD1Analytics(accountId, databaseId, apiToken);
        
        actualDailyReads = analytics.readQueries;
        actualDailyWrites = analytics.writeQueries;
        dataSource = 'cloudflare';
        
        console.info('Successfully fetched D1 analytics:', { 
          readQueries: actualDailyReads, 
          writeQueries: actualDailyWrites 
        });
      } catch (error) {
        console.error('Failed to fetch Cloudflare D1 analytics, falling back to estimation:', error);
        fallbackReason = error instanceof Error ? error.message : 'Unknown error';
        // Fall back to estimation
        const estimated = await estimateDailyOperations();
        actualDailyReads = estimated.reads;
        actualDailyWrites = estimated.writes;
      }
    } else {
      // Credentials not configured, use estimation
      console.info('Cloudflare credentials not configured, using estimation');
      fallbackReason = 'Cloudflare API credentials not configured';
      
      const estimated = await estimateDailyOperations();
      actualDailyReads = estimated.reads;
      actualDailyWrites = estimated.writes;
    }

    const readsUsagePercent = (actualDailyReads / freeReadLimitPerDay) * 100;
    const writesUsagePercent = (actualDailyWrites / freeWriteLimitPerDay) * 100;

    return c.json({
      storage: {
        estimatedSizeMB: parseFloat(estimatedSizeMB.toFixed(2)),
        estimatedSizeGB: parseFloat((estimatedSizeMB / 1024).toFixed(4)),
        limitGB: freeStorageLimitGB,
        usagePercent: parseFloat(storageUsagePercent.toFixed(2))
      },
      reads: {
        daily: actualDailyReads,
        limitPerDay: freeReadLimitPerDay,
        usagePercent: parseFloat(readsUsagePercent.toFixed(2))
      },
      writes: {
        daily: actualDailyWrites,
        limitPerDay: freeWriteLimitPerDay,
        usagePercent: parseFloat(writesUsagePercent.toFixed(2))
      },
      dataSource,
      fallbackReason,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching D1 stats:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to fetch D1 statistics',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Manual cleanup trigger (for testing/admin)
app.post('/api/admin/cleanup', authMiddleware, async (c) => {
  const user = getAuthUser(c);

  // Note: Currently all authenticated users can trigger cleanup.
  // To restrict to admin users only, implement role-based access control:
  // if (user.role !== 'admin') {
  //   return c.json({ error: 'Forbidden', message: 'Admin role required' }, 403);
  // }

  try {
    const daysParam = c.req.query('days') || '365';
    const retentionDays = parseInt(daysParam, 10);
    
    // Validate retention days parameter at API layer for better UX
    // Service layer also validates for defense in depth
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
      return c.json({
        error: 'Invalid parameter',
        message: 'days parameter must be a positive integer'
      }, 400);
    }
    
    if (retentionDays > 3650) {
      return c.json({
        error: 'Invalid parameter',
        message: 'days parameter cannot exceed 3650 (10 years)'
      }, 400);
    }
    
    console.log(`Manual cleanup triggered by user: ${user.userId}, retention days: ${retentionDays}`);
    const result = await cleanupOldClickRecords(c.env.DB, retentionDays);

    return c.json({
      message: 'Cleanup completed successfully',
      deleted: result.deleted,
      cutoffDate: result.cutoffDate.toISOString(),
      retentionDays
    });
  } catch (error) {
    console.error('Manual cleanup failed:', error);
    return c.json({
      error: 'Cleanup failed',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found', message: 'The requested resource was not found' }, 404);
});

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    path: c.req.path,
    method: c.req.method
  });

  return c.json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    details: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    path: c.req.path
  }, 500);
});

// Export app for testing
export { app };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Cron trigger fired:', new Date(event.scheduledTime).toISOString());
    
    try {
      const result = await cleanupOldClickRecords(env.DB, 365);
      
      console.log('Cleanup summary:', {
        deleted: result.deleted,
        cutoffDate: result.cutoffDate.toISOString(),
        scheduledTime: new Date(event.scheduledTime).toISOString(),
        cron: event.cron
      });
    } catch (error) {
      console.error('Cleanup failed:', error);
      // Don't throw - Cloudflare Workers automatically retries failed cron jobs,
      // which could lead to duplicate cleanup attempts or cascading failures
    }
  }
} satisfies ExportedHandler<Env>;
