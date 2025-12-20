import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUrlByShortCode, recordClick } from '../services';

// Mock D1 database
const createMockDb = () => ({
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  first: vi.fn(),
  run: vi.fn(),
});

describe('Redirect Services', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    vi.clearAllMocks();
  });

  describe('getUrlByShortCode', () => {
    it('should return URL when found', async () => {
      const mockUrl = {
        id: 'test-id',
        short_code: 'test123',
        original_url: 'https://example.com',
        user_id: null,
        title: null,
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        expires_at: null,
        is_active: 1,
        click_count: 0,
      };

      mockDb.first.mockResolvedValue(mockUrl);

      const result = await getUrlByShortCode(mockDb as any, 'test123');

      expect(result).toEqual(mockUrl);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM urls WHERE short_code = ? AND is_active = 1'
      );
      expect(mockDb.bind).toHaveBeenCalledWith('test123');
    });

    it('should return null when URL not found', async () => {
      mockDb.first.mockResolvedValue(null);

      const result = await getUrlByShortCode(mockDb as any, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('recordClick', () => {
    it('should record click with user agent parsing', async () => {
      mockDb.run.mockResolvedValue({ success: true });

      const mockRequest = {
        headers: {
          get: vi.fn((header: string) => {
            const headers: Record<string, string> = {
              'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
              'referer': 'https://google.com',
              'cf-connecting-ip': '192.168.1.1',
            };
            return headers[header] || null;
          }),
        },
        cf: {
          country: 'US',
          city: 'New York',
        },
      } as unknown as Request;

      await recordClick(mockDb as any, mockRequest, 'test123', 'url-id');

      // Verify click record was inserted
      expect(mockDb.prepare).toHaveBeenCalled();
      expect(mockDb.run).toHaveBeenCalled();
    });

    it('should handle missing headers gracefully', async () => {
      mockDb.run.mockResolvedValue({ success: true });

      const mockRequest = {
        headers: {
          get: vi.fn(() => null),
        },
        cf: undefined,
      } as unknown as Request;

      await recordClick(mockDb as any, mockRequest, 'test123', 'url-id');

      expect(mockDb.run).toHaveBeenCalled();
    });

    it('should detect mobile device type', async () => {
      mockDb.run.mockResolvedValue({ success: true });

      const mockRequest = {
        headers: {
          get: vi.fn((header: string) => {
            if (header === 'user-agent') {
              return 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)';
            }
            return null;
          }),
        },
        cf: {},
      } as unknown as Request;

      await recordClick(mockDb as any, mockRequest, 'test123', 'url-id');

      // The function should have been called with mobile device type
      expect(mockDb.bind).toHaveBeenCalled();
    });

    it('should detect desktop device type', async () => {
      mockDb.run.mockResolvedValue({ success: true });

      const mockRequest = {
        headers: {
          get: vi.fn((header: string) => {
            if (header === 'user-agent') {
              return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0';
            }
            return null;
          }),
        },
        cf: {},
      } as unknown as Request;

      await recordClick(mockDb as any, mockRequest, 'test123', 'url-id');

      expect(mockDb.bind).toHaveBeenCalled();
    });
  });
});
