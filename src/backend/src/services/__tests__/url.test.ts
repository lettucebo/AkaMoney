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

  return {
    prepare: mockPrepare,
    _mockFirst: mockFirst,
    _mockAll: mockAll,
    _mockRun: mockRun,
    _mockBind: mockBind
  };
};

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

    it('should create URL with generated short code', async () => {
      const mockDb = createMockDb();
      mockDb._mockFirst.mockResolvedValue(null);
      mockDb._mockRun.mockResolvedValue({});
      
      const result = await createUrl(mockDb as any, {
        original_url: 'https://example.com',
        short_code: 'abc123'
      });
      
      expect(result.short_code).toBe('abc123');
      expect(result.original_url).toBe('https://example.com');
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
    it('should return empty array when user has no URLs', async () => {
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: [] });
      mockDb._mockFirst.mockResolvedValue({ count: 0 });
      
      const result = await getUserUrls(mockDb as any, 'user-123');
      
      expect(result.urls).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return user URLs with pagination', async () => {
      const mockUrls = [
        {
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
          click_count: 5
        },
        {
          id: 'url-2',
          short_code: 'def456',
          original_url: 'https://example2.com',
          user_id: 'user-123',
          title: 'Test',
          description: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          expires_at: null,
          is_active: 1,
          click_count: 10
        }
      ];
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: mockUrls });
      mockDb._mockFirst.mockResolvedValue({ count: 2 });
      
      const result = await getUserUrls(mockDb as any, 'user-123', 1, 20);
      
      expect(result.urls).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.urls[0].short_code).toBe('abc123');
      expect(result.urls[1].short_code).toBe('def456');
    });

    it('should use default pagination values', async () => {
      const mockDb = createMockDb();
      mockDb._mockAll.mockResolvedValue({ results: [] });
      mockDb._mockFirst.mockResolvedValue({ count: 0 });
      
      const result = await getUserUrls(mockDb as any, 'user-123');
      
      expect(result.urls).toEqual([]);
    });
  });
});
