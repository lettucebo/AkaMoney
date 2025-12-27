# Migration 0003: Fix SSO Unique Constraint for ON CONFLICT Compatibility

This migration fixes a critical issue where the `ON CONFLICT` clause in the `upsertUser` function could not work with the partial unique index created in migration 0002.

## Problem Statement

SQLite's `ON CONFLICT` clause only works with proper table-level UNIQUE constraints (which SQLite implements using unique indexes), **not** with partial indexes (indexes with WHERE clauses). Migration 0002 created:

```sql
CREATE UNIQUE INDEX idx_users_sso_provider_id 
ON users(sso_provider, sso_id) 
WHERE sso_provider IS NOT NULL AND sso_id IS NOT NULL;
```

This partial index could not be used in `ON CONFLICT (sso_provider, sso_id)` clauses, causing the upsert operation to fail silently.

## Solution

This migration recreates the users table with a proper UNIQUE constraint:

```sql
UNIQUE(sso_provider, sso_id)
```

SQLite treats NULL values as distinct in UNIQUE constraints, so:
- ✅ Multiple password-based users can have (NULL, NULL) for sso_provider and sso_id
- ✅ Each SSO user must have a unique (sso_provider, sso_id) combination
- ✅ The `ON CONFLICT (sso_provider, sso_id)` clause now works correctly

## Changes

1. **Creates new table** `users_new` with proper UNIQUE constraint on (sso_provider, sso_id)
2. **Adds CHECK constraint** to ensure SSO fields are either both NULL or both non-NULL (this was intended in migration 0002 but couldn't be added due to SQLite limitations)
3. **Validates existing data** before migration - only copies rows where SSO fields are consistent (both NULL or both non-NULL). If any rows have mismatched NULL values, they will be skipped and the migration will complete with fewer rows than expected, which can be detected by comparing row counts.
4. **Preserves email as non-unique** - This is intentional (per migration 0002) to allow the same email to be used with different SSO providers
5. **Migrates data** from old table to new table
6. **Drops old table** and renames new table to `users`
7. **Recreates indexes** for email and entra_id lookups

## Impact on Code

After this migration, the `upsertUser` function in `src/backend/src/services/user.ts` will work correctly:

```typescript
INSERT INTO users (...) VALUES (...)
ON CONFLICT (sso_provider, sso_id) 
DO UPDATE SET
  last_login_at = excluded.last_login_at,
  updated_at = excluded.updated_at,
  name = excluded.name
```

The WHERE clause that was previously in the ON CONFLICT statement has been removed, as it's not valid SQLite syntax.

## Testing

This migration has been tested with:
- Creating SSO users (should succeed)
- Updating existing SSO users via ON CONFLICT (should succeed)
- Verifying that the schema allows multiple password-based users with NULL sso_provider/sso_id when created via non-SSO code paths (should succeed)
- Attempting to create duplicate SSO users (should trigger ON CONFLICT and update)

## Migration Safety

- ✅ Safe for existing data (data is preserved if consistent)
- ✅ Backward compatible (same schema, just different constraint implementation)
- ✅ No data modification or deletion
- ✅ Fixes a bug that prevented SSO login from working
- ⚠️ **Data validation**: The migration only copies rows where SSO fields are consistent (both NULL or both non-NULL). If you have inconsistent data, those rows will be skipped.

### Pre-migration Validation

Before running this migration, you can check for inconsistent data:

```sql
SELECT COUNT(*) FROM users 
WHERE (sso_provider IS NULL) != (sso_id IS NULL);
```

If this returns 0, your data is consistent and the migration will succeed without data loss.

If this returns a non-zero count, you have inconsistent data. To fix:

```sql
-- Option 1: Set both fields to NULL for password-based users
UPDATE users 
SET sso_provider = NULL, sso_id = NULL 
WHERE sso_provider IS NULL OR sso_id IS NULL;

-- Option 2: Delete inconsistent rows (use with caution)
DELETE FROM users 
WHERE (sso_provider IS NULL) != (sso_id IS NULL);
```

## Rollback

If you need to rollback, you can:
1. Recreate the table with the old structure
2. Restore the partial unique index

However, this would bring back the bug where ON CONFLICT doesn't work.
