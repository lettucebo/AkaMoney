/**
 * Storage service module - provides abstraction for file storage providers.
 * Supports Cloudflare R2 and Azure Blob Storage with configuration-based switching.
 */

// Export types
export type {
  StorageProvider,
  StorageConfig,
  StorageProviderType,
  FileMetadata,
  UploadOptions,
  UploadResult,
  DownloadResult,
  FileInfo,
  ListOptions,
  ListResult
} from './types';

// Export providers
export { R2StorageProvider } from './r2-provider';
export { AzureStorageProvider, type AzureStorageConfig } from './azure-provider';

// Export factory functions
export {
  createStorageProvider,
  getStorageConfig,
  isStorageConfigured,
  type StorageEnv
} from './factory';
