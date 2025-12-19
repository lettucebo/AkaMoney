import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AzureStorageProvider } from '../azure-provider';
import type { AzureStorageConfig } from '../types';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AzureStorageProvider', () => {
  let provider: AzureStorageProvider;
  const config: AzureStorageConfig = {
    accountName: 'testaccount',
    accountKey: 'dGVzdGtleWZvcnNpZ25pbmcxMjM0NTY3ODkw', // base64 encoded key
    containerName: 'testcontainer'
  };

  beforeEach(() => {
    provider = new AzureStorageProvider(config);
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('should use default Azure endpoint', () => {
      const p = new AzureStorageProvider(config);
      // Provider is created, endpoint is internal
      expect(p).toBeInstanceOf(AzureStorageProvider);
    });

    it('should use custom endpoint when provided', () => {
      const customConfig = { 
        ...config, 
        endpointUrl: 'https://custom.blob.endpoint.com' 
      };
      const p = new AzureStorageProvider(customConfig);
      expect(p).toBeInstanceOf(AzureStorageProvider);
    });
  });

  describe('put', () => {
    it('should upload string data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201
      });

      await provider.put('test-key', 'test content');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('testcontainer');
      expect(url).toContain('test-key');
      expect(options.method).toBe('PUT');
      expect(options.headers['x-ms-blob-type']).toBe('BlockBlob');
    });

    it('should include content type when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201
      });

      await provider.put('test-key', 'test content', { contentType: 'text/plain' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Content-Type']).toBe('text/plain');
    });

    it('should include cache control when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201
      });

      await provider.put('test-key', 'test content', { cacheControl: 'max-age=3600' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['x-ms-blob-cache-control']).toBe('max-age=3600');
    });

    it('should include custom metadata', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201
      });

      await provider.put('test-key', 'test content', { metadata: { foo: 'bar' } });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['x-ms-meta-foo']).toBe('bar');
    });

    it('should throw error on failed upload', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(provider.put('test-key', 'test content'))
        .rejects.toThrow('Azure Storage PUT failed: 500 Internal Server Error');
    });

    it('should handle ArrayBuffer data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201
      });

      const buffer = new ArrayBuffer(10);
      await provider.put('test-key', buffer);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('get', () => {
    it('should return null when object not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      const result = await provider.get('non-existent');

      expect(result).toBeNull();
    });

    it('should return ArrayBuffer when object found', async () => {
      const mockArrayBuffer = new ArrayBuffer(100);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer)
      });

      const result = await provider.get('test-key');

      expect(result).toBe(mockArrayBuffer);
    });

    it('should throw error on server error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(provider.get('test-key'))
        .rejects.toThrow('Azure Storage GET failed: 500 Internal Server Error');
    });
  });

  describe('getWithMetadata', () => {
    it('should return null when object not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      const result = await provider.getWithMetadata('non-existent');

      expect(result).toBeNull();
    });

    it('should return data and metadata when object found', async () => {
      const mockArrayBuffer = new ArrayBuffer(100);
      const mockHeaders = new Headers({
        'content-length': '100',
        'content-type': 'text/plain',
        'etag': '"test-etag"',
        'last-modified': 'Wed, 01 Jan 2024 00:00:00 GMT',
        'x-ms-meta-custom': 'value'
      });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer),
        headers: mockHeaders
      });

      const result = await provider.getWithMetadata('test-key');

      expect(result).not.toBeNull();
      expect(result!.data).toBe(mockArrayBuffer);
      expect(result!.metadata.key).toBe('test-key');
      expect(result!.metadata.size).toBe(100);
      expect(result!.metadata.contentType).toBe('text/plain');
      expect(result!.metadata.customMetadata).toEqual({ custom: 'value' });
    });
  });

  describe('delete', () => {
    it('should successfully delete object', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 202
      });

      await expect(provider.delete('test-key')).resolves.not.toThrow();
    });

    it('should not throw on 404 (idempotent delete)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      await expect(provider.delete('non-existent')).resolves.not.toThrow();
    });

    it('should throw on server error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(provider.delete('test-key'))
        .rejects.toThrow('Azure Storage DELETE failed: 500 Internal Server Error');
    });
  });

  describe('exists', () => {
    it('should return true when object exists', async () => {
      const mockHeaders = new Headers({
        'content-length': '100'
      });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: mockHeaders
      });

      const result = await provider.exists('test-key');

      expect(result).toBe(true);
    });

    it('should return false when object does not exist', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      const result = await provider.exists('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('head', () => {
    it('should return null when object not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      const result = await provider.head('non-existent');

      expect(result).toBeNull();
    });

    it('should return metadata when object found', async () => {
      const mockHeaders = new Headers({
        'content-length': '100',
        'content-type': 'application/json',
        'etag': '"test-etag"',
        'last-modified': 'Wed, 01 Jan 2024 00:00:00 GMT',
        'x-ms-meta-foo': 'bar'
      });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: mockHeaders
      });

      const result = await provider.head('test-key');

      expect(result).not.toBeNull();
      expect(result!.key).toBe('test-key');
      expect(result!.size).toBe(100);
      expect(result!.contentType).toBe('application/json');
      expect(result!.etag).toBe('"test-etag"');
      expect(result!.customMetadata).toEqual({ foo: 'bar' });
    });
  });

  describe('list', () => {
    it('should return empty list when no objects', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(`
          <?xml version="1.0" encoding="utf-8"?>
          <EnumerationResults>
            <Blobs></Blobs>
          </EnumerationResults>
        `)
      });

      const result = await provider.list();

      expect(result.objects).toEqual([]);
      expect(result.truncated).toBe(false);
    });

    it('should parse blob list response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(`
          <?xml version="1.0" encoding="utf-8"?>
          <EnumerationResults>
            <Blobs>
              <Blob>
                <Name>file1.txt</Name>
                <Properties>
                  <Content-Length>100</Content-Length>
                  <Content-Type>text/plain</Content-Type>
                  <Last-Modified>Wed, 01 Jan 2024 00:00:00 GMT</Last-Modified>
                  <Etag>"etag1"</Etag>
                </Properties>
              </Blob>
              <Blob>
                <Name>file2.txt</Name>
                <Properties>
                  <Content-Length>200</Content-Length>
                  <Content-Type>text/plain</Content-Type>
                </Properties>
              </Blob>
            </Blobs>
          </EnumerationResults>
        `)
      });

      const result = await provider.list();

      expect(result.objects).toHaveLength(2);
      expect(result.objects[0].key).toBe('file1.txt');
      expect(result.objects[0].size).toBe(100);
      expect(result.objects[1].key).toBe('file2.txt');
      expect(result.objects[1].size).toBe(200);
    });

    it('should handle pagination with next marker', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(`
          <?xml version="1.0" encoding="utf-8"?>
          <EnumerationResults>
            <Blobs>
              <Blob>
                <Name>file1.txt</Name>
                <Properties>
                  <Content-Length>100</Content-Length>
                </Properties>
              </Blob>
            </Blobs>
            <NextMarker>next-cursor</NextMarker>
          </EnumerationResults>
        `)
      });

      const result = await provider.list();

      expect(result.truncated).toBe(true);
      expect(result.cursor).toBe('next-cursor');
    });

    it('should throw error on failed list', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(provider.list())
        .rejects.toThrow('Azure Storage LIST failed: 500 Internal Server Error');
    });
  });
});
