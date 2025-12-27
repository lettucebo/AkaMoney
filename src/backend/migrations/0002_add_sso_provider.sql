-- Migration: Add SSO provider fields for multi-provider support
-- This migration adds generic SSO fields to support multiple SSO providers
-- (Entra ID, Google, GitHub, etc.) without needing per-provider columns

-- Add sso_provider column to store the SSO provider type
ALTER TABLE users ADD COLUMN sso_provider TEXT;

-- Add sso_id column to store the unique user ID from the SSO provider
ALTER TABLE users ADD COLUMN sso_id TEXT;

-- Remove UNIQUE constraint from email to allow same email across different SSO providers
-- This enables users to have separate accounts for different SSO providers with the same email
DROP INDEX IF EXISTS idx_users_email;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create a unique composite index to ensure (sso_provider, sso_id) combination is unique
-- This prevents duplicate users from the same SSO provider
-- Note: This will be replaced in migration 0003 with a proper UNIQUE constraint
-- to enable ON CONFLICT clause compatibility
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_sso_provider_id ON users(sso_provider, sso_id) WHERE sso_provider IS NOT NULL AND sso_id IS NOT NULL;

-- Note: The CHECK constraint '(sso_provider IS NULL AND sso_id IS NULL) OR (sso_provider IS NOT NULL AND sso_id IS NOT NULL)'
-- will be added in migration 0003. SQLite doesn't support ALTER TABLE ADD CONSTRAINT CHECK,
-- so we need to recreate the table. This constraint ensures SSO fields are either both NULL or both non-NULL.

-- Note: The existing entra_id column is kept for backward compatibility
-- New SSO logins will use sso_provider='entra' and sso_id fields
