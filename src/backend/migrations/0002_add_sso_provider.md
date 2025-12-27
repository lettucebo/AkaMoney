# Migration 0002: Add SSO Provider Support

This migration adds support for multiple SSO providers by introducing generic SSO fields.

## Changes

### New Columns
- `sso_provider` (TEXT, NULLABLE): Records the SSO provider name (e.g., 'entra', 'google', 'github')
- `sso_id` (TEXT, NULLABLE): Stores the unique user identifier from the SSO provider

### New Indexes
- `idx_users_sso_provider_id`: Composite unique index on (sso_provider, sso_id) to prevent duplicate users from the same provider

## Design Rationale

Instead of adding a separate column for each SSO provider (e.g., `entra_id`, `google_id`, `github_id`), we use a generic approach with `sso_provider` and `sso_id`. This design:

1. **Scales Better**: Adding new SSO providers doesn't require schema changes
2. **Maintains Data Integrity**: The composite unique index ensures no duplicate SSO identities
3. **Provides Flexibility**: Easy to query users by SSO provider type
4. **Backward Compatible**: Keeps the existing `entra_id` column for compatibility

## Migration Safety

This migration is safe to run on production databases because:
- It only adds new nullable columns
- It creates a new index (which is a metadata-only operation in SQLite)
- It doesn't modify or delete existing data
- The WHERE clause in the index creation prevents NULL entries from being indexed

## Usage

After this migration, the `upsertUser` function in `src/services/user.ts` will:
1. Look up users by `(sso_provider, sso_id)` combination
2. Create new users on first login with SSO information
3. Update `last_login_at` and other relevant fields on subsequent logins

## Example Data

```sql
-- Entra ID user
INSERT INTO users (id, email, name, sso_provider, sso_id, created_at, updated_at, role, is_active)
VALUES ('user-1', 'alice@company.com', 'Alice Smith', 'entra', 'entra-uuid-123', 1234567890, 1234567890, 'user', 1);

-- Google user
INSERT INTO users (id, email, name, sso_provider, sso_id, created_at, updated_at, role, is_active)
VALUES ('user-2', 'bob@gmail.com', 'Bob Johnson', 'google', 'google-uuid-456', 1234567890, 1234567890, 'user', 1);
```
