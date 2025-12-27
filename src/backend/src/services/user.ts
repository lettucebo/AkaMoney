import { nanoid } from 'nanoid';
import type { User } from '../types';

/**
 * Default role for new SSO users
 */
const DEFAULT_USER_ROLE = 'user';

/**
 * Upsert a user based on SSO provider and SSO ID
 * - If the user doesn't exist, create a new record
 * - If the user exists, update last_login_at, updated_at, and name
 */
export async function upsertUser(
  db: D1Database,
  email: string,
  name: string,
  ssoProvider: string,
  ssoId: string
): Promise<User> {
  // Query for existing user by sso_provider and sso_id
  const existingUser = await db
    .prepare('SELECT * FROM users WHERE sso_provider = ? AND sso_id = ?')
    .bind(ssoProvider, ssoId)
    .first<User>();

  const now = Date.now();

  if (!existingUser) {
    // First-time login: INSERT new user with SSO provider information
    const userId = nanoid();

    await db
      .prepare(`
        INSERT INTO users (
          id, email, name, sso_provider, sso_id,
          created_at, updated_at, last_login_at, is_active, role
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `)
      .bind(userId, email, name, ssoProvider, ssoId, now, now, now, DEFAULT_USER_ROLE)
      .run();

    // Return the newly created user
    const newUser = await db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId)
      .first<User>();

    if (!newUser) {
      throw new Error(
        `Failed to create user record for ${email} (SSO: ${ssoProvider})`
      );
    }

    return newUser;
  } else {
    // Subsequent login: UPDATE only timestamps and name (in case it changed in SSO)
    await db
      .prepare(`
        UPDATE users 
        SET last_login_at = ?, updated_at = ?, name = ?
        WHERE id = ?
      `)
      .bind(now, now, name, existingUser.id)
      .run();

    // Return the updated user
    const updatedUser = await db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(existingUser.id)
      .first<User>();

    if (!updatedUser) {
      throw new Error(
        `Failed to retrieve updated user record for ${email} (ID: ${existingUser.id})`
      );
    }

    return updatedUser;
  }
}

