-- Migration: Fix SSO unique constraint for ON CONFLICT compatibility
-- This migration replaces the partial unique index with a proper UNIQUE constraint
-- to enable ON CONFLICT clause to work correctly with SQLite/D1

-- SQLite's ON CONFLICT clause doesn't work with partial indexes (indexes with WHERE clause)
-- It only works with UNIQUE constraints or complete unique indexes
-- Since we can't add constraints to existing tables in SQLite, we need to recreate the table

-- Step 1: Create new users table with proper UNIQUE constraint
CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT,
  entra_id TEXT UNIQUE,
  name TEXT,
  role TEXT DEFAULT 'user',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER,
  is_active INTEGER DEFAULT 1,
  sso_provider TEXT,
  sso_id TEXT,
  -- UNIQUE constraint on (sso_provider, sso_id) - works with ON CONFLICT
  -- NULL values are considered distinct in SQLite, so multiple NULL pairs are allowed
  UNIQUE(sso_provider, sso_id),
  -- Ensure SSO fields are either both NULL or both non-NULL
  CHECK (
    (sso_provider IS NULL AND sso_id IS NULL)
    OR
    (sso_provider IS NOT NULL AND sso_id IS NOT NULL)
  )
);

-- Step 2: Copy data from old table to new table
INSERT INTO users_new 
SELECT 
  id, email, password_hash, entra_id, name, role,
  created_at, updated_at, last_login_at, is_active,
  sso_provider, sso_id
FROM users;

-- Step 3: Drop old table
DROP TABLE users;

-- Step 4: Rename new table to users
ALTER TABLE users_new RENAME TO users;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_entra_id ON users(entra_id);

-- Note: The partial unique index idx_users_sso_provider_id is no longer needed
-- because we now have a proper UNIQUE constraint on (sso_provider, sso_id)
