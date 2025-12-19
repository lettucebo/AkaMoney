/**
 * Storage Module
 * 
 * Provides storage abstraction layer supporting multiple cloud storage providers:
 * - Cloudflare R2 (default)
 * - Azure Blob Storage
 * 
 * Usage:
 * ```typescript
 * import { createStorageProviderFromEnv } from './services/storage';
 * 
 * const storage = createStorageProviderFromEnv(env);
 * if (storage) {
 *   await storage.put('key', data);
 *   const result = await storage.get('key');
 * }
 * ```
 */

// Types
export type {
  StorageProvider,
  StorageProviderType,
  StorageObjectMetadata,
  UploadOptions,
  ListOptions,
  ListResult,
  AzureStorageConfig,
  R2StorageConfig,
  StorageConfig
} from './types';

// Providers
export { R2StorageProvider } from './r2-provider';
export { AzureStorageProvider } from './azure-provider';

// Factory
export {
  createStorageProvider,
  createStorageProviderFromEnv,
  getStorageProviderType,
  type StorageEnv
} from './factory';
