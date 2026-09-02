import { describe, it, expect, beforeEach, vi } from 'vitest';
import { upsertUser } from '../user';
import type { User } from '../../types';

describe('User Service', () => {
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('upsertUser', () => {
    it('should create a new user on first login using atomic UPSERT', async () => {
      const mockUser: User = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        sso_provider: 'entra',
        sso_id: 'entra-user-123',
        password_hash: null,
        entra_id: null,
        role: 'user',
        created_at: Date.now(),
        updated_at: Date.now(),
        last_login_at: Date.now(),
        is_active: 1
      };

      mockDb = {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser)
      };

      const result = await upsertUser(
        mockDb,
        'test@example.com',
        'Test User',
        'entra',
        'entra-user-123'
      );

      // Verify INSERT ... ON CONFLICT was called
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users')
      );
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT')
      );
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('RETURNING *')
      );

      // Verify the result
      expect(result).toBeDefined();
      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe('Test User');
      expect(result.sso_provider).toBe('entra');
      expect(result.sso_id).toBe('entra-user-123');
    });

    it('should update existing user on subsequent login using atomic UPSERT', async () => {
      const updatedUser: User = {
        id: 'existing-user-id',
        email: 'existing@example.com',
        name: 'New Name',
        sso_provider: 'entra',
        sso_id: 'entra-user-456',
        password_hash: null,
        entra_id: null,
        role: 'user',
        created_at: 1000000,
        updated_at: Date.now(),
        last_login_at: Date.now(),
        is_active: 1
      };

      mockDb = {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(updatedUser)
      };

      const result = await upsertUser(
        mockDb,
        'existing@example.com',
        'New Name',
        'entra',
        'entra-user-456'
      );

      // Verify atomic UPSERT was used (not separate SELECT/UPDATE)
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users')
      );
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT')
      );

      // Verify the result
      expect(result).toBeDefined();
      expect(result.id).toBe('existing-user-id');
      expect(result.name).toBe('New Name');
    });

    it('should handle Google SSO provider', async () => {
      const mockUser: User = {
        id: 'google-user-id',
        email: 'google@example.com',
        name: 'Google User',
        sso_provider: 'google',
        sso_id: 'google-123456',
        password_hash: null,
        entra_id: null,
        role: 'user',
        created_at: Date.now(),
        updated_at: Date.now(),
        last_login_at: Date.now(),
        is_active: 1
      };

      mockDb = {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser)
      };

      const result = await upsertUser(
        mockDb,
        'google@example.com',
        'Google User',
        'google',
        'google-123456'
      );

      expect(result.sso_provider).toBe('google');
      expect(result.sso_id).toBe('google-123456');
    });

    it('should throw error if upsert operation fails', async () => {
      const rawEmail = 'test@example.com';
      const rawSsoId = 'entra-123';
      mockDb = {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null) // Upsert failed
      };

      await expect(
        upsertUser(mockDb, rawEmail, 'Test User', 'entra', rawSsoId)
      ).rejects.toThrow('Failed to upsert user record');

      const thrown = await upsertUser(mockDb, rawEmail, 'Test User', 'entra', rawSsoId).catch(
        (error) => error as Error
      );
      expect(thrown.message).not.toContain(rawEmail);
      expect(thrown.message).not.toContain(rawSsoId);

      const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
      expect(logged).not.toContain(rawEmail);
      expect(logged).not.toContain(rawSsoId);
      expect(logged).toContain('"ssoProvider":"entra"');
    });

    it('should validate email format', async () => {
      const invalidEmail = 'invalid-email';
      mockDb = {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        first: vi.fn()
      };

      await expect(
        upsertUser(mockDb, invalidEmail, 'Test User', 'entra', 'entra-123')
      ).rejects.toThrow('Invalid email format');

      const thrown = await upsertUser(mockDb, invalidEmail, 'Test User', 'entra', 'entra-123').catch(
        (error) => error as Error
      );
      expect(thrown.message).not.toContain(invalidEmail);
    });

    it('should validate required parameters', async () => {
      mockDb = {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        first: vi.fn()
      };

      // Empty email
      await expect(
        upsertUser(mockDb, '', 'Test User', 'entra', 'entra-123')
      ).rejects.toThrow('Email is required');

      // Empty name
      await expect(
        upsertUser(mockDb, 'test@example.com', '', 'entra', 'entra-123')
      ).rejects.toThrow('Name is required');

      // Empty SSO provider
      await expect(
        upsertUser(mockDb, 'test@example.com', 'Test User', '', 'entra-123')
      ).rejects.toThrow('SSO provider is required');

      // Empty SSO ID
      await expect(
        upsertUser(mockDb, 'test@example.com', 'Test User', 'entra', '')
      ).rejects.toThrow('SSO ID is required');
    });

    it('should update name if changed in SSO', async () => {
      const updatedUser: User = {
        id: 'user-id',
        email: 'user@example.com',
        name: 'Updated Name from SSO',
        sso_provider: 'entra',
        sso_id: 'entra-999',
        password_hash: null,
        entra_id: null,
        role: 'user',
        created_at: 1000000,
        updated_at: Date.now(),
        last_login_at: Date.now(),
        is_active: 1
      };

      mockDb = {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(updatedUser)
      };

      const result = await upsertUser(
        mockDb,
        'user@example.com',
        'Updated Name from SSO',
        'entra',
        'entra-999'
      );

      expect(result.name).toBe('Updated Name from SSO');
    });
  });
});
