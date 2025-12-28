/**
 * Storage service factory for creating storage providers based on configuration.
 */

import type { StorageProvider, StorageProviderType, StorageConfig } from './types';
import { R2StorageProvider } from './r2-provider';
import { AzureStorageProvider, AzureStorageConfig } from './azure-provider';

/**
 * Environment bindings for storage configuration
 */
export interface StorageEnv {
  /** Storage provider type: 'r2' or 'azure' */
  STORAGE_PROVIDER?: StorageProviderType;
  /** R2 bucket binding (for Cloudflare R2) */
  BUCKET?: R2Bucket;
  /** Public URL for R2 storage */
  R2_PUBLIC_URL?: string;
  /** Azure Storage account name */
  AZURE_STORAGE_ACCOUNT?: string;
  /** Azure Storage container name */
  AZURE_STORAGE_CONTAINER?: string;
  /** Azure Storage SAS token */
  AZURE_STORAGE_SAS_TOKEN?: string;
  /** Public URL for Azure storage */
  AZURE_PUBLIC_URL?: string;
}

/**
 * Get the storage configuration from environment
 */
export function getStorageConfig(env: StorageEnv): StorageConfig {
  const provider = (env.STORAGE_PROVIDER || 'r2') as StorageProviderType;
  
  let publicUrl: string | undefined;
  if (provider === 'r2') {
    publicUrl = env.R2_PUBLIC_URL;
  } else if (provider === 'azure') {
    publicUrl = env.AZURE_PUBLIC_URL;
  }

  return {
    provider,
    publicUrl
  };
}

/**
 * Create a storage provider based on environment configuration.
 * 
 * @param env - Environment bindings
 * @returns Configured storage provider
 * @throws Error if required configuration is missing
 */
export function createStorageProvider(env: StorageEnv): StorageProvider {
  const provider = (env.STORAGE_PROVIDER || 'r2') as StorageProviderType;

  switch (provider) {
    case 'r2':
      if (!env.BUCKET) {
        throw new Error('R2 storage requires BUCKET binding');
      }
      return new R2StorageProvider(env.BUCKET, env.R2_PUBLIC_URL);

    case 'azure':
      if (!env.AZURE_STORAGE_ACCOUNT) {
        throw new Error('Azure storage requires AZURE_STORAGE_ACCOUNT');
      }
      if (!env.AZURE_STORAGE_CONTAINER) {
        throw new Error('Azure storage requires AZURE_STORAGE_CONTAINER');
      }
      if (!env.AZURE_STORAGE_SAS_TOKEN) {
        throw new Error('Azure storage requires AZURE_STORAGE_SAS_TOKEN');
      }
      
      const azureConfig: AzureStorageConfig = {
        accountName: env.AZURE_STORAGE_ACCOUNT,
        containerName: env.AZURE_STORAGE_CONTAINER,
        sasToken: env.AZURE_STORAGE_SAS_TOKEN,
        publicUrl: env.AZURE_PUBLIC_URL
      };
      return new AzureStorageProvider(azureConfig);

    default:
      throw new Error(`Unknown storage provider: ${provider}`);
  }
}

/**
 * Check if storage is configured and available
 */
export function isStorageConfigured(env: StorageEnv): boolean {
  const provider = (env.STORAGE_PROVIDER || 'r2') as StorageProviderType;

  switch (provider) {
    case 'r2':
      return !!env.BUCKET;
    case 'azure':
      return !!(env.AZURE_STORAGE_ACCOUNT && 
                env.AZURE_STORAGE_CONTAINER && 
                env.AZURE_STORAGE_SAS_TOKEN);
    default:
      return false;
  }
}
