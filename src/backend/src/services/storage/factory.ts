/**
 * Storage Factory
 * 
 * Factory for creating storage provider instances based on configuration.
 * Supports Cloudflare R2 and Azure Blob Storage.
 */

import type {
  StorageProvider,
  StorageProviderType,
  StorageConfig
} from './types';
import { R2StorageProvider } from './r2-provider';
import { AzureStorageProvider } from './azure-provider';

/**
 * Create a storage provider based on configuration
 * 
 * @param config Storage configuration object
 * @returns StorageProvider instance
 */
export function createStorageProvider(config: StorageConfig): StorageProvider {
  switch (config.provider) {
    case 'r2':
      return new R2StorageProvider(config.config);
    case 'azure':
      return new AzureStorageProvider(config.config);
    default:
      // TypeScript exhaustive check
      const _exhaustiveCheck: never = config;
      throw new Error(`Unknown storage provider: ${(_exhaustiveCheck as StorageConfig).provider}`);
  }
}

/**
 * Get the storage provider type from environment variable
 * 
 * @param providerEnv STORAGE_PROVIDER environment variable value
 * @returns StorageProviderType or undefined if not set/invalid
 */
export function getStorageProviderType(providerEnv?: string): StorageProviderType {
  if (!providerEnv) {
    return 'r2'; // Default to R2 for Cloudflare Workers
  }

  const normalizedProvider = providerEnv.toLowerCase().trim();
  
  if (normalizedProvider === 'r2' || normalizedProvider === 'cloudflare') {
    return 'r2';
  }
  
  if (normalizedProvider === 'azure' || normalizedProvider === 'azurestorage' || normalizedProvider === 'azure-storage') {
    return 'azure';
  }

  // Default to R2 if unknown value
  console.warn(`Unknown STORAGE_PROVIDER value: ${providerEnv}, defaulting to r2`);
  return 'r2';
}

/**
 * Environment interface extension for storage configuration
 */
export interface StorageEnv {
  // Storage provider selection
  STORAGE_PROVIDER?: string;

  // R2 Configuration
  BUCKET?: R2Bucket;

  // Azure Configuration
  AZURE_STORAGE_ACCOUNT_NAME?: string;
  AZURE_STORAGE_ACCOUNT_KEY?: string;
  AZURE_STORAGE_CONTAINER_NAME?: string;
  AZURE_STORAGE_ENDPOINT_URL?: string;
}

/**
 * Create a storage provider from environment bindings
 * 
 * @param env Environment bindings
 * @returns StorageProvider instance or null if not configured
 */
export function createStorageProviderFromEnv(env: StorageEnv): StorageProvider | null {
  const providerType = getStorageProviderType(env.STORAGE_PROVIDER);

  if (providerType === 'azure') {
    // Validate Azure configuration
    if (!env.AZURE_STORAGE_ACCOUNT_NAME || 
        !env.AZURE_STORAGE_ACCOUNT_KEY || 
        !env.AZURE_STORAGE_CONTAINER_NAME) {
      console.error('Azure Storage configuration incomplete. Required: AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY, AZURE_STORAGE_CONTAINER_NAME');
      return null;
    }

    return createStorageProvider({
      provider: 'azure',
      config: {
        accountName: env.AZURE_STORAGE_ACCOUNT_NAME,
        accountKey: env.AZURE_STORAGE_ACCOUNT_KEY,
        containerName: env.AZURE_STORAGE_CONTAINER_NAME,
        endpointUrl: env.AZURE_STORAGE_ENDPOINT_URL
      }
    });
  }

  // Default: R2 provider
  if (!env.BUCKET) {
    console.error('R2 bucket binding not configured');
    return null;
  }

  return createStorageProvider({
    provider: 'r2',
    config: {
      bucket: env.BUCKET
    }
  });
}
