import { describe, it, expect, vi } from 'vitest';
import { createStorageProvider, getStorageConfig, isStorageConfigured, StorageEnv } from '../factory';
import { R2StorageProvider } from '../r2-provider';
import { AzureStorageProvider } from '../azure-provider';

// Mock R2Bucket
const mockR2Bucket = {
  put: vi.fn(),
  get: vi.fn(),
  head: vi.fn(),
  delete: vi.fn(),
  list: vi.fn()
} as unknown as R2Bucket;

describe('Storage Factory', () => {
  describe('getStorageConfig', () => {
    it('should default to r2 provider', () => {
      const config = getStorageConfig({});

      expect(config.provider).toBe('r2');
    });

    it('should use specified provider', () => {
      const config = getStorageConfig({ STORAGE_PROVIDER: 'azure' });

      expect(config.provider).toBe('azure');
    });

    it('should include R2 public URL for r2 provider', () => {
      const config = getStorageConfig({
        STORAGE_PROVIDER: 'r2',
        R2_PUBLIC_URL: 'https://r2.example.com'
      });

      expect(config.publicUrl).toBe('https://r2.example.com');
    });

    it('should include Azure public URL for azure provider', () => {
      const config = getStorageConfig({
        STORAGE_PROVIDER: 'azure',
        AZURE_PUBLIC_URL: 'https://azure.example.com'
      });

      expect(config.publicUrl).toBe('https://azure.example.com');
    });
  });

  describe('createStorageProvider', () => {
    it('should create R2StorageProvider by default', () => {
      const env: StorageEnv = {
        BUCKET: mockR2Bucket,
        R2_PUBLIC_URL: 'https://r2.example.com'
      };

      const provider = createStorageProvider(env);

      expect(provider).toBeInstanceOf(R2StorageProvider);
    });

    it('should create R2StorageProvider when specified', () => {
      const env: StorageEnv = {
        STORAGE_PROVIDER: 'r2',
        BUCKET: mockR2Bucket
      };

      const provider = createStorageProvider(env);

      expect(provider).toBeInstanceOf(R2StorageProvider);
    });

    it('should throw error when R2 bucket is missing', () => {
      const env: StorageEnv = {
        STORAGE_PROVIDER: 'r2'
      };

      expect(() => createStorageProvider(env))
        .toThrow('R2 storage requires BUCKET binding');
    });

    it('should create AzureStorageProvider when specified', () => {
      const env: StorageEnv = {
        STORAGE_PROVIDER: 'azure',
        AZURE_STORAGE_ACCOUNT: 'testaccount',
        AZURE_STORAGE_CONTAINER: 'testcontainer',
        AZURE_STORAGE_SAS_TOKEN: 'sv=2021-06-08&sig=test'
      };

      const provider = createStorageProvider(env);

      expect(provider).toBeInstanceOf(AzureStorageProvider);
    });

    it('should throw error when Azure account is missing', () => {
      const env: StorageEnv = {
        STORAGE_PROVIDER: 'azure',
        AZURE_STORAGE_CONTAINER: 'testcontainer',
        AZURE_STORAGE_SAS_TOKEN: 'token'
      };

      expect(() => createStorageProvider(env))
        .toThrow('Azure storage requires AZURE_STORAGE_ACCOUNT');
    });

    it('should throw error when Azure container is missing', () => {
      const env: StorageEnv = {
        STORAGE_PROVIDER: 'azure',
        AZURE_STORAGE_ACCOUNT: 'testaccount',
        AZURE_STORAGE_SAS_TOKEN: 'token'
      };

      expect(() => createStorageProvider(env))
        .toThrow('Azure storage requires AZURE_STORAGE_CONTAINER');
    });

    it('should throw error when Azure SAS token is missing', () => {
      const env: StorageEnv = {
        STORAGE_PROVIDER: 'azure',
        AZURE_STORAGE_ACCOUNT: 'testaccount',
        AZURE_STORAGE_CONTAINER: 'testcontainer'
      };

      expect(() => createStorageProvider(env))
        .toThrow('Azure storage requires AZURE_STORAGE_SAS_TOKEN');
    });

    it('should throw error for unknown provider', () => {
      const env = {
        STORAGE_PROVIDER: 'unknown'
      } as unknown as StorageEnv;

      expect(() => createStorageProvider(env))
        .toThrow('Unknown storage provider: unknown');
    });
  });

  describe('isStorageConfigured', () => {
    it('should return true when R2 bucket is configured', () => {
      const env: StorageEnv = {
        BUCKET: mockR2Bucket
      };

      expect(isStorageConfigured(env)).toBe(true);
    });

    it('should return false when R2 bucket is not configured', () => {
      const env: StorageEnv = {
        STORAGE_PROVIDER: 'r2'
      };

      expect(isStorageConfigured(env)).toBe(false);
    });

    it('should return true when Azure is fully configured', () => {
      const env: StorageEnv = {
        STORAGE_PROVIDER: 'azure',
        AZURE_STORAGE_ACCOUNT: 'testaccount',
        AZURE_STORAGE_CONTAINER: 'testcontainer',
        AZURE_STORAGE_SAS_TOKEN: 'token'
      };

      expect(isStorageConfigured(env)).toBe(true);
    });

    it('should return false when Azure is partially configured', () => {
      const env: StorageEnv = {
        STORAGE_PROVIDER: 'azure',
        AZURE_STORAGE_ACCOUNT: 'testaccount'
      };

      expect(isStorageConfigured(env)).toBe(false);
    });

    it('should return false for unknown provider', () => {
      const env = {
        STORAGE_PROVIDER: 'unknown'
      } as unknown as StorageEnv;

      expect(isStorageConfigured(env)).toBe(false);
    });
  });
});
