import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AzureStorageProvider, AzureStorageConfig } from '../azure-provider';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AzureStorageProvider', () => {
  let provider: AzureStorageProvider;
  const config: AzureStorageConfig = {
    accountName: 'testaccount',
    containerName: 'testcontainer',
    sasToken: 'sv=2021-06-08&sig=testsig',
    publicUrl: 'https://storage.example.com'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AzureStorageProvider(config);
  });

  describe('upload', () => {
    it('should upload a file and return result', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'ETag': '"abc123"' })
      });

      const data = new ArrayBuffer(1024);
      const result = await provider.upload('test-key', data, {
        contentType: 'image/png'
      });

      expect(result.key).toBe('test-key');
      expect(result.size).toBe(1024);
      expect(result.etag).toBe('abc123');
      expect(result.url).toBe('https://storage.example.com/test-key');
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://testaccount.blob.core.windows.net/testcontainer/test-key'),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'x-ms-blob-type': 'BlockBlob',
            'Content-Type': 'image/png'
          })
        })
      );
    });

    it('should upload string data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'ETag': '"xyz"' })
      });

      const result = await provider.upload('test.txt', 'hello world', {
        contentType: 'text/plain'
      });

      expect(result.key).toBe('test.txt');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should upload Blob data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'ETag': '"blobetag"' })
      });

      const blob = new Blob(['test content'], { type: 'text/plain' });
      const result = await provider.upload('blob-file.txt', blob);

      expect(result.key).toBe('blob-file.txt');
    });

    it('should include custom metadata in headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'ETag': '"meta"' })
      });

      await provider.upload('test-key', new ArrayBuffer(100), {
        customMetadata: { userId: '123', category: 'images' }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-ms-meta-userId': '123',
            'x-ms-meta-category': 'images'
          })
        })
      );
    });

    it('should throw error on failed upload', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Access denied')
      });

      await expect(provider.upload('test', new ArrayBuffer(10)))
        .rejects.toThrow('Azure upload failed: 403 Forbidden');
    });
  });

  describe('download', () => {
    it('should return null when file not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      const result = await provider.download('nonexistent');

      expect(result).toBeNull();
    });

    it('should return file content and metadata', async () => {
      const mockData = new ArrayBuffer(1024);
      const mockHeaders = new Headers({
        'Content-Type': 'image/jpeg',
        'Content-Length': '1024',
        'Last-Modified': 'Mon, 01 Jan 2024 00:00:00 GMT',
        'x-ms-meta-userId': '123'
      });

      mockFetch.mockResolvedValue({
        ok: true,
        headers: mockHeaders,
        arrayBuffer: () => Promise.resolve(mockData)
      });

      const result = await provider.download('test-image.jpg');

      expect(result).not.toBeNull();
      expect(result!.data).toBe(mockData);
      expect(result!.contentType).toBe('image/jpeg');
      expect(result!.size).toBe(1024);
      expect(result!.metadata).toEqual({ userid: '123' });
    });

    it('should throw error on failed download', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error')
      });

      await expect(provider.download('test'))
        .rejects.toThrow('Azure download failed: 500 Internal Server Error');
    });
  });

  describe('delete', () => {
    it('should delete a file successfully', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await provider.delete('test-key');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('test-key'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should not throw on 404 (idempotent delete)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      await expect(provider.delete('nonexistent')).resolves.not.toThrow();
    });

    it('should throw on other errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Access denied')
      });

      await expect(provider.delete('test'))
        .rejects.toThrow('Azure delete failed: 403 Forbidden');
    });
  });

  describe('exists', () => {
    it('should return true when file exists', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const result = await provider.exists('existing-file');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'HEAD' })
      );
    });

    it('should return false when file does not exist', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const result = await provider.exists('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getInfo', () => {
    it('should return null when file not found', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const result = await provider.getInfo('nonexistent');

      expect(result).toBeNull();
    });

    it('should return file info', async () => {
      const mockHeaders = new Headers({
        'Content-Length': '2048',
        'Last-Modified': 'Sat, 15 Jun 2024 12:00:00 GMT',
        'ETag': '"etag123"',
        'Content-Type': 'application/pdf'
      });

      mockFetch.mockResolvedValue({
        ok: true,
        headers: mockHeaders
      });

      const result = await provider.getInfo('document.pdf');

      expect(result).not.toBeNull();
      expect(result!.key).toBe('document.pdf');
      expect(result!.size).toBe(2048);
      expect(result!.etag).toBe('etag123');
      expect(result!.contentType).toBe('application/pdf');
    });
  });

  describe('list', () => {
    it('should list files', async () => {
      const xmlResponse = `<?xml version="1.0" encoding="utf-8"?>
        <EnumerationResults>
          <Blobs>
            <Blob>
              <Name>file1.jpg</Name>
              <Properties>
                <Content-Length>1000</Content-Length>
                <Last-Modified>Mon, 01 Jan 2024 00:00:00 GMT</Last-Modified>
                <Etag>"etag1"</Etag>
                <Content-Type>image/jpeg</Content-Type>
              </Properties>
            </Blob>
            <Blob>
              <Name>file2.png</Name>
              <Properties>
                <Content-Length>2000</Content-Length>
                <Last-Modified>Tue, 02 Jan 2024 00:00:00 GMT</Last-Modified>
                <Etag>"etag2"</Etag>
                <Content-Type>image/png</Content-Type>
              </Properties>
            </Blob>
          </Blobs>
        </EnumerationResults>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(xmlResponse)
      });

      const result = await provider.list({ prefix: 'images/', limit: 10 });

      expect(result.files).toHaveLength(2);
      expect(result.files[0].key).toBe('file1.jpg');
      expect(result.files[1].key).toBe('file2.png');
      expect(result.hasMore).toBe(false);
    });

    it('should handle pagination with NextMarker', async () => {
      const xmlResponse = `<?xml version="1.0" encoding="utf-8"?>
        <EnumerationResults>
          <Blobs>
            <Blob>
              <Name>file1.jpg</Name>
              <Properties>
                <Content-Length>1000</Content-Length>
              </Properties>
            </Blob>
          </Blobs>
          <NextMarker>next-page-token</NextMarker>
        </EnumerationResults>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(xmlResponse)
      });

      const result = await provider.list({ limit: 1 });

      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('next-page-token');
    });
  });

  describe('getPublicUrl', () => {
    it('should return public URL when configured', () => {
      const url = provider.getPublicUrl('images/test.jpg');

      expect(url).toBe('https://storage.example.com/images/test.jpg');
    });

    it('should return Azure URL when no public URL configured', () => {
      const providerNoPublicUrl = new AzureStorageProvider({
        accountName: 'testaccount',
        containerName: 'testcontainer',
        sasToken: 'sv=2021-06-08&sig=testsig'
      });

      const url = providerNoPublicUrl.getPublicUrl('test.jpg');

      expect(url).toBe('https://testaccount.blob.core.windows.net/testcontainer/test.jpg');
    });
  });

  describe('SAS token handling', () => {
    it('should handle SAS token without leading question mark', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await provider.exists('test');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('?sv=2021-06-08');
    });

    it('should handle SAS token with leading question mark', async () => {
      const providerWithQMark = new AzureStorageProvider({
        ...config,
        sasToken: '?sv=2021-06-08&sig=testsig'
      });

      mockFetch.mockResolvedValue({ ok: true });

      await providerWithQMark.exists('test');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('?sv=2021-06-08');
      expect(calledUrl).not.toContain('??');
    });
  });
});
