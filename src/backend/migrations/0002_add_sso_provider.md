# Migration 0002: Add SSO Provider Support

This migration adds support for multiple SSO providers by introducing generic SSO fields.

## Changes

### New Columns
- `sso_provider` (TEXT, NULLABLE): Records the SSO provider name (e.g., 'entra', 'google', 'github')
- `sso_id` (TEXT, NULLABLE): Stores the unique user identifier from the SSO provider

### Modified Constraints
- **Removed UNIQUE constraint on `email`**: Allows the same email to be associated with multiple SSO providers (creating separate user records per provider)
- **Added CHECK constraint**: Ensures SSO fields are either both NULL (password-based users) or both non-NULL (SSO users)

### New Indexes
- `idx_users_sso_provider_id`: Composite unique index on (sso_provider, sso_id) to prevent duplicate users from the same provider
- Recreated `idx_users_email` as a non-unique index for efficient email lookups

## Design Rationale

Instead of adding a separate column for each SSO provider (e.g., `entra_id`, `google_id`, `github_id`), we use a generic approach with `sso_provider` and `sso_id`. This design:

1. **Scales Better**: Adding new SSO providers doesn't require schema changes
2. **Maintains Data Integrity**: The composite unique index ensures no duplicate SSO identities
3. **Provides Flexibility**: Easy to query users by SSO provider type
4. **Backward Compatible**: Keeps the existing `entra_id` column for compatibility
5. **Allows Multi-Provider**: Same email can have separate accounts for different SSO providers

## Important: Email Constraint Change

**Breaking Change**: This migration removes the UNIQUE constraint on the `email` column. This means:
- ✅ Users can log in with the same email using different SSO providers (e.g., both Entra ID and Google)
- ✅ Each SSO provider login creates a separate user record
- ⚠️ Applications relying on email uniqueness will need to be updated

If you need to maintain email uniqueness, you should:
1. Add application-level validation before the migration
2. Consider implementing account linking functionality
3. Add business logic to merge or prevent duplicate emails

## Migration Safety

This migration is mostly safe but has one breaking change:
- ✅ Adds new nullable columns (safe)
- ✅ Creates new index with WHERE clause (safe)
- ✅ Adds CHECK constraint for data integrity (safe)
- ⚠️ **Removes UNIQUE constraint on email** (breaking change if your application relies on it)
- ✅ No data modification or deletion

## Usage

After this migration, the `upsertUser` function in `src/services/user.ts` will:
1. Look up users by `(sso_provider, sso_id)` combination
2. Create new users on first login with SSO information using atomic INSERT ... ON CONFLICT
3. Update `last_login_at` and other relevant fields on subsequent logins

## Example Data

```sql
-- Entra ID user
INSERT INTO users (id, email, name, sso_provider, sso_id, created_at, updated_at, role, is_active)
VALUES ('user-1', 'alice@company.com', 'Alice Smith', 'entra', 'entra-uuid-123', 1234567890, 1234567890, 'user', 1);

-- Same email, different provider (Google)
INSERT INTO users (id, email, name, sso_provider, sso_id, created_at, updated_at, role, is_active)
VALUES ('user-2', 'alice@company.com', 'Alice Smith', 'google', 'google-uuid-456', 1234567890, 1234567890, 'user', 1);
```

Both records are allowed because the unique constraint is on `(sso_provider, sso_id)`, not on email.
