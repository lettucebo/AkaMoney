English | [繁體中文](IMPLEMENTATION_SSO_USER.zh-TW.md)

# SSO User Auto-Provisioning — Historical Implementation Record

> **Historical design record.** This document explains the design and reasoning behind SSO
> user auto-provisioning at the time it was built. It is *not* the canonical description of
> current runtime authentication — for that, always see [Authentication](AUTHENTICATION.md).
> The behaviour described here is verified against migrations `0002`/`0003`, the user service,
> and the auth middleware, but treat it as background context rather than an operations guide.

## Scope and Status

Before this work, SSO login only verified the incoming token and stored the decoded claims in
the request context; the `users` table stayed empty. This change made every successful SSO
login persist (create or update) a corresponding row in `users`. The notes below record how
and why it was built, and honestly describe the fallback behaviour when persistence fails.

## What Was Implemented

- A generic SSO identity model on the `users` table (`sso_provider`, `sso_id`).
- An idempotent `upsertUser()` in the user service that creates a user on first login and
  updates a small set of fields on subsequent logins.
- Integration of `upsertUser()` into both `authMiddleware` and `optionalAuthMiddleware`.
- Type updates so the persisted user id and role flow through the request context.

## Schema Changes: Migrations 0002 and 0003

Migration `0002` adds the generic SSO columns, recreates the non-unique email index while the
column-level `UNIQUE` constraint still remains, and adds a **partial** unique index on
`(sso_provider, sso_id)`:

```sql
ALTER TABLE users ADD COLUMN sso_provider TEXT;
ALTER TABLE users ADD COLUMN sso_id TEXT;

DROP INDEX IF EXISTS idx_users_email;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_sso_provider_id
  ON users(sso_provider, sso_id)
  WHERE sso_provider IS NOT NULL AND sso_id IS NOT NULL;
```

SQLite's `ON CONFLICT` does not target *partial* indexes, so migration `0003` recreates the
table, removes the column-level `email` uniqueness, adds a real
`UNIQUE(sso_provider, sso_id)` constraint, and adds a `CHECK` that keeps the two SSO fields
either both `NULL` or both set. It copies only rows that already satisfy the check, so
inconsistent rows abort the migration instead of corrupting data:

```sql
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
  UNIQUE(sso_provider, sso_id),
  CHECK (
    (sso_provider IS NULL AND sso_id IS NULL)
    OR
    (sso_provider IS NOT NULL AND sso_id IS NOT NULL)
  )
);
-- copy valid rows, drop old table, rename users_new -> users, recreate indexes
```

## Upsert Behaviour

`upsertUser()` (`src/backend/src/services/user.ts`) validates its inputs, then performs a
single atomic `INSERT ... ON CONFLICT (sso_provider, sso_id) DO UPDATE`. First login inserts a
new row with a `nanoid` id, the default role, and login timestamps; a returning login updates
`email`, `name`, `last_login_at`, and `updated_at` while preserving `role`, `sso_provider`,
`sso_id`, and `created_at`. Using a single atomic statement avoids read-then-write races:

```sql
INSERT INTO users (
  id, email, name, sso_provider, sso_id,
  created_at, updated_at, last_login_at, is_active, role
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
ON CONFLICT (sso_provider, sso_id) DO UPDATE SET
  email = excluded.email,
  name = excluded.name,
  last_login_at = excluded.last_login_at,
  updated_at = excluded.updated_at
RETURNING *;
```

## Auth Middleware Integration

In `src/backend/src/middleware/auth.ts`, both middlewares call `upsertUser()` after a token is
verified, passing `'entra'` as the provider and the token's object id as `sso_id`. On success
the request context is enriched with the database user id (`dbUserId`) and the stored `role`.

## Type Changes

`src/backend/src/types/index.ts` reflects the schema: the `User` interface carries
`sso_provider` and `sso_id`, and `JWTPayload` gains an optional `dbUserId` so downstream
handlers can read the persisted identity from the context.

## Design Rationale

- **Generic SSO fields instead of per-provider columns** keep the schema stable as new
  providers are added — no migration is needed to onboard another identity source.
- **Composite uniqueness on `(sso_provider, sso_id)`** prevents duplicate identities while
  allowing the same email under different providers.
- **The `CHECK` / not-null pairing** prevents half-populated SSO state, and the partial-index
  history in `0002` explains why `0003` had to rebuild the table for `ON CONFLICT`.

## Current Behaviour and Failure Fallback

Persistence is best-effort and deliberately non-fatal. If `upsertUser()` throws, the auth
middleware logs the error and falls back to the verified token payload **without** `dbUserId`
or the database `role`; `optionalAuthMiddleware` simply continues without setting a user on the
context. In other words, a database hiccup degrades enrichment but does not block a request
whose token is otherwise valid. Downstream code that needs `dbUserId` or `role` must therefore
tolerate their absence.

## Testing

The user service and its middleware integration are covered by Vitest suites under
`src/backend/src/services/__tests__/` (`user.test.ts`, `user.integration.test.ts`) and
`src/backend/src/middleware/__tests__/auth.test.ts`, exercising first-login creation,
returning-login updates, and the failure-fallback path. Run them with `npm run test:backend`.

## Related Documentation

- [README](../README.md)
- [Architecture](ARCHITECTURE.md)
- [Authentication](AUTHENTICATION.md)
