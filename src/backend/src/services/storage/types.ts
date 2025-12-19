/**
 * Storage Provider Types
 * 
 * Defines the interface for storage providers (Cloudflare R2, Azure Storage)
 */

/**
 * Storage provider type identifier
 */
export type StorageProviderType = 'r2' | 'azure';

/**
 * Object metadata returned from storage operations
 */
export interface StorageObjectMetadata {
  key: string;
  size: number;
  etag?: string;
  lastModified?: Date;
  contentType?: string;
  customMetadata?: Record<string, string>;
}

/**
 * Options for uploading objects
 */
export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
}

/**
 * Options for listing objects
 */
export interface ListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

/**
 * Result of listing objects
 */
export interface ListResult {
  objects: StorageObjectMetadata[];
  truncated: boolean;
  cursor?: string;
}

/**
 * Storage provider interface
 * 
 * All storage providers must implement this interface to ensure
 * consistent behavior across different cloud platforms.
 */
export interface StorageProvider {
  /**
   * Upload data to storage
   * @param key Object key/path
   * @param data Data to upload (string, buffer, or stream)
   * @param options Upload options
   */
  put(key: string, data: string | ArrayBuffer | ReadableStream, options?: UploadOptions): Promise<void>;

  /**
   * Get object data from storage
   * @param key Object key/path
   * @returns Object data as ArrayBuffer, or null if not found
   */
  get(key: string): Promise<ArrayBuffer | null>;

  /**
   * Get object with metadata
   * @param key Object key/path
   * @returns Object data and metadata, or null if not found
   */
  getWithMetadata(key: string): Promise<{ data: ArrayBuffer; metadata: StorageObjectMetadata } | null>;

  /**
   * Delete object from storage
   * @param key Object key/path
   */
  delete(key: string): Promise<void>;

  /**
   * Check if object exists
   * @param key Object key/path
   */
  exists(key: string): Promise<boolean>;

  /**
   * List objects in storage
   * @param options List options
   */
  list(options?: ListOptions): Promise<ListResult>;

  /**
   * Get object metadata without downloading the content
   * @param key Object key/path
   */
  head(key: string): Promise<StorageObjectMetadata | null>;
}

/**
 * Configuration for Azure Storage provider
 */
export interface AzureStorageConfig {
  accountName: string;
  accountKey: string;
  containerName: string;
  /** Optional custom endpoint URL */
  endpointUrl?: string;
}

/**
 * Configuration for Cloudflare R2 provider
 */
export interface R2StorageConfig {
  bucket: R2Bucket;
}

/**
 * Storage configuration union type
 */
export type StorageConfig = 
  | { provider: 'r2'; config: R2StorageConfig }
  | { provider: 'azure'; config: AzureStorageConfig };
