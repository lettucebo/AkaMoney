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
    it('should create a new user on first login', async () => {
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
        first: vi.fn()
          .mockResolvedValueOnce(null) // No existing user
          .mockResolvedValueOnce(mockUser), // Return new user after insert
        run: vi.fn().mockResolvedValue({ success: true })
      };

      const result = await upsertUser(
        mockDb,
        'test@example.com',
        'Test User',
        'entra',
        'entra-user-123'
      );

      // Verify the query to check for existing user
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE sso_provider = ? AND sso_id = ?'
      );
      expect(mockDb.bind).toHaveBeenCalledWith('entra', 'entra-user-123');

      // Verify INSERT was called
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users')
      );

      // Verify the result
      expect(result).toBeDefined();
      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe('Test User');
      expect(result.sso_provider).toBe('entra');
      expect(result.sso_id).toBe('entra-user-123');
    });

    it('should update existing user on subsequent login', async () => {
      const existingUser: User = {
        id: 'existing-user-id',
        email: 'existing@example.com',
        name: 'Old Name',
        sso_provider: 'entra',
        sso_id: 'entra-user-456',
        password_hash: null,
        entra_id: null,
        role: 'user',
        created_at: 1000000,
        updated_at: 1000000,
        last_login_at: 1000000,
        is_active: 1
      };

      const updatedUser: User = {
        ...existingUser,
        name: 'New Name',
        updated_at: Date.now(),
        last_login_at: Date.now()
      };

      mockDb = {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        first: vi.fn()
          .mockResolvedValueOnce(existingUser) // Found existing user
          .mockResolvedValueOnce(updatedUser), // Return updated user
        run: vi.fn().mockResolvedValue({ success: true })
      };

      const result = await upsertUser(
        mockDb,
        'existing@example.com',
        'New Name',
        'entra',
        'entra-user-456'
      );

      // Verify UPDATE was called
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users')
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
        first: vi.fn()
          .mockResolvedValueOnce(null) // No existing user
          .mockResolvedValueOnce(mockUser), // Return new user
        run: vi.fn().mockResolvedValue({ success: true })
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

    it('should throw error if user creation fails', async () => {
      mockDb = {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        first: vi.fn()
          .mockResolvedValueOnce(null) // No existing user
          .mockResolvedValueOnce(null), // Failed to create user
        run: vi.fn().mockResolvedValue({ success: true })
      };

      await expect(
        upsertUser(mockDb, 'test@example.com', 'Test User', 'entra', 'entra-123')
      ).rejects.toThrow('Failed to create user');
    });

    it('should throw error if user update fails', async () => {
      const existingUser: User = {
        id: 'existing-user-id',
        email: 'existing@example.com',
        name: 'Existing User',
        sso_provider: 'entra',
        sso_id: 'entra-789',
        password_hash: null,
        entra_id: null,
        role: 'user',
        created_at: 1000000,
        updated_at: 1000000,
        last_login_at: 1000000,
        is_active: 1
      };

      mockDb = {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        first: vi.fn()
          .mockResolvedValueOnce(existingUser) // Found existing user
          .mockResolvedValueOnce(null), // Failed to retrieve updated user
        run: vi.fn().mockResolvedValue({ success: true })
      };

      await expect(
        upsertUser(mockDb, 'existing@example.com', 'Updated Name', 'entra', 'entra-789')
      ).rejects.toThrow('Failed to retrieve updated user record');
    });

    it('should update name if changed in SSO', async () => {
      const existingUser: User = {
        id: 'user-id',
        email: 'user@example.com',
        name: 'Old Name',
        sso_provider: 'entra',
        sso_id: 'entra-999',
        password_hash: null,
        entra_id: null,
        role: 'user',
        created_at: 1000000,
        updated_at: 1000000,
        last_login_at: 1000000,
        is_active: 1
      };

      const updatedUser: User = {
        ...existingUser,
        name: 'Updated Name from SSO',
        updated_at: Date.now(),
        last_login_at: Date.now()
      };

      mockDb = {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        first: vi.fn()
          .mockResolvedValueOnce(existingUser)
          .mockResolvedValueOnce(updatedUser),
        run: vi.fn().mockResolvedValue({ success: true })
      };

      const result = await upsertUser(
        mockDb,
        'user@example.com',
        'Updated Name from SSO',
        'entra',
        'entra-999'
      );

      // Verify UPDATE includes the new name
      expect(mockDb.bind).toHaveBeenCalledWith(
        expect.any(Number), // now timestamp
        expect.any(Number), // now timestamp
        'Updated Name from SSO',
        'user-id'
      );

      expect(result.name).toBe('Updated Name from SSO');
    });
  });
});
