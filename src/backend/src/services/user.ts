import { nanoid } from 'nanoid';
import type { D1Database } from '@cloudflare/workers-types';
import type { User } from '../types';

/**
 * Default role for new SSO users
 */
const DEFAULT_USER_ROLE = 'user';

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate input parameters for user upsert
 */
function validateUserInput(
  email: string,
  name: string,
  ssoProvider: string,
  ssoId: string
): void {
  if (!email || typeof email !== 'string' || email.trim() === '') {
    throw new Error('Email is required and must be a non-empty string');
  }
  
  if (!isValidEmail(email)) {
    throw new Error(`Invalid email format: ${email}`);
  }
  
  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Name is required and must be a non-empty string');
  }
  
  if (!ssoProvider || typeof ssoProvider !== 'string' || ssoProvider.trim() === '') {
    throw new Error('SSO provider is required and must be a non-empty string');
  }
  
  if (!ssoId || typeof ssoId !== 'string' || ssoId.trim() === '') {
    throw new Error('SSO ID is required and must be a non-empty string');
  }
}

/**
 * Upsert a user based on SSO provider and SSO ID
 * - If the user doesn't exist, create a new record
 * - If the user exists, update last_login_at, updated_at, and name
 * 
 * Uses atomic INSERT ... ON CONFLICT to prevent race conditions
 */
export async function upsertUser(
  db: D1Database,
  email: string,
  name: string,
  ssoProvider: string,
  ssoId: string
): Promise<User> {
  // Validate input parameters
  validateUserInput(email, name, ssoProvider, ssoId);
  
  const now = Date.now();
  const userId = nanoid();

  // Atomic UPSERT using INSERT ... ON CONFLICT
  // This prevents race conditions by making the operation atomic
  // Note: The WHERE clause is part of the unique index definition, not the ON CONFLICT clause
  try {
    const user = await db
      .prepare(`
        INSERT INTO users (
          id,
          email,
          name,
          sso_provider,
          sso_id,
          created_at,
          updated_at,
          last_login_at,
          is_active,
          role
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT (sso_provider, sso_id) 
        DO UPDATE SET
          last_login_at = excluded.last_login_at,
          updated_at = excluded.updated_at,
          name = excluded.name
        RETURNING *
      `)
      .bind(userId, email, name, ssoProvider, ssoId, now, now, now, DEFAULT_USER_ROLE)
      .first<User>();

    if (!user) {
      throw new Error(
        `Failed to upsert user record for ${email} (SSO: ${ssoProvider})`
      );
    }

    return user;
  } catch (error) {
    // Enhanced error logging to help diagnose SQL errors
    console.error('Failed to upsert user:', {
      email,
      ssoProvider,
      ssoId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw new Error(
      `Failed to upsert user record for ${email} (SSO: ${ssoProvider})`,
      { cause: error instanceof Error ? error : new Error(String(error)) }
    );
  }
}
