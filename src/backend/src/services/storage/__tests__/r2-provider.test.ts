import { describe, it, expect, vi, beforeEach } from 'vitest';
import { R2StorageProvider } from '../r2-provider';
import type { R2StorageConfig } from '../types';

// Mock R2Object
const createMockR2Object = (overrides: Partial<R2Object> = {}): R2Object => ({
  key: 'test-key',
  version: 'test-version',
  size: 100,
  etag: 'test-etag',
  httpEtag: '"test-etag"',
  checksums: {},
  uploaded: new Date('2024-01-01'),
  httpMetadata: { contentType: 'text/plain' },
  customMetadata: { custom: 'value' },
  storageClass: 'Standard',
  range: undefined,
  writeHttpMetadata: vi.fn(),
  arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
  text: vi.fn().mockResolvedValue('test content'),
  json: vi.fn().mockResolvedValue({}),
  body: {} as ReadableStream,
  bodyUsed: false,
  blob: vi.fn().mockResolvedValue(new Blob()),
  ...overrides
});

describe('R2StorageProvider', () => {
  let mockBucket: R2Bucket;
  let provider: R2StorageProvider;

  beforeEach(() => {
    mockBucket = {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      head: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
      createMultipartUpload: vi.fn(),
      resumeMultipartUpload: vi.fn()
    } as unknown as R2Bucket;

    const config: R2StorageConfig = { bucket: mockBucket };
    provider = new R2StorageProvider(config);
  });

  describe('put', () => {
    it('should upload string data', async () => {
      await provider.put('test-key', 'test content');
      
      expect(mockBucket.put).toHaveBeenCalledWith('test-key', 'test content', {
        httpMetadata: {},
        customMetadata: undefined
      });
    });

    it('should upload with content type', async () => {
      await provider.put('test-key', 'test content', { contentType: 'text/plain' });
      
      expect(mockBucket.put).toHaveBeenCalledWith('test-key', 'test content', {
        httpMetadata: { contentType: 'text/plain' },
        customMetadata: undefined
      });
    });

    it('should upload with cache control', async () => {
      await provider.put('test-key', 'test content', { cacheControl: 'max-age=3600' });
      
      expect(mockBucket.put).toHaveBeenCalledWith('test-key', 'test content', {
        httpMetadata: { cacheControl: 'max-age=3600' },
        customMetadata: undefined
      });
    });

    it('should upload with custom metadata', async () => {
      await provider.put('test-key', 'test content', { metadata: { foo: 'bar' } });
      
      expect(mockBucket.put).toHaveBeenCalledWith('test-key', 'test content', {
        httpMetadata: {},
        customMetadata: { foo: 'bar' }
      });
    });

    it('should upload ArrayBuffer data', async () => {
      const buffer = new ArrayBuffer(10);
      await provider.put('test-key', buffer);
      
      expect(mockBucket.put).toHaveBeenCalledWith('test-key', buffer, {
        httpMetadata: {},
        customMetadata: undefined
      });
    });
  });

  describe('get', () => {
    it('should return null when object not found', async () => {
      vi.mocked(mockBucket.get).mockResolvedValue(null);
      
      const result = await provider.get('non-existent');
      
      expect(result).toBeNull();
    });

    it('should return ArrayBuffer when object found', async () => {
      const mockArrayBuffer = new ArrayBuffer(100);
      const mockObject = createMockR2Object({
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer)
      });
      vi.mocked(mockBucket.get).mockResolvedValue(mockObject);
      
      const result = await provider.get('test-key');
      
      expect(result).toBe(mockArrayBuffer);
    });
  });

  describe('getWithMetadata', () => {
    it('should return null when object not found', async () => {
      vi.mocked(mockBucket.get).mockResolvedValue(null);
      
      const result = await provider.getWithMetadata('non-existent');
      
      expect(result).toBeNull();
    });

    it('should return data and metadata when object found', async () => {
      const mockArrayBuffer = new ArrayBuffer(100);
      const mockObject = createMockR2Object({
        key: 'test-key',
        size: 100,
        etag: 'test-etag',
        uploaded: new Date('2024-01-01'),
        httpMetadata: { contentType: 'text/plain' },
        customMetadata: { custom: 'value' },
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer)
      });
      vi.mocked(mockBucket.get).mockResolvedValue(mockObject);
      
      const result = await provider.getWithMetadata('test-key');
      
      expect(result).not.toBeNull();
      expect(result!.data).toBe(mockArrayBuffer);
      expect(result!.metadata).toEqual({
        key: 'test-key',
        size: 100,
        etag: 'test-etag',
        lastModified: new Date('2024-01-01'),
        contentType: 'text/plain',
        customMetadata: { custom: 'value' }
      });
    });
  });

  describe('delete', () => {
    it('should call bucket delete', async () => {
      await provider.delete('test-key');
      
      expect(mockBucket.delete).toHaveBeenCalledWith('test-key');
    });
  });

  describe('exists', () => {
    it('should return true when object exists', async () => {
      vi.mocked(mockBucket.head).mockResolvedValue(createMockR2Object());
      
      const result = await provider.exists('test-key');
      
      expect(result).toBe(true);
    });

    it('should return false when object does not exist', async () => {
      vi.mocked(mockBucket.head).mockResolvedValue(null);
      
      const result = await provider.exists('non-existent');
      
      expect(result).toBe(false);
    });
  });

  describe('list', () => {
    it('should return empty list when no objects', async () => {
      vi.mocked(mockBucket.list).mockResolvedValue({
        objects: [],
        truncated: false,
        delimitedPrefixes: []
      });
      
      const result = await provider.list();
      
      expect(result.objects).toEqual([]);
      expect(result.truncated).toBe(false);
      expect(result.cursor).toBeUndefined();
    });

    it('should return objects with metadata', async () => {
      const mockObjects = [
        createMockR2Object({ key: 'file1.txt', size: 100 }),
        createMockR2Object({ key: 'file2.txt', size: 200 })
      ];
      vi.mocked(mockBucket.list).mockResolvedValue({
        objects: mockObjects,
        truncated: false,
        delimitedPrefixes: []
      });
      
      const result = await provider.list();
      
      expect(result.objects).toHaveLength(2);
      expect(result.objects[0].key).toBe('file1.txt');
      expect(result.objects[1].key).toBe('file2.txt');
    });

    it('should pass options to bucket list', async () => {
      vi.mocked(mockBucket.list).mockResolvedValue({
        objects: [],
        truncated: false,
        delimitedPrefixes: []
      });
      
      await provider.list({ prefix: 'folder/', limit: 10, cursor: 'cursor123' });
      
      expect(mockBucket.list).toHaveBeenCalledWith({
        prefix: 'folder/',
        limit: 10,
        cursor: 'cursor123'
      });
    });

    it('should handle truncated results', async () => {
      vi.mocked(mockBucket.list).mockResolvedValue({
        objects: [createMockR2Object()],
        truncated: true,
        cursor: 'next-cursor',
        delimitedPrefixes: []
      });
      
      const result = await provider.list();
      
      expect(result.truncated).toBe(true);
      expect(result.cursor).toBe('next-cursor');
    });
  });

  describe('head', () => {
    it('should return null when object not found', async () => {
      vi.mocked(mockBucket.head).mockResolvedValue(null);
      
      const result = await provider.head('non-existent');
      
      expect(result).toBeNull();
    });

    it('should return metadata when object found', async () => {
      const mockObject = createMockR2Object({
        key: 'test-key',
        size: 100,
        etag: 'test-etag',
        uploaded: new Date('2024-01-01'),
        httpMetadata: { contentType: 'application/json' },
        customMetadata: { foo: 'bar' }
      });
      vi.mocked(mockBucket.head).mockResolvedValue(mockObject);
      
      const result = await provider.head('test-key');
      
      expect(result).toEqual({
        key: 'test-key',
        size: 100,
        etag: 'test-etag',
        lastModified: new Date('2024-01-01'),
        contentType: 'application/json',
        customMetadata: { foo: 'bar' }
      });
    });
  });
});
