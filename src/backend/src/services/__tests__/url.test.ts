import { describe, it, expect, vi } from 'vitest';
import {
  generateShortCode,
  isValidUrl,
  isValidShortCode,
  checkUrlOwnership,
  createUrl,
  getUrlByShortCode,
  getUrlById,
  updateUrl,
  deleteUrl,
  incrementClickCount,
  getUserUrls
} from '../url';
import { ForbiddenError, ValidationError, ConflictError, NotFoundError } from '../../types/errors';

// Mock D1Database
const createMockDb = () => {
  const mockFirst = vi.fn();
  const mockAll = vi.fn();
  const mockRun = vi.fn();
  const mockBind = vi.fn().mockReturnValue({
    first: mockFirst,
    all: mockAll,
    run: mockRun
  });
  const mockPrepare = vi.fn().mockReturnValue({
    bind: mockBind
  });
  const mockBatch = vi.fn();

  return {
    prepare: mockPrepare,
    batch: mockBatch,
    _mockFirst: mockFirst,
    _mockAll: mockAll,
    _mockRun: mockRun,
    _mockBind: mockBind,
    _mockBatch: mockBatch
  };
};

/**
 * Wires the counts query `getUserUrls` issues, so tests only have to state the
 * totals they care about. `total` is derived from these counts.
 */
const stubUrlListCounts = (
  mockDb: ReturnType<typeof createMockDb>,
  { all = 0, active = 0, expired = 0, archived = 0 } = {}
) => {
  mockDb._mockFirst.mockResolvedValue({
    all_count: all,
    active_count: active,
    expired_count: expired,
    archived_count: archived
  });
};

/** The SQL text of the paged SELECT (the only statement that reads rows). */
const listSql = (mockDb: ReturnType<typeof createMockDb>): string =>
  String(
    mockDb.prepare.mock.calls.map((call: any[]) => String(call[0])).find((sql) => sql.includes('SELECT * FROM urls'))
  );

describe('URL Service - Pure Functions', () => {
  describe('generateShortCode', () => {
    it('should generate a short code with default length of 6', () => {
      const code = generateShortCode();
      expect(code).toHaveLength(6);
    });

    it('should generate a short code with custom length', () => {
      const code = generateShortCode(10);
      expect(code).toHaveLength(10);
    });

    it('should generate unique codes', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(generateShortCode());
      }
      // With 6 character nanoid, collision is extremely unlikely
      expect(codes.size).toBe(100);
    });
  });

  describe('isValidUrl', () => {
    it('should return true for valid http URL', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
    });

    it('should return true for valid https URL', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
    });

    it('should return true for URL with path', () => {
      expect(isValidUrl('https://example.com/path/to/page')).toBe(true);
    });

    it('should return true for URL with query params', () => {
      expect(isValidUrl('https://example.com?foo=bar&baz=qux')).toBe(true);
    });

    it('should return false for ftp URL', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false);
    });

    it('should return false for invalid URL', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidUrl('')).toBe(false);
    });

    it('should return false for javascript protocol', () => {
      expect(isValidUrl('javascript:alert(1)')).toBe(false);
    });
  });

  describe('isValidShortCode', () => {
    it('should return true for valid alphanumeric codes', () => {
      expect(isValidShortCode('abc123')).toBe(true);
    });

    it('should return true for code with hyphens', () => {
      expect(isValidShortCode('my-code')).toBe(true);
    });

    it('should return true for code with underscores', () => {
      expect(isValidShortCode('my_code')).toBe(true);
    });

    it('should return true for minimum length (3 chars)', () => {
      expect(isValidShortCode('abc')).toBe(true);
    });

    it('should return true for maximum length (20 chars)', () => {
      expect(isValidShortCode('a'.repeat(20))).toBe(true);
    });

    it('should return false for code too short', () => {
      expect(isValidShortCode('ab')).toBe(false);
    });

    it('should return false for code too long', () => {
      expect(isValidShortCode('a'.repeat(21))).toBe(false);
    });

    it('should return false for code with special characters', () => {
      expect(isValidShortCode('my@code')).toBe(false);
    });

    it('should return false for code with spaces', () => {
      expect(isValidShortCode('my code')).toBe(false);
    });
  });

  describe('checkUrlOwnership', () => {
    it('should not throw for URL without user_id', () => {
      const url = {
        id: 'test-id',
        short_code: 'abc123',
        original_url: 'https://example.com',
        user_id: null,
        title: null,
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        expires_at: null,
        is_active: 1,
        click_count: 0
      };
      
      expect(() => checkUrlOwnership(url, 'any-user')).not.toThrow();
    });

    it('should not throw when user owns the URL', () => {
      const userId = 'user-123';
      const url = {
        id: 'test-id',
        short_code: 'abc123',
        original_url: 'https://example.com',
        user_id: userId,
        title: null,
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        expires_at: null,
        is_active: 1,
        click_count: 0
      };
      
      expect(() => checkUrlOwnership(url, userId)).not.toThrow();
    });

    it('should throw ForbiddenError when user does not own the URL', () => {
      const url = {
        id: 'test-id',
        short_code: 'abc123',
        original_url: 'https://example.com',
        user_id: 'owner-123',
        title: null,
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        expires_at: null,
        is_active: 1,
        click_count: 0
      };
      
      expect(() => checkUrlOwnership(url, 'other-user')).toThrow(ForbiddenError);
    });
  });
});

describe('URL Service - Database Functions', () => {
  describe('createUrl', () => {
    it('should throw ValidationError for invalid URL', async () => {
      const mockDb = createMockDb();
      
      await expect(createUrl(mockDb as any, {
        original_url: 'not-a-valid-url'
      })).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid custom short code', async () => {
      const mockDb = createMockDb();
      
      await expect(createUrl(mockDb as any, {
        original_url: 'https://example.com',
        short_code: 'ab' // Too short
      })).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for whitespace-only short code', async () => {
      const mockDb = createMockDb();
      
      await expect(createUrl(mockDb as any, {
        original_url: 'https://example.com',
        short_code: '   ' // Only whitespace
      })).rejects.toThrow(ValidationError);
      
      await expect(createUrl(mockDb as any, {
        original_url: 'https://example.com',
        short_code: '\t\n' // Tabs and newlines
      })).rejects.toThrow(ValidationError);
    });

    it('should trim whitespace from short code', async () => {
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(null);
      mockDb._mockRun.mockResolvedValue({});
      
      const result = await createUrl(mockDb as any, {
        original_url: 'https://example.com',
        short_code: '  mycode  ' // Whitespace around code
      });
      
      expect(result.short_code).toBe('mycode'); // Should be trimmed
    });

    it('should throw ConflictError when custom short code exists', async () => {
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue({ id: 'existing-id' });
      
      await expect(createUrl(mockDb as any, {
        original_url: 'https://example.com',
        short_code: 'existing'
      })).rejects.toThrow(ConflictError);
    });

    it('should throw ConflictError when custom short code exists with different case', async () => {
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue({ id: 'existing-id' });
      
      await expect(createUrl(mockDb as any, {
        original_url: 'https://example.com',
        short_code: 'EXISTING'
      })).rejects.toThrow(ConflictError);
      
      // Verify case-insensitive query was used
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT id FROM urls WHERE LOWER(short_code) = LOWER(?)'
      );
    });

    it('should create URL with custom short code', async () => {
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(null);
      mockDb._mockRun.mockResolvedValue({});
      
      const result = await createUrl(mockDb as any, {
        original_url: 'https://example.com',
        short_code: 'mycode',
        title: 'Test Title',
        description: 'Test Description'
      });
      
      expect(result.short_code).toBe('mycode');
      expect(result.original_url).toBe('https://example.com');
      expect(result.title).toBe('Test Title');
      expect(result.description).toBe('Test Description');
    });

    it('should create URL with user ID', async () => {
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(null);
      mockDb._mockRun.mockResolvedValue({});
      
      const result = await createUrl(mockDb as any, {
        original_url: 'https://example.com',
        short_code: 'user123'
      }, 'user-123');
      
      expect(result).toBeDefined();
    });

    it('should create URL with expiration date', async () => {
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(null);
      mockDb._mockRun.mockResolvedValue({});
      
      const expiresAt = Date.now() + 86400000;
      const result = await createUrl(mockDb as any, {
        original_url: 'https://example.com',
        short_code: 'expiry1',
        expires_at: expiresAt
      });
      
      expect(result.expires_at).toBe(expiresAt);
    });
  });

  describe('getUrlByShortCode', () => {
    it('should return null when URL not found', async () => {
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(null);
      
      const result = await getUrlByShortCode(mockDb as any, 'notfound');
      
      expect(result).toBeNull();
    });

    it('should return URL when found', async () => {
      const mockUrl = {
        id: 'url-id',
        short_code: 'abc123',
        original_url: 'https://example.com',
        user_id: null,
        is_active: 1,
        click_count: 5
      };
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(mockUrl);
      
      const result = await getUrlByShortCode(mockDb as any, 'abc123');
      
      expect(result).toEqual(mockUrl);
    });
  });

  describe('getUrlById', () => {
    it('should return null when URL not found', async () => {
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(null);
      
      const result = await getUrlById(mockDb as any, 'notfound');
      
      expect(result).toBeNull();
    });

    it('should return URL when found', async () => {
      const mockUrl = {
        id: 'url-id',
        short_code: 'abc123',
        original_url: 'https://example.com'
      };
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(mockUrl);
      
      const result = await getUrlById(mockDb as any, 'url-id');
      
      expect(result).toEqual(mockUrl);
    });
  });

  describe('updateUrl', () => {
    it('should throw NotFoundError when URL not found', async () => {
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(null);
      
      await expect(updateUrl(mockDb as any, 'notfound', {
        title: 'New Title'
      })).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError when user does not own URL', async () => {
      const mockUrl = {
        id: 'url-id',
        short_code: 'abc123',
        original_url: 'https://example.com',
        user_id: 'owner-123'
      };
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(mockUrl);
      
      await expect(updateUrl(mockDb as any, 'url-id', {
        title: 'New Title'
      }, 'other-user')).rejects.toThrow(ForbiddenError);
    });

    it('should throw ValidationError for invalid URL update', async () => {
      const mockUrl = {
        id: 'url-id',
        short_code: 'abc123',
        original_url: 'https://example.com',
        user_id: 'user-123'
      };
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(mockUrl);
      
      await expect(updateUrl(mockDb as any, 'url-id', {
        original_url: 'invalid-url'
      }, 'user-123')).rejects.toThrow(ValidationError);
    });

    it('should update URL successfully', async () => {
      const mockUrl = {
        id: 'url-id',
        short_code: 'abc123',
        original_url: 'https://example.com',
        user_id: 'user-123',
        title: null,
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        expires_at: null,
        is_active: 1,
        click_count: 0
      };
      const updatedUrl = { ...mockUrl, title: 'New Title' };
      
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValueOnce(mockUrl);
      mockDb._mockRun.mockResolvedValue({});
      mockDb._mockFirst.mockResolvedValueOnce(updatedUrl);
      
      const result = await updateUrl(mockDb as any, 'url-id', {
        title: 'New Title'
      }, 'user-123');
      
      expect(result.title).toBe('New Title');
    });

    it('should update is_active status', async () => {
      const mockUrl = {
        id: 'url-id',
        short_code: 'abc123',
        original_url: 'https://example.com',
        user_id: 'user-123',
        title: null,
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        expires_at: null,
        is_active: 1,
        click_count: 0
      };
      const updatedUrl = { ...mockUrl, is_active: 0 };
      
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValueOnce(mockUrl);
      mockDb._mockRun.mockResolvedValue({});
      mockDb._mockFirst.mockResolvedValueOnce(updatedUrl);
      
      const result = await updateUrl(mockDb as any, 'url-id', {
        is_active: false
      }, 'user-123');
      
      expect(result.is_active).toBe(false);
    });

    it('writes an explicit null so a cleared field is actually cleared', async () => {
      const mockUrl = {
        id: 'url-id',
        short_code: 'abc123',
        original_url: 'https://example.com',
        user_id: 'user-123',
        title: 'Old Title',
        description: 'Old Description',
        image_url: 'https://storage.example.com/old.jpg',
        created_at: Date.now(),
        updated_at: Date.now(),
        expires_at: 1800000000000,
        is_active: 1,
        click_count: 0
      };
      const clearedUrl = { ...mockUrl, title: null, description: null, image_url: null, expires_at: null };

      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValueOnce(mockUrl);
      mockDb._mockRun.mockResolvedValue({});
      mockDb._mockFirst.mockResolvedValueOnce(clearedUrl);

      const result = await updateUrl(mockDb as any, 'url-id', {
        title: null,
        description: null,
        image_url: null,
        expires_at: null
      }, 'user-123');

      const sql = mockDb.prepare.mock.calls.find((call: any[]) => String(call[0]).includes('UPDATE urls'))![0];
      expect(sql).toContain('title = ?');
      expect(sql).toContain('description = ?');
      expect(sql).toContain('image_url = ?');
      expect(sql).toContain('expires_at = ?');

      // prepare/bind order: getUrlById -> UPDATE -> getUrlById.
      const boundValues = mockDb._mockBind.mock.calls[1] as unknown[];
      expect(boundValues.slice(0, 4)).toEqual([null, null, null, null]);
      expect(boundValues.at(-1)).toBe('url-id');

      expect(result.title).toBeUndefined();
      expect(result.description).toBeUndefined();
      expect(result.image_url).toBeUndefined();
      expect(result.expires_at).toBeUndefined();
    });

    it('leaves omitted fields out of the UPDATE statement entirely', async () => {
      const mockUrl = {
        id: 'url-id',
        short_code: 'abc123',
        original_url: 'https://example.com',
        user_id: 'user-123',
        title: 'Old Title',
        description: 'Old Description',
        image_url: 'https://storage.example.com/old.jpg',
        created_at: Date.now(),
        updated_at: Date.now(),
        expires_at: null,
        is_active: 1,
        click_count: 0
      };

      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValueOnce(mockUrl);
      mockDb._mockRun.mockResolvedValue({});
      mockDb._mockFirst.mockResolvedValueOnce(mockUrl);

      await updateUrl(mockDb as any, 'url-id', { title: 'New Title' }, 'user-123');

      const sql = String(mockDb.prepare.mock.calls.find((call: any[]) => String(call[0]).includes('UPDATE urls'))![0]);
      expect(sql).toContain('title = ?');
      expect(sql).not.toContain('description = ?');
      expect(sql).not.toContain('image_url = ?');
      expect(sql).not.toContain('expires_at = ?');
    });
  });

  describe('deleteUrl', () => {
    it('should throw NotFoundError when URL not found', async () => {
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(null);
      
      await expect(deleteUrl(mockDb as any, 'notfound')).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError when user does not own URL', async () => {
      const mockUrl = {
        id: 'url-id',
        short_code: 'abc123',
        original_url: 'https://example.com',
        user_id: 'owner-123'
      };
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(mockUrl);
      
      await expect(deleteUrl(mockDb as any, 'url-id', 'other-user')).rejects.toThrow(ForbiddenError);
    });

    it('should delete URL successfully', async () => {
      const mockUrl = {
        id: 'url-id',
        short_code: 'abc123',
        original_url: 'https://example.com',
        user_id: 'user-123'
      };
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(mockUrl);
      mockDb._mockRun.mockResolvedValue({});
      
      await expect(deleteUrl(mockDb as any, 'url-id', 'user-123')).resolves.not.toThrow();
    });

    it('should delete URL without user check when no userId provided', async () => {
      const mockUrl = {
        id: 'url-id',
        short_code: 'abc123',
        original_url: 'https://example.com',
        user_id: null
      };
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(mockUrl);
      mockDb._mockRun.mockResolvedValue({});
      
      await expect(deleteUrl(mockDb as any, 'url-id')).resolves.not.toThrow();
    });
  });

  describe('incrementClickCount', () => {
    it('should increment click count', async () => {
      const mockDb = createMockDb();
      mockDb._mockRun.mockResolvedValue({});
      
      await expect(incrementClickCount(mockDb as any, 'url-id')).resolves.not.toThrow();
    });
  });

  describe('getUserUrls', () => {
    const buildRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'url-1',
      short_code: 'abc123',
      original_url: 'https://example1.com',
      user_id: 'user-123',
      title: null,
      description: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      expires_at: null,
      is_active: 1,
      click_count: 5,
      ...overrides
    });

    it('should return empty array when user has no URLs', async () => {
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: [] });
      stubUrlListCounts(mockDb);

      const result = await getUserUrls(mockDb as any, 'user-123');

      expect(result.urls).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(result.page).toBe(1);
    });

    it('should return zeroed counts rather than nulls for an empty result set', async () => {
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: [] });
      // A NULL-producing aggregate is exactly what SUM(CASE ...) would return
      // over zero rows; the service must never surface that to callers.
      mockDb._mockFirst.mockResolvedValue({
        all_count: 0,
        active_count: null,
        expired_count: null,
        archived_count: null
      });

      const result = await getUserUrls(mockDb as any, 'user-123', { search: 'no-match' });

      expect(result.counts).toEqual({ all: 0, active: 0, expired: 0, archived: 0 });
    });

    it('should not include raw user id in logs on success', async () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
      const rawUserId = 'oid-url-service-raw-user';
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: [] });
      stubUrlListCounts(mockDb);

      await getUserUrls(mockDb as any, rawUserId, { page: 3, limit: 15 });

      expect(JSON.stringify(consoleLog.mock.calls)).not.toContain(rawUserId);
    });

    it('should not include raw user id in error logs while retaining diagnostics', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const rawUserId = 'oid-url-service-error-user';
      const mockDb = createMockDb();
      mockDb._mockFirst.mockRejectedValue(new Error(`database unavailable for ${rawUserId}`));

      const thrown = await getUserUrls(mockDb as any, rawUserId, { page: 4, limit: 25 }).catch(
        (error) => error as Error
      );

      const logged = JSON.stringify(consoleError.mock.calls);
      expect(logged).not.toContain(rawUserId);
      expect(thrown.message).not.toContain(rawUserId);
      expect(logged).toContain('database unavailable');
      expect(thrown.message).toContain('database unavailable');
      expect(logged).toContain('"page":4');
      expect(logged).toContain('"limit":25');
    });

    it('should never log the search term itself', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockDb = createMockDb();
      mockDb._mockFirst.mockRejectedValue(new Error('database unavailable'));

      await getUserUrls(mockDb as any, 'user-123', { search: 'confidential-project' }).catch(() => undefined);

      const logged = JSON.stringify(consoleError.mock.calls);
      expect(logged).not.toContain('confidential-project');
      expect(logged).toContain('"hasSearch":true');
    });

    it('should return user URLs with pagination', async () => {
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({
        results: [buildRow(), buildRow({ id: 'url-2', short_code: 'def456', title: 'Test', click_count: 10 })]
      });
      stubUrlListCounts(mockDb, { all: 2, active: 2, expired: 0, archived: 0 });

      const result = await getUserUrls(mockDb as any, 'user-123', { page: 1, limit: 20 });

      expect(result.urls).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);
      expect(result.counts).toEqual({ all: 2, active: 2, expired: 0, archived: 0 });
      expect(result.urls[0].short_code).toBe('abc123');
      expect(result.urls[1].short_code).toBe('def456');
    });

    it('should use default pagination values', async () => {
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: [] });
      stubUrlListCounts(mockDb);

      const result = await getUserUrls(mockDb as any, 'user-123');

      expect(result.urls).toEqual([]);
    });

    it('should scope every query to the owning user', async () => {
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: [] });
      stubUrlListCounts(mockDb);

      await getUserUrls(mockDb as any, 'user-123', { search: 'abc', status: 'active' });

      const statements = mockDb.prepare.mock.calls.map((call: any[]) => String(call[0]));
      expect(statements).toHaveLength(2);
      for (const sql of statements) {
        expect(sql).toContain('urls.user_id = ?');
      }
      // The counts statement binds its projection's `now` values first, so the
      // owner is not always at index 0 - only that every statement binds it.
      for (const bound of mockDb._mockBind.mock.calls) {
        expect(bound).toContain('user-123');
      }
    });

    it('issues exactly two statements: the counts aggregate and the page query', async () => {
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: [] });
      stubUrlListCounts(mockDb);

      await getUserUrls(mockDb as any, 'user-123');

      // A separate status-filtered COUNT(*) would be a redundant second scan:
      // the counts aggregate already yields that number per status bucket.
      const statements = mockDb.prepare.mock.calls.map((call: any[]) => String(call[0]));
      expect(statements).toHaveLength(2);
      expect(statements.filter((sql) => sql.includes('COUNT(*) as count'))).toHaveLength(0);
    });

    it('derives the filtered total from the matching counts bucket', async () => {
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: [] });
      stubUrlListCounts(mockDb, { all: 30, active: 12, expired: 8, archived: 10 });

      const all = await getUserUrls(mockDb as any, 'user-123', { status: 'all' });
      const active = await getUserUrls(mockDb as any, 'user-123', { status: 'active' });
      const expired = await getUserUrls(mockDb as any, 'user-123', { status: 'expired' });
      const archived = await getUserUrls(mockDb as any, 'user-123', { status: 'archived' });

      expect(all.total).toBe(30);
      expect(active.total).toBe(12);
      expect(expired.total).toBe(8);
      expect(archived.total).toBe(10);
      // Counts always describe the whole search, regardless of the status filter.
      expect(archived.counts).toEqual({ all: 30, active: 12, expired: 8, archived: 10 });
    });

    it('paginates against the filtered total, not the account total', async () => {
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: [] });
      stubUrlListCounts(mockDb, { all: 100, active: 5, expired: 0, archived: 95 });

      const result = await getUserUrls(mockDb as any, 'user-123', { status: 'active', limit: 20, page: 3 });

      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should bind the search pattern and LIMIT/OFFSET to the page query', async () => {
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: [] });
      stubUrlListCounts(mockDb, { all: 100, active: 100 });

      await getUserUrls(mockDb as any, 'user-123', { page: 2, limit: 10, search: 'Report' });

      expect(listSql(mockDb)).toContain('LIMIT ? OFFSET ?');
      const pageBind = mockDb._mockBind.mock.calls.at(-1);
      expect(pageBind).toEqual(['user-123', '%report%', '%report%', '%report%', 10, 10]);
    });

    it('should clamp a page past the end of the result set and report the effective page', async () => {
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: [] });
      stubUrlListCounts(mockDb, { all: 5, active: 5 });

      const result = await getUserUrls(mockDb as any, 'user-123', { page: 999, limit: 20 });

      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      // Offset must follow the clamped page, not the requested one.
      expect(mockDb._mockBind.mock.calls.at(-1)?.at(-1)).toBe(0);
    });

    it('should clamp to the last populated page', async () => {
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: [] });
      stubUrlListCounts(mockDb, { all: 45, active: 45 });

      const result = await getUserUrls(mockDb as any, 'user-123', { page: 99, limit: 20 });

      expect(result.page).toBe(3);
      expect(result.totalPages).toBe(3);
      expect(mockDb._mockBind.mock.calls.at(-1)?.at(-1)).toBe(40);
    });

    it.each([
      ['default', 'ORDER BY urls.created_at DESC, urls.id DESC'],
      ['clicks-desc', 'ORDER BY urls.click_count DESC, urls.created_at DESC, urls.id DESC'],
      ['updated-desc', 'ORDER BY urls.updated_at DESC, urls.id DESC']
    ] as const)('should apply the %s sort to the page query', async (sort, expected) => {
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: [] });
      stubUrlListCounts(mockDb);

      await getUserUrls(mockDb as any, 'user-123', { sort });

      expect(listSql(mockDb)).toContain(expected);
    });

    it('should share one now value between the status filter and the counts projection', async () => {
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: [] });
      stubUrlListCounts(mockDb);

      await getUserUrls(mockDb as any, 'user-123', { status: 'active', now: 555 });

      const bound = mockDb._mockBind.mock.calls.flat();
      expect(bound.filter((value: unknown) => value === 555).length).toBeGreaterThanOrEqual(3);
    });

    describe('status predicates', () => {
      const statusSql = async (status: 'active' | 'expired' | 'archived') => {
        const mockDb = createMockDb();
        mockDb._mockAll.mockResolvedValue({ results: [] });
        stubUrlListCounts(mockDb);
        await getUserUrls(mockDb as any, 'user-123', { status, now: 1_000 });
        return listSql(mockDb);
      };

      it('treats a zero expiry as "never expires", matching the redirect worker', async () => {
        expect(await statusSql('active')).toContain('urls.expires_at IS NULL OR urls.expires_at = 0');
        expect(await statusSql('expired')).toContain('urls.expires_at <> 0');
      });

      it('keeps a link expiring exactly now in the active bucket', async () => {
        // `>= now` for active and `< now` for expired makes the boundary
        // active, matching getLinkStatus's `expires_at < now` test.
        expect(await statusSql('active')).toContain('urls.expires_at >= ?');
        expect(await statusSql('expired')).toContain('urls.expires_at < ?');
      });

      it('treats any non-1 is_active value, including NULL, as archived', async () => {
        const sql = await statusSql('archived');
        expect(sql).toContain('urls.is_active IS NOT 1');
        expect(sql).not.toContain('is_active = 0');
      });

      it('never classifies an archived link as expired', async () => {
        expect(await statusSql('expired')).toContain('urls.is_active = 1');
      });
    });
  });
});

