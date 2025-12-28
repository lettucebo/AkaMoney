/**
 * Azure Blob Storage adapter implementing the StorageProvider interface.
 * Uses Azure Blob Storage REST API directly for Cloudflare Workers compatibility.
 */

import type {
  StorageProvider,
  UploadOptions,
  UploadResult,
  DownloadResult,
  FileInfo,
  ListOptions,
  ListResult
} from './types';

/**
 * Azure Blob Storage provider configuration
 */
export interface AzureStorageConfig {
  /** Azure Storage account name */
  accountName: string;
  /** Azure Storage container name */
  containerName: string;
  /** SAS token for authentication (without leading ?) */
  sasToken: string;
  /** Public URL prefix for accessing files (optional) */
  publicUrl?: string;
}

/**
 * Azure Blob Storage Provider implementation using REST API.
 * Compatible with Cloudflare Workers runtime.
 */
export class AzureStorageProvider implements StorageProvider {
  private accountName: string;
  private containerName: string;
  private sasToken: string;
  private publicUrl?: string;

  /**
   * Create a new Azure Blob Storage provider
   * @param config - Azure storage configuration
   */
  constructor(config: AzureStorageConfig) {
    this.accountName = config.accountName;
    this.containerName = config.containerName;
    this.sasToken = config.sasToken;
    this.publicUrl = config.publicUrl;
  }

  /**
   * Get the base URL for Azure Blob Storage operations
   */
  private getBaseUrl(): string {
    return `https://${this.accountName}.blob.core.windows.net/${this.containerName}`;
  }

  /**
   * Get the full URL for a blob with SAS token
   */
  private getBlobUrl(key: string): string {
    const sasPrefix = this.sasToken.startsWith('?') ? '' : '?';
    return `${this.getBaseUrl()}/${key}${sasPrefix}${this.sasToken}`;
  }

  async upload(
    key: string,
    data: ArrayBuffer | Blob | string,
    options?: UploadOptions
  ): Promise<UploadResult> {
    const url = this.getBlobUrl(key);
    
    const headers: Record<string, string> = {
      'x-ms-blob-type': 'BlockBlob',
      'x-ms-version': '2021-06-08'
    };

    if (options?.contentType) {
      headers['Content-Type'] = options.contentType;
    }

    if (options?.cacheControl) {
      headers['x-ms-blob-cache-control'] = options.cacheControl;
    }

    // Add custom metadata as headers
    if (options?.customMetadata) {
      for (const [key, value] of Object.entries(options.customMetadata)) {
        headers[`x-ms-meta-${key}`] = value;
      }
    }

    // Convert data to appropriate format
    let body: BodyInit;
    if (data instanceof Blob) {
      body = await data.arrayBuffer();
    } else if (typeof data === 'string') {
      body = new TextEncoder().encode(data);
    } else {
      body = data;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure upload failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const etag = response.headers.get('ETag') || undefined;
    const size = body instanceof ArrayBuffer ? body.byteLength : (body as Uint8Array).length;

    return {
      key,
      url: this.getPublicUrl(key),
      size,
      etag: etag?.replace(/"/g, '')
    };
  }

  async download(key: string): Promise<DownloadResult | null> {
    const url = this.getBlobUrl(key);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-ms-version': '2021-06-08'
      }
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure download failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.arrayBuffer();
    const contentType = response.headers.get('Content-Type') || undefined;
    const contentLength = response.headers.get('Content-Length');
    const lastModified = response.headers.get('Last-Modified');

    // Extract custom metadata from headers
    const metadata: Record<string, string> = {};
    response.headers.forEach((value, header) => {
      if (header.toLowerCase().startsWith('x-ms-meta-')) {
        const metaKey = header.substring('x-ms-meta-'.length);
        metadata[metaKey] = value;
      }
    });

    return {
      data,
      contentType,
      size: contentLength ? parseInt(contentLength, 10) : undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      lastModified: lastModified ? new Date(lastModified) : undefined
    };
  }

  async delete(key: string): Promise<void> {
    const url = this.getBlobUrl(key);
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'x-ms-version': '2021-06-08'
      }
    });

    // 404 is acceptable for delete (idempotent operation)
    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      throw new Error(`Azure delete failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    const url = this.getBlobUrl(key);
    
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'x-ms-version': '2021-06-08'
      }
    });

    return response.ok;
  }

  async getInfo(key: string): Promise<FileInfo | null> {
    const url = this.getBlobUrl(key);
    
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'x-ms-version': '2021-06-08'
      }
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure getInfo failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const contentLength = response.headers.get('Content-Length');
    const lastModified = response.headers.get('Last-Modified');
    const etag = response.headers.get('ETag');
    const contentType = response.headers.get('Content-Type');

    return {
      key,
      size: contentLength ? parseInt(contentLength, 10) : 0,
      lastModified: lastModified ? new Date(lastModified) : new Date(),
      etag: etag?.replace(/"/g, ''),
      contentType: contentType || undefined
    };
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const sasPrefix = this.sasToken.startsWith('?') ? '' : '?';
    let url = `${this.getBaseUrl()}${sasPrefix}${this.sasToken}&restype=container&comp=list`;
    
    if (options?.prefix) {
      url += `&prefix=${encodeURIComponent(options.prefix)}`;
    }
    if (options?.limit) {
      url += `&maxresults=${options.limit}`;
    }
    if (options?.cursor) {
      url += `&marker=${encodeURIComponent(options.cursor)}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-ms-version': '2021-06-08'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure list failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const xmlText = await response.text();
    
    // Parse XML response
    const files = this.parseListResponse(xmlText);
    const nextMarker = this.extractNextMarker(xmlText);

    return {
      files,
      cursor: nextMarker,
      hasMore: !!nextMarker
    };
  }

  /**
   * Parse the XML list response from Azure
   */
  private parseListResponse(xml: string): FileInfo[] {
    const files: FileInfo[] = [];
    
    // Simple XML parsing using regex for Cloudflare Workers compatibility
    const blobRegex = /<Blob>[\s\S]*?<\/Blob>/g;
    const blobs = xml.match(blobRegex) || [];

    for (const blob of blobs) {
      const name = this.extractXmlValue(blob, 'Name');
      const size = this.extractXmlValue(blob, 'Content-Length');
      const lastModified = this.extractXmlValue(blob, 'Last-Modified');
      const etag = this.extractXmlValue(blob, 'Etag');
      const contentType = this.extractXmlValue(blob, 'Content-Type');

      if (name) {
        files.push({
          key: name,
          size: size ? parseInt(size, 10) : 0,
          lastModified: lastModified ? new Date(lastModified) : new Date(),
          etag: etag?.replace(/"/g, ''),
          contentType: contentType || undefined
        });
      }
    }

    return files;
  }

  /**
   * Extract a value from XML using regex
   */
  private extractXmlValue(xml: string, tag: string): string | undefined {
    const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`);
    const match = xml.match(regex);
    return match ? match[1] : undefined;
  }

  /**
   * Extract the NextMarker from XML response
   */
  private extractNextMarker(xml: string): string | undefined {
    return this.extractXmlValue(xml, 'NextMarker');
  }

  getPublicUrl(key: string): string | undefined {
    if (this.publicUrl) {
      const baseUrl = this.publicUrl.endsWith('/') 
        ? this.publicUrl.slice(0, -1) 
        : this.publicUrl;
      return `${baseUrl}/${key}`;
    }
    // Default Azure URL without SAS token (requires public container)
    return `${this.getBaseUrl()}/${key}`;
  }
}
