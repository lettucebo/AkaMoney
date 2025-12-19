/**
 * Azure Blob Storage Provider
 * 
 * Implementation of the StorageProvider interface for Azure Blob Storage.
 * Uses Azure Blob Storage REST API directly to avoid heavy SDK dependencies
 * that may not be compatible with Cloudflare Workers environment.
 */

import type {
  StorageProvider,
  StorageObjectMetadata,
  UploadOptions,
  ListOptions,
  ListResult,
  AzureStorageConfig
} from './types';

export class AzureStorageProvider implements StorageProvider {
  private accountName: string;
  private accountKey: string;
  private containerName: string;
  private baseUrl: string;

  constructor(config: AzureStorageConfig) {
    this.accountName = config.accountName;
    this.accountKey = config.accountKey;
    this.containerName = config.containerName;
    this.baseUrl = config.endpointUrl || 
      `https://${config.accountName}.blob.core.windows.net`;
  }

  /**
   * Generate Azure Storage authorization header using Shared Key authentication
   */
  private async generateAuthHeader(
    method: string,
    path: string,
    headers: Record<string, string>,
    contentLength: number = 0
  ): Promise<string> {
    const now = new Date().toUTCString();
    headers['x-ms-date'] = now;
    headers['x-ms-version'] = '2021-08-06';

    // Build canonicalized headers
    const canonicalizedHeaders = Object.entries(headers)
      .filter(([key]) => key.toLowerCase().startsWith('x-ms-'))
      .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(([key, value]) => `${key.toLowerCase()}:${value}`)
      .join('\n');

    // Build canonicalized resource
    const canonicalizedResource = `/${this.accountName}${path}`;

    // String to sign
    const stringToSign = [
      method.toUpperCase(),
      headers['Content-Encoding'] || '',
      headers['Content-Language'] || '',
      contentLength > 0 ? contentLength.toString() : '',
      headers['Content-MD5'] || '',
      headers['Content-Type'] || '',
      '', // Date (empty because we use x-ms-date)
      '', // If-Modified-Since
      '', // If-Match
      '', // If-None-Match
      '', // If-Unmodified-Since
      '', // Range
      canonicalizedHeaders,
      canonicalizedResource
    ].join('\n');

    // Sign the string
    const encoder = new TextEncoder();
    const keyData = this.base64ToArrayBuffer(this.accountKey);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
    const signatureBase64 = this.arrayBufferToBase64(signature);

    return `SharedKey ${this.accountName}:${signatureBase64}`;
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private getBlobUrl(key: string): string {
    return `${this.baseUrl}/${this.containerName}/${encodeURIComponent(key)}`;
  }

  async put(key: string, data: string | ArrayBuffer | ReadableStream, options?: UploadOptions): Promise<void> {
    let bodyData: ArrayBuffer;
    
    if (typeof data === 'string') {
      bodyData = new TextEncoder().encode(data).buffer;
    } else if (data instanceof ArrayBuffer) {
      bodyData = data;
    } else {
      // ReadableStream - collect all chunks into memory
      // Note: This loads the entire stream into memory. For very large files,
      // consider using Azure's block blob upload API with chunked uploads.
      const reader = data.getReader();
      const chunks: Uint8Array[] = [];
      let done = false;
      
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          chunks.push(result.value);
        }
      }
      
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      bodyData = combined.buffer;
    }

    const path = `/${this.containerName}/${encodeURIComponent(key)}`;
    const headers: Record<string, string> = {
      'x-ms-blob-type': 'BlockBlob'
    };

    if (options?.contentType) {
      headers['Content-Type'] = options.contentType;
    }
    if (options?.cacheControl) {
      headers['x-ms-blob-cache-control'] = options.cacheControl;
    }
    if (options?.metadata) {
      for (const [metaKey, metaValue] of Object.entries(options.metadata)) {
        headers[`x-ms-meta-${metaKey}`] = metaValue;
      }
    }

    const authHeader = await this.generateAuthHeader('PUT', path, headers, bodyData.byteLength);
    headers['Authorization'] = authHeader;

    const response = await fetch(this.getBlobUrl(key), {
      method: 'PUT',
      headers,
      body: bodyData
    });

    if (!response.ok) {
      throw new Error(`Azure Storage PUT failed: ${response.status} ${response.statusText}`);
    }
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    const path = `/${this.containerName}/${encodeURIComponent(key)}`;
    const headers: Record<string, string> = {};
    const authHeader = await this.generateAuthHeader('GET', path, headers);
    headers['Authorization'] = authHeader;

    const response = await fetch(this.getBlobUrl(key), {
      method: 'GET',
      headers
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Azure Storage GET failed: ${response.status} ${response.statusText}`);
    }

    return response.arrayBuffer();
  }

  async getWithMetadata(key: string): Promise<{ data: ArrayBuffer; metadata: StorageObjectMetadata } | null> {
    const path = `/${this.containerName}/${encodeURIComponent(key)}`;
    const headers: Record<string, string> = {};
    const authHeader = await this.generateAuthHeader('GET', path, headers);
    headers['Authorization'] = authHeader;

    const response = await fetch(this.getBlobUrl(key), {
      method: 'GET',
      headers
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Azure Storage GET failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.arrayBuffer();
    const metadata = this.extractMetadataFromResponse(key, response);

    return { data, metadata };
  }

  async delete(key: string): Promise<void> {
    const path = `/${this.containerName}/${encodeURIComponent(key)}`;
    const headers: Record<string, string> = {};
    const authHeader = await this.generateAuthHeader('DELETE', path, headers);
    headers['Authorization'] = authHeader;

    const response = await fetch(this.getBlobUrl(key), {
      method: 'DELETE',
      headers
    });

    // 404 is acceptable for delete - idempotent behavior
    if (!response.ok && response.status !== 404) {
      throw new Error(`Azure Storage DELETE failed: ${response.status} ${response.statusText}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    const metadata = await this.head(key);
    return metadata !== null;
  }

  async list(options?: ListOptions): Promise<ListResult> {
    let path = `/${this.containerName}?restype=container&comp=list`;
    
    if (options?.prefix) {
      path += `&prefix=${encodeURIComponent(options.prefix)}`;
    }
    if (options?.limit) {
      path += `&maxresults=${options.limit}`;
    }
    if (options?.cursor) {
      path += `&marker=${encodeURIComponent(options.cursor)}`;
    }

    const headers: Record<string, string> = {};
    const authHeader = await this.generateAuthHeader('GET', path, headers);
    headers['Authorization'] = authHeader;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      throw new Error(`Azure Storage LIST failed: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    return this.parseListResponse(text);
  }

  async head(key: string): Promise<StorageObjectMetadata | null> {
    const path = `/${this.containerName}/${encodeURIComponent(key)}`;
    const headers: Record<string, string> = {};
    const authHeader = await this.generateAuthHeader('HEAD', path, headers);
    headers['Authorization'] = authHeader;

    const response = await fetch(this.getBlobUrl(key), {
      method: 'HEAD',
      headers
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Azure Storage HEAD failed: ${response.status} ${response.statusText}`);
    }

    return this.extractMetadataFromResponse(key, response);
  }

  private extractMetadataFromResponse(key: string, response: Response): StorageObjectMetadata {
    const customMetadata: Record<string, string> = {};
    
    response.headers.forEach((value, headerKey) => {
      if (headerKey.toLowerCase().startsWith('x-ms-meta-')) {
        const metaKey = headerKey.substring('x-ms-meta-'.length);
        customMetadata[metaKey] = value;
      }
    });

    const lastModifiedStr = response.headers.get('last-modified');
    const lastModified = lastModifiedStr ? new Date(lastModifiedStr) : undefined;

    const contentLengthStr = response.headers.get('content-length');
    const size = contentLengthStr ? parseInt(contentLengthStr, 10) : 0;

    return {
      key,
      size,
      etag: response.headers.get('etag') || undefined,
      lastModified,
      contentType: response.headers.get('content-type') || undefined,
      customMetadata: Object.keys(customMetadata).length > 0 ? customMetadata : undefined
    };
  }

  /**
   * Decode XML entities in a string
   * Note: &amp; is replaced last to prevent double-unescaping
   * (e.g., &amp;lt; should become &lt; not <)
   */
  private decodeXmlEntities(text: string): string {
    return text
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  /**
   * Extract text content from an XML element
   */
  private extractXmlElement(xml: string, tagName: string): string | null {
    const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 's');
    const match = regex.exec(xml);
    return match ? this.decodeXmlEntities(match[1]) : null;
  }

  private parseListResponse(xml: string): ListResult {
    const objects: StorageObjectMetadata[] = [];
    
    // Extract blob entries
    const blobRegex = /<Blob>([\s\S]*?)<\/Blob>/g;
    let blobMatch;
    
    while ((blobMatch = blobRegex.exec(xml)) !== null) {
      const blobXml = blobMatch[1];
      
      const name = this.extractXmlElement(blobXml, 'Name');
      const sizeStr = this.extractXmlElement(blobXml, 'Content-Length');
      const lastModifiedStr = this.extractXmlElement(blobXml, 'Last-Modified');
      const contentType = this.extractXmlElement(blobXml, 'Content-Type');
      const etag = this.extractXmlElement(blobXml, 'Etag');

      if (name) {
        objects.push({
          key: name,
          size: sizeStr ? parseInt(sizeStr, 10) : 0,
          lastModified: lastModifiedStr ? new Date(lastModifiedStr) : undefined,
          contentType: contentType || undefined,
          etag: etag || undefined
        });
      }
    }

    // Check for next marker (pagination)
    const cursor = this.extractXmlElement(xml, 'NextMarker');

    return {
      objects,
      truncated: !!cursor,
      cursor: cursor || undefined
    };
  }
}
