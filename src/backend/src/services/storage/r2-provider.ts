/**
 * Cloudflare R2 storage adapter implementing the StorageProvider interface.
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
 * R2 Storage Provider implementation using Cloudflare R2 bucket.
 */
export class R2StorageProvider implements StorageProvider {
  private bucket: R2Bucket;
  private publicUrl?: string;

  /**
   * Create a new R2 storage provider
   * @param bucket - R2 bucket binding from Cloudflare Workers
   * @param publicUrl - Optional public URL prefix for accessing files
   */
  constructor(bucket: R2Bucket, publicUrl?: string) {
    this.bucket = bucket;
    this.publicUrl = publicUrl;
  }

  async upload(
    key: string,
    data: ArrayBuffer | Blob | string,
    options?: UploadOptions
  ): Promise<UploadResult> {
    const httpMetadata: R2HTTPMetadata = {};
    
    if (options?.contentType) {
      httpMetadata.contentType = options.contentType;
    }
    if (options?.cacheControl) {
      httpMetadata.cacheControl = options.cacheControl;
    }

    const putOptions: R2PutOptions = {
      httpMetadata,
      customMetadata: options?.customMetadata
    };

    const object = await this.bucket.put(key, data, putOptions);

    return {
      key,
      url: this.getPublicUrl(key),
      size: object.size,
      etag: object.etag
    };
  }

  async download(key: string): Promise<DownloadResult | null> {
    const object = await this.bucket.get(key);
    
    if (!object) {
      return null;
    }

    const data = await object.arrayBuffer();

    return {
      data,
      contentType: object.httpMetadata?.contentType,
      size: object.size,
      metadata: object.customMetadata,
      lastModified: object.uploaded
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const object = await this.bucket.head(key);
    return object !== null;
  }

  async getInfo(key: string): Promise<FileInfo | null> {
    const object = await this.bucket.head(key);
    
    if (!object) {
      return null;
    }

    return {
      key,
      size: object.size,
      lastModified: object.uploaded,
      etag: object.etag,
      contentType: object.httpMetadata?.contentType
    };
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const listOptions: R2ListOptions = {};
    
    if (options?.prefix) {
      listOptions.prefix = options.prefix;
    }
    if (options?.limit) {
      listOptions.limit = options.limit;
    }
    if (options?.cursor) {
      listOptions.cursor = options.cursor;
    }

    const result = await this.bucket.list(listOptions);

    const files: FileInfo[] = result.objects.map(obj => ({
      key: obj.key,
      size: obj.size,
      lastModified: obj.uploaded,
      etag: obj.etag,
      contentType: obj.httpMetadata?.contentType
    }));

    return {
      files,
      cursor: result.truncated ? result.cursor : undefined,
      hasMore: result.truncated
    };
  }

  getPublicUrl(key: string): string | undefined {
    if (!this.publicUrl) {
      return undefined;
    }
    // Ensure no double slashes in URL
    const baseUrl = this.publicUrl.endsWith('/') 
      ? this.publicUrl.slice(0, -1) 
      : this.publicUrl;
    return `${baseUrl}/${key}`;
  }
}
