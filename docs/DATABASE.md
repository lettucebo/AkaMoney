English | [繁體中文](DATABASE.zh-TW.md)

# AkaMoney Database Reference

## Overview

AkaMoney uses a single Cloudflare D1 database that is shared by both Workers:

- the Admin API Worker manages links, users, analytics queries, storage metadata lookups, and retention cleanup
- the Redirect Worker resolves active short codes and also writes click telemetry

All persisted timestamps are stored as epoch milliseconds.

## Binding Topology

### Shared `DB` Binding

Both Worker codebases expect a D1 binding named `DB`:

- `src/backend/wrangler.toml`
- `src/redirect/wrangler.toml`

This shared binding is the reason link state, click tracking, public redirect, and management analytics stay consistent.

### Ownership Boundaries

The schema itself is shared, but ownership rules live in application code:

- `urls.user_id` scopes management access
- `click_records.url_id` and `click_records.short_code` tie telemetry to a URL
- `users` stores Entra-backed identity metadata for Admin API access

## Schema Evolution

### Migration `0001_initial_schema.sql`

Initial schema creation:

- creates `urls`
- creates `click_records`
- creates `users`
- creates indexes for common lookup paths

Important index set from this migration:

- `idx_urls_short_code`
- `idx_urls_user_id`
- `idx_urls_created_at`
- `idx_clicks_url_id`
- `idx_clicks_short_code`
- `idx_clicks_clicked_at`
- `idx_users_email`
- `idx_users_entra_id`

### Migration `0002_add_sso_provider.sql`

SSO expansion:

- adds `sso_provider`
- adds `sso_id`
- drops and recreates the non-unique `idx_users_email`; the column-level `UNIQUE` constraint still remains at this stage
- adds a partial unique index for `(sso_provider, sso_id)`
- keeps `entra_id` for backward compatibility

Companion note: [0002_add_sso_provider.md](../src/backend/migrations/0002_add_sso_provider.md)

### Migration `0003_fix_sso_unique_constraint.sql`

Users-table rebuild for SQLite / D1 upsert compatibility:

- recreates `users` with a table-level `UNIQUE(sso_provider, sso_id)`
- removes the old column-level `email` uniqueness during the table rebuild
- adds a `CHECK` constraint requiring both SSO columns to be null together or non-null together
- migrates consistent rows into the rebuilt table
- recreates `idx_users_email` and `idx_users_entra_id`

Companion note: [0003_fix_sso_unique_constraint.md](../src/backend/migrations/0003_fix_sso_unique_constraint.md)

### Migration `0004_add_image_url.sql`

URL-preview support:

- adds `image_url` to `urls`

This migration has no companion markdown note in the repository today.

## Current Tables

### `urls`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TEXT` | Primary key |
| `short_code` | `TEXT` | Uniqueness is case-sensitive at the schema level, but creation and redirect lookup add case-insensitive checks in code |
| `original_url` | `TEXT` | Required destination URL |
| `user_id` | `TEXT` | Nullable owner reference; anonymous shortened URLs leave it null |
| `title` | `TEXT` | Nullable |
| `description` | `TEXT` | Nullable |
| `image_url` | `TEXT` | Added in migration 0004 |
| `created_at` | `INTEGER` | Epoch milliseconds |
| `updated_at` | `INTEGER` | Epoch milliseconds |
| `expires_at` | `INTEGER` | Nullable epoch milliseconds |
| `is_active` | `INTEGER` | `1` or `0` |
| `click_count` | `INTEGER` | Denormalized counter incremented by the Redirect Worker |

### `click_records`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TEXT` | Primary key |
| `url_id` | `TEXT` | Foreign key to `urls(id)` with `ON DELETE CASCADE` |
| `short_code` | `TEXT` | Stored copy for analytics queries |
| `clicked_at` | `INTEGER` | Epoch milliseconds |
| `ip_address` | `TEXT` | Nullable |
| `user_agent` | `TEXT` | Nullable |
| `referer` | `TEXT` | Nullable |
| `country` | `TEXT` | Nullable |
| `city` | `TEXT` | Nullable |
| `device_type` | `TEXT` | Nullable |
| `browser` | `TEXT` | Nullable |
| `os` | `TEXT` | Nullable |

### `users`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TEXT` | Primary key |
| `email` | `TEXT` | Indexed, no longer unique |
| `password_hash` | `TEXT` | Present but unused by the production auth flow |
| `entra_id` | `TEXT` | Legacy unique column retained for compatibility |
| `name` | `TEXT` | Nullable |
| `role` | `TEXT` | Defaults to `"user"` |
| `created_at` | `INTEGER` | Epoch milliseconds |
| `updated_at` | `INTEGER` | Epoch milliseconds |
| `last_login_at` | `INTEGER` | Nullable epoch milliseconds |
| `is_active` | `INTEGER` | `1` or `0` |
| `sso_provider` | `TEXT` | Nullable; part of table-level unique constraint with `sso_id` |
| `sso_id` | `TEXT` | Nullable; part of table-level unique constraint with `sso_provider` |

## Shared-Worker Behavior

### Admin API Worker

The Admin Worker performs:

- all link CRUD writes
- Entra user upserts
- analytics and stats reads
- daily and manual retention cleanup

### Redirect Worker

The Redirect Worker performs:

- case-insensitive reads against active short codes
- inserts into `click_records`
- `click_count` increments on `urls`

That means the redirect path is not read-only at the database level even though some configuration comments describe it that way.

## Retention and Cleanup

- click-record retention defaults to `365` days
- the Admin Worker cron runs daily at `02:00 UTC`
- the same cleanup logic is exposed through `POST /api/admin/cleanup`

Cleanup deletes `click_records` rows where `clicked_at` is older than the computed cutoff timestamp.

## Safe Local and Remote Workflows

Run D1 commands from `src/backend`, using the binding name `DB` instead of the outdated npm script target.

```bash
cd src/backend
npx wrangler d1 migrations apply DB --local --config wrangler.local.toml
npx wrangler d1 execute DB --local --config wrangler.local.toml --command "SELECT COUNT(*) AS url_count FROM urls"
```

```bash
cd src/backend
npx wrangler d1 migrations apply DB --remote --config wrangler.toml
npx wrangler d1 execute DB --remote --config wrangler.toml --command "SELECT COUNT(*) AS url_count FROM urls"
```

The tracked `wrangler.toml` has an empty `database_id`; populate it before a manual remote command. The release workflow injects the production ID automatically.

### Why the Repository `db:*` Scripts Are Not Recommended

`src/backend/package.json` still points its `db:*` scripts at `akamoney`, while the bound database name in Worker configuration is `akamoney-clicks`. Until those values are aligned, prefer the explicit `DB`-binding workflow above.

## Local vs Remote Caution

### `--local`

- uses the local D1 state tied to `wrangler.local.toml`
- is the right place to validate migrations and ad-hoc queries safely
- does not prove that production data is clean or that production credentials are correct

### `--remote`

- targets the real Cloudflare D1 database behind the deployed Worker binding
- should be treated as production-impacting
- should be preceded by a backup / export workflow before destructive manual operations or schema changes

## Related Documents

- [README](../README.md)
- [Architecture](ARCHITECTURE.md)
- [Authentication](AUTHENTICATION.md)
- [Storage](STORAGE.md)
- [Setup](SETUP.md)
