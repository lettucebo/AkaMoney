/**
 * Cloudflare R2 Storage Provider
 * 
 * Implementation of the StorageProvider interface for Cloudflare R2
 */

import type {
  StorageProvider,
  StorageObjectMetadata,
  UploadOptions,
  ListOptions,
  ListResult,
  R2StorageConfig
} from './types';

export class R2StorageProvider implements StorageProvider {
  private bucket: R2Bucket;

  constructor(config: R2StorageConfig) {
    this.bucket = config.bucket;
  }

  async put(key: string, data: string | ArrayBuffer | ReadableStream, options?: UploadOptions): Promise<void> {
    const httpMetadata: R2HTTPMetadata = {};
    
    if (options?.contentType) {
      httpMetadata.contentType = options.contentType;
    }
    if (options?.cacheControl) {
      httpMetadata.cacheControl = options.cacheControl;
    }

    await this.bucket.put(key, data, {
      httpMetadata,
      customMetadata: options?.metadata
    });
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    const object = await this.bucket.get(key);
    if (!object) {
      return null;
    }
    return object.arrayBuffer();
  }

  async getWithMetadata(key: string): Promise<{ data: ArrayBuffer; metadata: StorageObjectMetadata } | null> {
    const object = await this.bucket.get(key);
    if (!object) {
      return null;
    }

    const data = await object.arrayBuffer();
    const metadata = this.mapR2ObjectToMetadata(object);

    return { data, metadata };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const object = await this.bucket.head(key);
    return object !== null;
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const listResult = await this.bucket.list({
      prefix: options?.prefix,
      limit: options?.limit,
      cursor: options?.cursor
    });

    return {
      objects: listResult.objects.map(obj => this.mapR2ObjectToMetadata(obj)),
      truncated: listResult.truncated,
      cursor: listResult.truncated ? listResult.cursor : undefined
    };
  }

  async head(key: string): Promise<StorageObjectMetadata | null> {
    const object = await this.bucket.head(key);
    if (!object) {
      return null;
    }
    return this.mapR2ObjectToMetadata(object);
  }

  private mapR2ObjectToMetadata(object: R2Object): StorageObjectMetadata {
    return {
      key: object.key,
      size: object.size,
      etag: object.etag,
      lastModified: object.uploaded,
      contentType: object.httpMetadata?.contentType,
      customMetadata: object.customMetadata
    };
  }
}
