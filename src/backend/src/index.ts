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
import { getAnalytics, getOverallStats } from './services/analytics';
import { cleanupOldClickRecords } from './services/cleanup';
import { fetchD1Analytics } from './services/cloudflare-analytics';
import { createStorageProvider, isStorageConfigured, getStorageConfig } from './services/storage';
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

// Get overall statistics for all user's URLs
app.get('/api/stats/overall', authMiddleware, async (c) => {
  try {
    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    console.log('Fetching overall stats for user:', user.userId);

    // Check if DB is available
    if (!c.env.DB) {
      console.error('Database binding (DB) is not available');
      return c.json({
        error: 'Configuration Error',
        message: 'Database is not configured',
        details: 'DB binding is missing from worker environment'
      }, 500);
    }

    // Parse optional date range from query parameters
    const startDateParam = c.req.query('startDate');
    const endDateParam = c.req.query('endDate');

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    // Validate that both dates are provided together or neither
    if ((startDateParam && !endDateParam) || (!startDateParam && endDateParam)) {
      return c.json({
        error: 'Bad Request',
        message: 'Both startDate and endDate must be provided together'
      }, 400);
    }

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam + 'T00:00:00.000Z');
      endDate = new Date(endDateParam + 'T23:59:59.999Z');

      // Validate dates are valid
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return c.json({
          error: 'Bad Request',
          message: 'Invalid date format. Use YYYY-MM-DD format'
        }, 400);
      }

      // Validate start date is before or equal to end date
      if (startDate > endDate) {
        return c.json({
          error: 'Bad Request',
          message: 'startDate must be before or equal to endDate'
        }, 400);
      }
    }

    const stats = await getOverallStats(c.env.DB, user.userId, startDate, endDate);

    console.log('Overall stats fetched successfully:', {
      total_clicks: stats.total_clicks,
      total_links: stats.total_links
    });

    return c.json(stats);
  } catch (error) {
    console.error('Error in GET /api/stats/overall:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to fetch overall statistics',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 500);
  }
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
    // Helper function to estimate operations for a date range from local DB
    const estimateOperationsForRange = async (rangeStartDate?: Date, rangeEndDate?: Date): Promise<{ reads: number; writes: number }> => {
      let startTimestamp: number;
      let endTimestamp: number;
      
      if (rangeStartDate && rangeEndDate) {
        // Use provided date range
        startTimestamp = rangeStartDate.getTime();
        // Add one day to make it inclusive of the end date
        const inclusiveEnd = new Date(rangeEndDate);
        inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1);
        endTimestamp = inclusiveEnd.getTime();
      } else {
        // Default to current month
        const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
        const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
        startTimestamp = monthStart.getTime();
        endTimestamp = monthEnd.getTime();
      }

      const clicksResult = await c.env.DB
        .prepare('SELECT COUNT(*) as count FROM click_records WHERE clicked_at >= ? AND clicked_at < ?')
        .bind(startTimestamp, endTimestamp)
        .first<{ count: number }>();
      
      const clicks = clicksResult?.count || 0;
      return {
        reads: clicks * READS_PER_CLICK,
        writes: clicks * WRITES_PER_CLICK
      };
    };

    // Try to fetch real analytics from Cloudflare GraphQL API
    let actualTotalReads = 0;
    let actualTotalWrites = 0;
    let dataSource = 'estimated';
    let fallbackReason: string | undefined;

    const accountId = c.env.D1_ANALYTICS_ACCOUNT_ID;
    const databaseId = c.env.D1_ANALYTICS_DATABASE_ID;
    const apiToken = c.env.D1_ANALYTICS_API_TOKEN;

    // Parse optional date range from query parameters
    // Format: YYYY-MM-DD
    const startDateParam = c.req.query('startDate');
    const endDateParam = c.req.query('endDate');
    
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    
    // Validate that both dates are provided together or neither
    if ((startDateParam && !endDateParam) || (!startDateParam && endDateParam)) {
      return c.json({
        error: 'Bad Request',
        message: 'Both startDate and endDate must be provided together'
      }, 400);
    }
    
    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam + 'T00:00:00.000Z');
      endDate = new Date(endDateParam + 'T00:00:00.000Z');
      
      // Validate dates are valid
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return c.json({
          error: 'Bad Request',
          message: 'Invalid date format. Use YYYY-MM-DD format'
        }, 400);
      }
      
      // Validate start date is before or equal to end date
      if (startDate > endDate) {
        return c.json({
          error: 'Bad Request',
          message: 'startDate must be before or equal to endDate'
        }, 400);
      }
    }

    // Check if all required credentials are available
    if (accountId && databaseId && apiToken) {
      try {
        console.info('Fetching real D1 analytics from Cloudflare GraphQL API...');
        const analytics = await fetchD1Analytics(accountId, databaseId, apiToken, startDate, endDate);
        
        actualTotalReads = analytics.readQueries;
        actualTotalWrites = analytics.writeQueries;
        dataSource = 'cloudflare';
        
        console.info('Successfully fetched D1 analytics:', { 
          readQueries: actualTotalReads, 
          writeQueries: actualTotalWrites 
        });
      } catch (error) {
        console.error('Failed to fetch Cloudflare D1 analytics, falling back to estimation:', error);
        fallbackReason = error instanceof Error ? error.message : 'Unknown error';
        // Fall back to estimation for the requested date range
        const estimated = await estimateOperationsForRange(startDate, endDate);
        actualTotalReads = estimated.reads;
        actualTotalWrites = estimated.writes;
      }
    } else {
      // Credentials not configured, use estimation
      console.info('Cloudflare credentials not configured, using estimation');
      fallbackReason = 'Cloudflare API credentials not configured';
      
      const estimated = await estimateOperationsForRange(startDate, endDate);
      actualTotalReads = estimated.reads;
      actualTotalWrites = estimated.writes;
    }

    // Calculate usage percentage based on average daily usage over the date range
    // to avoid comparing multi-day totals directly against daily limits
    const msPerDay = 1000 * 60 * 60 * 24;
    let daysInRange = 1;
    
    if (startDate && endDate) {
      daysInRange = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / msPerDay) + 1);
    } else {
      // Default is current month
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
      daysInRange = monthEnd.getUTCDate();
    }
    
    const averageDailyReads = actualTotalReads / daysInRange;
    const averageDailyWrites = actualTotalWrites / daysInRange;
    
    const readsUsagePercent = (averageDailyReads / freeReadLimitPerDay) * 100;
    const writesUsagePercent = (averageDailyWrites / freeWriteLimitPerDay) * 100;

    // Calculate actual date range used for display
    // If custom dates provided, use them; otherwise calculate current month
    let displayStartDate: string;
    let displayEndDate: string;
    
    if (startDate && endDate) {
      displayStartDate = startDate.toISOString().split('T')[0];
      displayEndDate = endDate.toISOString().split('T')[0];
    } else {
      // Calculate current month range
      const now = new Date();
      const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      // Using day 0 of the next month returns the last day of the current month
      const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 0, 0, 0, 0));
      displayStartDate = firstDay.toISOString().split('T')[0];
      displayEndDate = lastDay.toISOString().split('T')[0];
    }

    return c.json({
      storage: {
        estimatedSizeMB: parseFloat(estimatedSizeMB.toFixed(2)),
        estimatedSizeGB: parseFloat((estimatedSizeMB / 1024).toFixed(4)),
        limitGB: freeStorageLimitGB,
        usagePercent: parseFloat(storageUsagePercent.toFixed(2))
      },
      reads: {
        total: actualTotalReads,
        limitPerDay: freeReadLimitPerDay,
        usagePercent: parseFloat(readsUsagePercent.toFixed(2))
      },
      writes: {
        total: actualTotalWrites,
        limitPerDay: freeWriteLimitPerDay,
        usagePercent: parseFloat(writesUsagePercent.toFixed(2))
      },
      dateRange: {
        start: displayStartDate,
        end: displayEndDate
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

// Storage API Routes

// Get storage configuration info
app.get('/api/storage/config', authMiddleware, async (c) => {
  try {
    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    const configured = isStorageConfigured(c.env);
    const config = getStorageConfig(c.env);

    return c.json({
      configured,
      provider: config.provider,
      hasPublicUrl: !!config.publicUrl
    });
  } catch (error) {
    console.error('Error getting storage config:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to get storage configuration',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Upload an image
app.post('/api/storage/upload', authMiddleware, async (c) => {
  try {
    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    if (!isStorageConfigured(c.env)) {
      return c.json({ 
        error: 'Configuration Error', 
        message: 'Storage is not configured' 
      }, 500);
    }

    const storage = createStorageProvider(c.env);
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return c.json({ error: 'Bad Request', message: 'No file provided' }, 400);
    }

    // Validate file type (only images allowed)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ 
        error: 'Bad Request', 
        message: 'Invalid file type. Only images are allowed (JPEG, PNG, GIF, WebP, SVG)' 
      }, 400);
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return c.json({ 
        error: 'Bad Request', 
        message: 'File too large. Maximum size is 10MB' 
      }, 400);
    }

    // Generate unique key with user prefix
    const timestamp = Date.now();
    const extension = file.name.split('.').pop() || 'bin';
    const key = `uploads/${user.userId}/${timestamp}-${crypto.randomUUID()}.${extension}`;

    const arrayBuffer = await file.arrayBuffer();
    
    const result = await storage.upload(key, arrayBuffer, {
      contentType: file.type,
      customMetadata: {
        originalName: file.name,
        uploadedBy: user.userId,
        uploadedAt: new Date().toISOString()
      }
    });

    console.log('File uploaded successfully:', { key: result.key, size: result.size });

    return c.json({
      key: result.key,
      url: result.url,
      size: result.size,
      contentType: file.type,
      originalName: file.name
    }, 201);
  } catch (error) {
    console.error('Error uploading file:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to upload file',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Get file info
app.get('/api/storage/files/:key{.+}', authMiddleware, async (c) => {
  try {
    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    if (!isStorageConfigured(c.env)) {
      return c.json({ 
        error: 'Configuration Error', 
        message: 'Storage is not configured' 
      }, 500);
    }

    const storage = createStorageProvider(c.env);
    const key = c.req.param('key');

    const info = await storage.getInfo(key);
    
    if (!info) {
      return c.json({ error: 'Not Found', message: 'File not found' }, 404);
    }

    return c.json({
      key: info.key,
      size: info.size,
      lastModified: info.lastModified?.toISOString(),
      contentType: info.contentType,
      url: storage.getPublicUrl?.(key)
    });
  } catch (error) {
    console.error('Error getting file info:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to get file info',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// List user's files
app.get('/api/storage/files', authMiddleware, async (c) => {
  try {
    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    if (!isStorageConfigured(c.env)) {
      return c.json({ 
        error: 'Configuration Error', 
        message: 'Storage is not configured' 
      }, 500);
    }

    const storage = createStorageProvider(c.env);
    const limit = parseInt(c.req.query('limit') || '50');
    const cursor = c.req.query('cursor') || undefined;

    // Only list files for the current user
    const prefix = `uploads/${user.userId}/`;

    const result = await storage.list({ prefix, limit, cursor });

    return c.json({
      files: result.files.map(f => ({
        key: f.key,
        size: f.size,
        lastModified: f.lastModified?.toISOString(),
        contentType: f.contentType,
        url: storage.getPublicUrl?.(f.key)
      })),
      hasMore: result.hasMore,
      cursor: result.cursor
    });
  } catch (error) {
    console.error('Error listing files:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to list files',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Delete a file
app.delete('/api/storage/files/:key{.+}', authMiddleware, async (c) => {
  try {
    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    if (!isStorageConfigured(c.env)) {
      return c.json({ 
        error: 'Configuration Error', 
        message: 'Storage is not configured' 
      }, 500);
    }

    const storage = createStorageProvider(c.env);
    const key = c.req.param('key');

    // Verify the file belongs to the user
    if (!key.startsWith(`uploads/${user.userId}/`)) {
      return c.json({ 
        error: 'Forbidden', 
        message: 'You can only delete your own files' 
      }, 403);
    }

    await storage.delete(key);

    console.log('File deleted successfully:', { key });

    return c.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to delete file',
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
