import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  user: { userId: 'owner-1', email: 'owner@example.test', name: 'Owner' }
}));

const urlServiceMocks = vi.hoisted(() => ({
  createUrl: vi.fn(),
  getUrlById: vi.fn(),
  updateUrl: vi.fn(),
  deleteUrl: vi.fn(),
  getUserUrls: vi.fn()
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: async (c: any, next: () => Promise<void>) => {
    c.set('user', authState.user);
    await next();
  },
  optionalAuthMiddleware: async (c: any, next: () => Promise<void>) => {
    c.set('user', authState.user);
    await next();
  },
  getAuthUser: (c: any) => c.get('user') ?? null
}));

vi.mock('../services/url', () => urlServiceMocks);
vi.mock('../services/analytics', () => ({ getAnalytics: vi.fn(), getOverallStats: vi.fn() }));
vi.mock('../services/cleanup', () => ({ cleanupOldClickRecords: vi.fn() }));
vi.mock('../services/storage', () => ({
  createStorageProvider: vi.fn(),
  isStorageConfigured: vi.fn(() => true),
  getStorageConfig: vi.fn(() => ({ provider: 'r2' }))
}));

import { app } from '../index';

const env = { DB: {} } as any;

const listResult = {
  urls: [],
  total: 0,
  totalPages: 0,
  page: 1,
  counts: { all: 0, active: 0, expired: 0, archived: 0 }
};

/** The options object the route handed to the service for the last request. */
const lastOptions = () => urlServiceMocks.getUserUrls.mock.calls.at(-1)?.[2];

describe('GET /api/urls query handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    urlServiceMocks.getUserUrls.mockResolvedValue(listResult);
  });

  it('forwards search, status and sort to the service', async () => {
    await app.request('/api/urls?search=Report&status=expired&sort=clicks-asc&page=2&limit=5', {}, env);

    expect(lastOptions()).toMatchObject({
      page: 2,
      limit: 5,
      search: 'Report',
      status: 'expired',
      sort: 'clicks-asc'
    });
  });

  it('applies defaults when no query parameters are supplied', async () => {
    await app.request('/api/urls', {}, env);

    expect(lastOptions()).toMatchObject({ page: 1, limit: 20, search: '', status: 'all', sort: 'default' });
  });

  it('normalizes malformed pagination instead of passing NaN into the service', async () => {
    await app.request('/api/urls?page=abc&limit=-4', {}, env);

    const options = lastOptions();
    expect(options.page).toBe(1);
    expect(options.limit).toBe(20);
    expect(Number.isNaN(options.page)).toBe(false);
  });

  it('falls back to safe defaults for unknown status and sort values', async () => {
    await app.request('/api/urls?status=deleted&sort=title%20DESC', {}, env);

    expect(lastOptions()).toMatchObject({ status: 'all', sort: 'default' });
  });

  it('passes a single now timestamp to the service', async () => {
    const before = Date.now();
    await app.request('/api/urls?status=active', {}, env);
    const after = Date.now();

    const { now } = lastOptions();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('returns the status counts alongside the list', async () => {
    urlServiceMocks.getUserUrls.mockResolvedValue({
      ...listResult,
      total: 3,
      totalPages: 1,
      counts: { all: 3, active: 1, expired: 1, archived: 1 }
    });

    const response = await app.request('/api/urls', {}, env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.counts).toEqual({ all: 3, active: 1, expired: 1, archived: 1 });
  });

  it('reports the effective page from the service, not the requested one', async () => {
    urlServiceMocks.getUserUrls.mockResolvedValue({ ...listResult, total: 5, totalPages: 1, page: 1 });

    const response = await app.request('/api/urls?page=999', {}, env);
    const body = await response.json();

    expect(body.pagination.page).toBe(1);
    expect(body.pagination.total_pages).toBe(1);
  });

  it('reports zero pages for an empty result set instead of NaN or Infinity', async () => {
    const response = await app.request('/api/urls?limit=0', {}, env);
    const body = await response.json();

    expect(body.pagination.total_pages).toBe(0);
    expect(body.pagination.limit).toBe(20);
  });

  it('never logs the raw search term', async () => {
    await app.request('/api/urls?search=confidential-project', {}, env);

    const logged = JSON.stringify(vi.mocked(console.log).mock.calls);
    expect(logged).not.toContain('confidential-project');
    expect(logged).toContain('"hasSearch":true');
  });
});
