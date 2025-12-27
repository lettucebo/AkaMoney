import { describe, it, expect, beforeEach, vi } from 'vitest';
import { upsertUser } from '../user';
import type { User } from '../../types';

/**
 * Integration test demonstrating the complete SSO user flow
 */
describe('SSO User Integration Flow', () => {
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should demonstrate complete first-time login and subsequent login flow', async () => {
    // Simulate first-time login from Entra ID
    const entraSsoId = 'entra-abc-123';
    const userEmail = 'user@company.com';
    const userName = 'John Doe';

    const newUser: User = {
      id: 'generated-user-id-1',
      email: userEmail,
      name: userName,
      sso_provider: 'entra',
      sso_id: entraSsoId,
      password_hash: null,
      entra_id: null,
      role: 'user',
      created_at: 1000000,
      updated_at: 1000000,
      last_login_at: 1000000,
      is_active: 1
    };

    // Mock database for first login (atomic UPSERT returns new user)
    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(newUser)
    };

    // First login - should create user
    const firstLoginResult = await upsertUser(
      mockDb,
      userEmail,
      userName,
      'entra',
      entraSsoId
    );

    expect(firstLoginResult).toBeDefined();
    expect(firstLoginResult.email).toBe(userEmail);
    expect(firstLoginResult.sso_provider).toBe('entra');
    expect(firstLoginResult.sso_id).toBe(entraSsoId);
    expect(firstLoginResult.role).toBe('user');

    // Verify atomic UPSERT was called
    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users')
    );
    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT')
    );

    // Simulate subsequent login (user already exists)
    const updatedUser: User = {
      ...newUser,
      name: 'John Doe Updated', // Name might change in SSO
      updated_at: 2000000,
      last_login_at: 2000000
    };

    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(updatedUser)
    };

    // Second login - should update user (via ON CONFLICT DO UPDATE)
    const secondLoginResult = await upsertUser(
      mockDb,
      userEmail,
      'John Doe Updated',
      'entra',
      entraSsoId
    );

    expect(secondLoginResult).toBeDefined();
    expect(secondLoginResult.name).toBe('John Doe Updated');
    expect(secondLoginResult.sso_provider).toBe('entra'); // Should remain unchanged
    expect(secondLoginResult.sso_id).toBe(entraSsoId); // Should remain unchanged

    // Verify atomic UPSERT was used (same query for both operations)
    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users')
    );
    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT')
    );
  });

  it('should handle multiple SSO providers for same email (different users)', async () => {
    // User logs in with Entra ID
    const entraUser: User = {
      id: 'user-entra-1',
      email: 'shared@example.com',
      name: 'User via Entra',
      sso_provider: 'entra',
      sso_id: 'entra-123',
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
      first: vi.fn().mockResolvedValue(entraUser)
    };

    const entraResult = await upsertUser(
      mockDb,
      'shared@example.com',
      'User via Entra',
      'entra',
      'entra-123'
    );

    expect(entraResult.sso_provider).toBe('entra');
    expect(entraResult.sso_id).toBe('entra-123');

    // Same user logs in with Google (different SSO, same email)
    const googleUser: User = {
      id: 'user-google-1',
      email: 'shared@example.com',
      name: 'User via Google',
      sso_provider: 'google',
      sso_id: 'google-456',
      password_hash: null,
      entra_id: null,
      role: 'user',
      created_at: 2000000,
      updated_at: 2000000,
      last_login_at: 2000000,
      is_active: 1
    };

    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(googleUser)
    };

    const googleResult = await upsertUser(
      mockDb,
      'shared@example.com',
      'User via Google',
      'google',
      'google-456'
    );

    expect(googleResult.sso_provider).toBe('google');
    expect(googleResult.sso_id).toBe('google-456');

    // Different users even though same email
    // This is by design - (sso_provider, sso_id) is the unique identifier
    expect(entraResult.id).not.toBe(googleResult.id);
  });
});
