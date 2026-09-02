import { beforeEach, describe, expect, it, vi } from 'vitest';

const rawUserId = 'oid-raw-privacy-user';
const rawEmail = 'privacy.user@example.com';
const rawSsoId = rawUserId;

const authState = vi.hoisted(() => ({
  user: {
    userId: 'oid-raw-privacy-user',
    email: 'privacy.user@example.com',
    name: 'Privacy User'
  }
}));

const urlServiceMocks = vi.hoisted(() => ({
  createUrl: vi.fn(),
  getUrlById: vi.fn(),
  updateUrl: vi.fn(),
  deleteUrl: vi.fn(),
  getUserUrls: vi.fn()
}));

const analyticsServiceMocks = vi.hoisted(() => ({
  getAnalytics: vi.fn(),
  getOverallStats: vi.fn()
}));

const cleanupServiceMocks = vi.hoisted(() => ({
  cleanupOldClickRecords: vi.fn()
}));

const storageServiceMocks = vi.hoisted(() => ({
  upload: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  getInfo: vi.fn(),
  getPublicUrl: vi.fn()
}));

const storageFactoryMocks = vi.hoisted(() => ({
  createStorageProvider: vi.fn(() => storageServiceMocks),
  isStorageConfigured: vi.fn(() => true),
  getStorageConfig: vi.fn(() => ({ provider: 'r2', publicUrl: 'https://cdn.example.test' }))
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
vi.mock('../services/analytics', () => analyticsServiceMocks);
vi.mock('../services/cleanup', () => cleanupServiceMocks);
vi.mock('../services/storage', () => storageFactoryMocks);

import { app } from '../index';

function serializeConsoleCalls(calls: unknown[][]): string {
  return calls.map((args) => args.map((arg) => {
    if (arg instanceof Error) {
      return {
        name: arg.name,
        message: arg.message,
        stack: arg.stack
      };
    }

    return arg;
  })).map((args) => JSON.stringify(args)).join('\n');
}

const mockUrl = {
  id: 'url-resource-id',
  short_code: 'short123',
  original_url: 'https://example.test',
  short_url: 'short123',
  title: undefined,
  description: undefined,
  created_at: Date.now(),
  updated_at: Date.now(),
  expires_at: undefined,
  is_active: true,
  click_count: 0,
  user_id: rawUserId
};

describe('backend privacy logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    urlServiceMocks.createUrl.mockResolvedValue(mockUrl);
    urlServiceMocks.getUserUrls.mockResolvedValue({ urls: [mockUrl], total: 1 });
    urlServiceMocks.getUrlById.mockResolvedValue(mockUrl);
    urlServiceMocks.updateUrl.mockResolvedValue(mockUrl);
    urlServiceMocks.deleteUrl.mockResolvedValue(undefined);
    analyticsServiceMocks.getAnalytics.mockResolvedValue({
      url: mockUrl,
      short_code: mockUrl.short_code,
      total_clicks: 3
    });
    analyticsServiceMocks.getOverallStats.mockResolvedValue({
      total_clicks: 3,
      total_links: 1
    });
    cleanupServiceMocks.cleanupOldClickRecords.mockResolvedValue({
      deleted: 2,
      cutoffDate: new Date('2026-01-01T00:00:00.000Z')
    });
    storageServiceMocks.upload.mockResolvedValue({
      key: `uploads/${rawUserId}/file.png`,
      url: 'https://cdn.example.test/file.png',
      size: 123
    });
    storageServiceMocks.delete.mockResolvedValue(undefined);
  });

  it('omits raw Entra identifiers from captured route console arguments while preserving operation context', async () => {
    const env = { DB: {}, BUCKET: {} } as any;

    await app.request('/api/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ original_url: 'https://example.test' })
    }, env);
    await app.request('/api/urls?page=2&limit=5', { method: 'GET' }, env);
    await app.request('/api/urls/url-resource-id', { method: 'GET' }, env);
    await app.request('/api/urls/url-resource-id', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' })
    }, env);
    await app.request('/api/urls/url-resource-id', { method: 'DELETE' }, env);
    await app.request('/api/analytics/short123', { method: 'GET' }, env);
    await app.request('/api/stats/overall', { method: 'GET' }, env);
    await app.request('/api/admin/cleanup?days=30', { method: 'POST' }, env);

    const file = new File(['image'], 'file.png', { type: 'image/png' });
    const form = new FormData();
    form.append('file', file);
    await app.request('/api/storage/upload', { method: 'POST', body: form }, env);
    await app.request(`/api/storage/files/uploads/${rawUserId}/file.png`, { method: 'DELETE' }, env);

    const logged = serializeConsoleCalls([
      ...vi.mocked(console.log).mock.calls,
      ...vi.mocked(console.error).mock.calls
    ]);

    expect(logged).not.toContain(rawUserId);
    expect(logged).not.toContain(rawEmail);
    expect(logged).not.toContain(rawSsoId);
    expect(logged).not.toContain(`uploads/${rawUserId}/file.png`);
    expect(logged).toContain('"authenticated":true');
    expect(logged).toContain('"page":2');
    expect(logged).toContain('"limit":5');
    expect(logged).toContain('url-resource-id');
    expect(logged).toContain('short123');
    expect(logged).toContain('"retentionDays":30');
    expect(logged).toContain('"size":123');
  });

  it('omits raw Entra identifiers when route catches log thrown errors', async () => {
    const env = { DB: {}, BUCKET: {} } as any;
    urlServiceMocks.getUserUrls.mockRejectedValueOnce(
      new Error(`database failed for ${rawUserId} and ${rawEmail}`)
    );
    storageServiceMocks.upload.mockRejectedValueOnce(
      new Error(`storage failed for uploads/${rawUserId}/file.png`)
    );

    await app.request('/api/urls?page=2&limit=5', { method: 'GET' }, env);

    const file = new File(['image'], 'file.png', { type: 'image/png' });
    const form = new FormData();
    form.append('file', file);
    await app.request('/api/storage/upload', { method: 'POST', body: form }, env);

    const logged = serializeConsoleCalls([
      ...vi.mocked(console.log).mock.calls,
      ...vi.mocked(console.error).mock.calls
    ]);

    expect(logged).not.toContain(rawUserId);
    expect(logged).not.toContain(rawEmail);
    expect(logged).not.toContain(rawSsoId);
    expect(logged).not.toContain(`uploads/${rawUserId}/file.png`);
    expect(logged).toContain('database failed');
    expect(logged).toContain('storage failed');
    expect(logged).toContain('[redacted-identity]');
  });

  it('keeps short route parameters readable while redacting the authenticated identity', async () => {
    const env = { DB: {}, BUCKET: {} } as any;
    urlServiceMocks.getUrlById.mockRejectedValueOnce(
      new Error(`resource e failed for ${rawUserId}`)
    );

    await app.request('/api/urls/e', { method: 'GET' }, env);

    const logged = serializeConsoleCalls(vi.mocked(console.error).mock.calls);
    expect(logged).toContain('resource e failed');
    expect(logged).not.toContain(rawUserId);
    expect(logged).toContain('[redacted-identity]');
  });
});
