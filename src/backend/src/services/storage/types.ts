/**
 * Storage service types and interfaces for abstracting file storage providers.
 * Supports Cloudflare R2 and Azure Blob Storage.
 */

/**
 * Metadata for uploaded files
 */
export interface FileMetadata {
  /** MIME type of the file */
  contentType?: string;
  /** Custom metadata key-value pairs */
  customMetadata?: Record<string, string>;
  /** Cache-Control header value */
  cacheControl?: string;
}

/**
 * Options for uploading files
 */
export interface UploadOptions extends FileMetadata {
  /** If true, the file will be publicly accessible */
  isPublic?: boolean;
}

/**
 * Result of an upload operation
 */
export interface UploadResult {
  /** Unique key/path of the uploaded file */
  key: string;
  /** Public URL if available */
  url?: string;
  /** Size of the uploaded file in bytes */
  size?: number;
  /** ETag or version identifier */
  etag?: string;
}

/**
 * Result of a download/get operation
 */
export interface DownloadResult {
  /** File content as ArrayBuffer */
  data: ArrayBuffer;
  /** MIME type of the file */
  contentType?: string;
  /** Size in bytes */
  size?: number;
  /** Custom metadata */
  metadata?: Record<string, string>;
  /** Last modified timestamp */
  lastModified?: Date;
}

/**
 * Information about a stored file
 */
export interface FileInfo {
  /** Unique key/path of the file */
  key: string;
  /** Size in bytes */
  size: number;
  /** Last modified timestamp */
  lastModified: Date;
  /** ETag or version identifier */
  etag?: string;
  /** MIME type */
  contentType?: string;
}

/**
 * Options for listing files
 */
export interface ListOptions {
  /** Prefix to filter files */
  prefix?: string;
  /** Maximum number of results */
  limit?: number;
  /** Cursor for pagination */
  cursor?: string;
}

/**
 * Result of listing files
 */
export interface ListResult {
  /** List of file information */
  files: FileInfo[];
  /** Cursor for next page, undefined if no more results */
  cursor?: string;
  /** Whether there are more results */
  hasMore: boolean;
}

/**
 * Abstract interface for storage providers.
 * Implementations should handle provider-specific details.
 */
export interface StorageProvider {
  /**
   * Upload a file to storage
   * @param key - The unique key/path for the file
   * @param data - File content as ArrayBuffer, Blob, or string
   * @param options - Upload options including metadata
   * @returns Upload result with file information
   */
  upload(key: string, data: ArrayBuffer | Blob | string, options?: UploadOptions): Promise<UploadResult>;

  /**
   * Download a file from storage
   * @param key - The unique key/path of the file
   * @returns Download result with file content and metadata
   */
  download(key: string): Promise<DownloadResult | null>;

  /**
   * Delete a file from storage
   * @param key - The unique key/path of the file
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a file exists
   * @param key - The unique key/path of the file
   * @returns True if the file exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Get file information without downloading content
   * @param key - The unique key/path of the file
   * @returns File information or null if not found
   */
  getInfo(key: string): Promise<FileInfo | null>;

  /**
   * List files in storage
   * @param options - List options including prefix and pagination
   * @returns List result with file information
   */
  list(options?: ListOptions): Promise<ListResult>;

  /**
   * Get public URL for a file (if supported)
   * @param key - The unique key/path of the file
   * @returns Public URL or undefined if not available
   */
  getPublicUrl?(key: string): string | undefined;
}

/**
 * Storage provider type
 */
export type StorageProviderType = 'r2' | 'azure';

/**
 * Configuration for storage service
 */
export interface StorageConfig {
  /** The storage provider to use */
  provider: StorageProviderType;
  /** Public URL prefix for accessing files (optional) */
  publicUrl?: string;
}
