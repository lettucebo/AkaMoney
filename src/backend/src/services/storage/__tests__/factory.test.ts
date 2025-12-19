import { describe, it, expect, vi } from 'vitest';
import {
  createStorageProvider,
  createStorageProviderFromEnv,
  getStorageProviderType
} from '../factory';
import { R2StorageProvider } from '../r2-provider';
import { AzureStorageProvider } from '../azure-provider';

describe('Storage Factory', () => {
  describe('getStorageProviderType', () => {
    it('should return r2 for undefined provider', () => {
      expect(getStorageProviderType(undefined)).toBe('r2');
    });

    it('should return r2 for empty string', () => {
      expect(getStorageProviderType('')).toBe('r2');
    });

    it('should return r2 for "r2"', () => {
      expect(getStorageProviderType('r2')).toBe('r2');
    });

    it('should return r2 for "R2" (case insensitive)', () => {
      expect(getStorageProviderType('R2')).toBe('r2');
    });

    it('should return r2 for "cloudflare"', () => {
      expect(getStorageProviderType('cloudflare')).toBe('r2');
    });

    it('should return r2 for "Cloudflare" (case insensitive)', () => {
      expect(getStorageProviderType('Cloudflare')).toBe('r2');
    });

    it('should return azure for "azure"', () => {
      expect(getStorageProviderType('azure')).toBe('azure');
    });

    it('should return azure for "Azure" (case insensitive)', () => {
      expect(getStorageProviderType('Azure')).toBe('azure');
    });

    it('should return azure for "azurestorage"', () => {
      expect(getStorageProviderType('azurestorage')).toBe('azure');
    });

    it('should return azure for "azure-storage"', () => {
      expect(getStorageProviderType('azure-storage')).toBe('azure');
    });

    it('should return r2 for unknown provider with warning', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(getStorageProviderType('unknown')).toBe('r2');
      expect(consoleSpy).toHaveBeenCalledWith('Unknown STORAGE_PROVIDER value: unknown, defaulting to r2');
      consoleSpy.mockRestore();
    });

    it('should handle whitespace in provider value', () => {
      expect(getStorageProviderType('  azure  ')).toBe('azure');
    });
  });

  describe('createStorageProvider', () => {
    it('should create R2StorageProvider for r2 config', () => {
      const mockBucket = {} as R2Bucket;
      const provider = createStorageProvider({
        provider: 'r2',
        config: { bucket: mockBucket }
      });
      expect(provider).toBeInstanceOf(R2StorageProvider);
    });

    it('should create AzureStorageProvider for azure config', () => {
      const provider = createStorageProvider({
        provider: 'azure',
        config: {
          accountName: 'testaccount',
          accountKey: 'testkey',
          containerName: 'testcontainer'
        }
      });
      expect(provider).toBeInstanceOf(AzureStorageProvider);
    });
  });

  describe('createStorageProviderFromEnv', () => {
    it('should create R2StorageProvider when STORAGE_PROVIDER is r2 and BUCKET is set', () => {
      const mockBucket = {} as R2Bucket;
      const provider = createStorageProviderFromEnv({
        STORAGE_PROVIDER: 'r2',
        BUCKET: mockBucket
      });
      expect(provider).toBeInstanceOf(R2StorageProvider);
    });

    it('should create R2StorageProvider when STORAGE_PROVIDER is undefined and BUCKET is set', () => {
      const mockBucket = {} as R2Bucket;
      const provider = createStorageProviderFromEnv({
        BUCKET: mockBucket
      });
      expect(provider).toBeInstanceOf(R2StorageProvider);
    });

    it('should return null when STORAGE_PROVIDER is r2 but BUCKET is not set', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const provider = createStorageProviderFromEnv({
        STORAGE_PROVIDER: 'r2'
      });
      expect(provider).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('R2 bucket binding not configured');
      consoleSpy.mockRestore();
    });

    it('should create AzureStorageProvider when STORAGE_PROVIDER is azure and config is complete', () => {
      const provider = createStorageProviderFromEnv({
        STORAGE_PROVIDER: 'azure',
        AZURE_STORAGE_ACCOUNT_NAME: 'testaccount',
        AZURE_STORAGE_ACCOUNT_KEY: 'dGVzdGtleQ==', // base64 encoded
        AZURE_STORAGE_CONTAINER_NAME: 'testcontainer'
      });
      expect(provider).toBeInstanceOf(AzureStorageProvider);
    });

    it('should return null when STORAGE_PROVIDER is azure but config is incomplete', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const provider = createStorageProviderFromEnv({
        STORAGE_PROVIDER: 'azure',
        AZURE_STORAGE_ACCOUNT_NAME: 'testaccount'
        // Missing AZURE_STORAGE_ACCOUNT_KEY and AZURE_STORAGE_CONTAINER_NAME
      });
      expect(provider).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Azure Storage configuration incomplete. Required: AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY, AZURE_STORAGE_CONTAINER_NAME'
      );
      consoleSpy.mockRestore();
    });

    it('should pass custom endpoint URL to Azure provider', () => {
      const provider = createStorageProviderFromEnv({
        STORAGE_PROVIDER: 'azure',
        AZURE_STORAGE_ACCOUNT_NAME: 'testaccount',
        AZURE_STORAGE_ACCOUNT_KEY: 'dGVzdGtleQ==',
        AZURE_STORAGE_CONTAINER_NAME: 'testcontainer',
        AZURE_STORAGE_ENDPOINT_URL: 'https://custom.endpoint.com'
      });
      expect(provider).toBeInstanceOf(AzureStorageProvider);
    });
  });
});
