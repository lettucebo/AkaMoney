import { describe, it, expect, vi, beforeEach } from 'vitest';
import { R2StorageProvider } from '../r2-provider';
import type { UploadOptions } from '../types';

// Mock R2Bucket
const createMockR2Bucket = () => {
  return {
    put: vi.fn(),
    get: vi.fn(),
    head: vi.fn(),
    delete: vi.fn(),
    list: vi.fn()
  };
};

describe('R2StorageProvider', () => {
  let mockBucket: ReturnType<typeof createMockR2Bucket>;
  let provider: R2StorageProvider;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
    provider = new R2StorageProvider(mockBucket as unknown as R2Bucket, 'https://storage.example.com');
  });

  describe('upload', () => {
    it('should upload a file and return result', async () => {
      mockBucket.put.mockResolvedValue({
        key: 'test-key',
        size: 1024,
        etag: 'abc123'
      });

      const result = await provider.upload('test-key', new ArrayBuffer(1024), {
        contentType: 'image/png'
      });

      expect(result.key).toBe('test-key');
      expect(result.size).toBe(1024);
      expect(result.etag).toBe('abc123');
      expect(result.url).toBe('https://storage.example.com/test-key');
      expect(mockBucket.put).toHaveBeenCalledWith(
        'test-key',
        expect.any(ArrayBuffer),
        expect.objectContaining({
          httpMetadata: { contentType: 'image/png' }
        })
      );
    });

    it('should upload with custom metadata', async () => {
      mockBucket.put.mockResolvedValue({
        key: 'test-key',
        size: 100,
        etag: 'xyz'
      });

      const options: UploadOptions = {
        contentType: 'text/plain',
        customMetadata: { userId: '123', tag: 'test' }
      };

      await provider.upload('test-key', 'hello world', options);

      expect(mockBucket.put).toHaveBeenCalledWith(
        'test-key',
        'hello world',
        expect.objectContaining({
          customMetadata: { userId: '123', tag: 'test' }
        })
      );
    });

    it('should handle cache control option', async () => {
      mockBucket.put.mockResolvedValue({
        key: 'test-key',
        size: 100,
        etag: 'xyz'
      });

      await provider.upload('test-key', new ArrayBuffer(100), {
        cacheControl: 'max-age=3600'
      });

      expect(mockBucket.put).toHaveBeenCalledWith(
        'test-key',
        expect.any(ArrayBuffer),
        expect.objectContaining({
          httpMetadata: { cacheControl: 'max-age=3600' }
        })
      );
    });
  });

  describe('download', () => {
    it('should return null when file not found', async () => {
      mockBucket.get.mockResolvedValue(null);

      const result = await provider.download('nonexistent');

      expect(result).toBeNull();
    });

    it('should return file content and metadata', async () => {
      const mockArrayBuffer = new ArrayBuffer(1024);
      mockBucket.get.mockResolvedValue({
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
        httpMetadata: { contentType: 'image/jpeg' },
        size: 1024,
        customMetadata: { userId: '123' },
        uploaded: new Date('2024-01-01')
      });

      const result = await provider.download('test-key');

      expect(result).not.toBeNull();
      expect(result!.data).toBe(mockArrayBuffer);
      expect(result!.contentType).toBe('image/jpeg');
      expect(result!.size).toBe(1024);
      expect(result!.metadata).toEqual({ userId: '123' });
      expect(result!.lastModified).toEqual(new Date('2024-01-01'));
    });
  });

  describe('delete', () => {
    it('should delete a file', async () => {
      mockBucket.delete.mockResolvedValue(undefined);

      await provider.delete('test-key');

      expect(mockBucket.delete).toHaveBeenCalledWith('test-key');
    });
  });

  describe('exists', () => {
    it('should return true when file exists', async () => {
      mockBucket.head.mockResolvedValue({ key: 'test-key' });

      const result = await provider.exists('test-key');

      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      mockBucket.head.mockResolvedValue(null);

      const result = await provider.exists('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getInfo', () => {
    it('should return null when file not found', async () => {
      mockBucket.head.mockResolvedValue(null);

      const result = await provider.getInfo('nonexistent');

      expect(result).toBeNull();
    });

    it('should return file info', async () => {
      mockBucket.head.mockResolvedValue({
        key: 'test-key',
        size: 2048,
        uploaded: new Date('2024-06-15'),
        etag: 'etag123',
        httpMetadata: { contentType: 'application/pdf' }
      });

      const result = await provider.getInfo('test-key');

      expect(result).not.toBeNull();
      expect(result!.key).toBe('test-key');
      expect(result!.size).toBe(2048);
      expect(result!.lastModified).toEqual(new Date('2024-06-15'));
      expect(result!.etag).toBe('etag123');
      expect(result!.contentType).toBe('application/pdf');
    });
  });

  describe('list', () => {
    it('should list files with options', async () => {
      mockBucket.list.mockResolvedValue({
        objects: [
          {
            key: 'file1.jpg',
            size: 1000,
            uploaded: new Date('2024-01-01'),
            etag: 'etag1',
            httpMetadata: { contentType: 'image/jpeg' }
          },
          {
            key: 'file2.png',
            size: 2000,
            uploaded: new Date('2024-01-02'),
            etag: 'etag2',
            httpMetadata: { contentType: 'image/png' }
          }
        ],
        truncated: false,
        cursor: undefined
      });

      const result = await provider.list({ prefix: 'images/', limit: 10 });

      expect(result.files).toHaveLength(2);
      expect(result.files[0].key).toBe('file1.jpg');
      expect(result.files[1].key).toBe('file2.png');
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeUndefined();
      expect(mockBucket.list).toHaveBeenCalledWith({
        prefix: 'images/',
        limit: 10
      });
    });

    it('should handle pagination', async () => {
      mockBucket.list.mockResolvedValue({
        objects: [{ key: 'file1.jpg', size: 1000, uploaded: new Date(), etag: 'e1' }],
        truncated: true,
        cursor: 'next-cursor'
      });

      const result = await provider.list({ limit: 1 });

      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('next-cursor');
    });
  });

  describe('getPublicUrl', () => {
    it('should return public URL when configured', () => {
      const url = provider.getPublicUrl('images/test.jpg');

      expect(url).toBe('https://storage.example.com/images/test.jpg');
    });

    it('should handle trailing slash in public URL', () => {
      const providerWithSlash = new R2StorageProvider(
        mockBucket as unknown as R2Bucket,
        'https://storage.example.com/'
      );

      const url = providerWithSlash.getPublicUrl('test.jpg');

      expect(url).toBe('https://storage.example.com/test.jpg');
    });

    it('should return undefined when no public URL configured', () => {
      const providerNoUrl = new R2StorageProvider(mockBucket as unknown as R2Bucket);

      const url = providerNoUrl.getPublicUrl('test.jpg');

      expect(url).toBeUndefined();
    });
  });
});
