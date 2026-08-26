English | [繁體中文](CONFIGURATION.zh-TW.md)

# AkaMoney Configuration Reference

This document is the canonical source of truth for all environment variables, Worker bindings, and secrets used by AkaMoney. For setup steps see [SETUP.md](SETUP.md).

## Frontend Environment Variables

### Consumed by Source (`import.meta.env`)

| Variable | Required | Local Default | Description |
|----------|----------|---------------|-------------|
| `VITE_API_URL` | Yes | `http://localhost:8787` | Admin API base URL |
| `VITE_ENTRA_ID_CLIENT_ID` | Yes\* | — | Microsoft Entra ID app client ID |
| `VITE_ENTRA_ID_TENANT_ID` | Yes\* | `common` | Microsoft Entra ID tenant ID |
| `VITE_ENTRA_ID_REDIRECT_URI` | No | `window.location.origin` | OAuth redirect callback URI |
| `VITE_APP_NAME` | No | `AkaMoney` | Application display name shown in navigation |
| `VITE_SHORT_DOMAIN` | No | — | Redirect service base URL used to build short link targets |
| `VITE_SKIP_AUTH` | Dev only | `false` | Set to `true` to bypass Entra ID and use an in-memory stub API |

\* Required for real Entra ID authentication; optional when `VITE_SKIP_AUTH=true`.

> **`VITE_SKIP_AUTH` is dev-only.** The flag is gated on `import.meta.env.DEV`; it has no effect in production builds even if the variable is set.

The tracked `src/frontend/.env.example` uses `VITE_SHORT_DOMAIN=http://localhost:8788`, the local redirect service port.

### Injected by Release Workflow — Not Read by Source

These variables are set in the GitHub Actions release workflow build environment but have no corresponding `import.meta.env` accessor in the frontend source code and are absent from `src/frontend/src/vite-env.d.ts`:

| Variable | Workflow Source | Notes |
|----------|-----------------|-------|
| `VITE_ARCHIVED_REDIRECT_URL` | `vars.ARCHIVED_REDIRECT_URL` | Injected at build time; currently unused in frontend source |

## Backend Worker Configuration

### Bindings

Bindings are declared in `wrangler.toml` / `wrangler.local.toml` and accessed as properties of `c.env`.

| Binding | Type | Required | Description |
|---------|------|----------|-------------|
| `DB` | `D1Database` | Yes | Primary application database |
| `BUCKET` | `R2Bucket` | No | R2 storage bucket (required when `STORAGE_PROVIDER=r2`) |

### Environment Variables (consumed via `c.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `ENTRA_ID_TENANT_ID` | Yes | Entra ID tenant ID for JWKS endpoint construction during token verification |
| `ENTRA_ID_CLIENT_ID` | Yes | Entra ID app client ID for token audience validation |
| `ENVIRONMENT` | Yes | Deployment environment; `production` suppresses stack traces only in the auth-middleware 500 response. Other route and global error responses currently may still include `stack`; see [API error handling](API.md#current-error-envelope-notes). |
| `STORAGE_PROVIDER` | No — default `r2` | Storage backend: `r2` (default) or `azure` |
| `R2_PUBLIC_URL` | No | Base URL for publicly accessible R2-served content |
| `AZURE_STORAGE_ACCOUNT` | If `azure` | Azure Blob Storage account name |
| `AZURE_STORAGE_CONTAINER` | If `azure` | Azure Blob Storage container name |
| `AZURE_STORAGE_SAS_TOKEN` | If `azure` | Azure SAS token (set as a secret, not a plain var) |
| `AZURE_PUBLIC_URL` | No | Base URL for publicly accessible Azure-served content |
| `CDN_URL` | No | CDN base URL; overrides both `R2_PUBLIC_URL` and `AZURE_PUBLIC_URL` when set |

### Secrets (set via `wrangler secret put`)

Secrets are encrypted at rest and are not visible in `wrangler.toml` or logs.

| Secret | Required | Description |
|--------|----------|-------------|
| `AZURE_STORAGE_SAS_TOKEN` | If `azure` storage | Azure Blob Storage SAS token |
| `ENTRA_ID_CLIENT_SECRET` | No | Entra ID client secret — injected by the release workflow; not consumed at runtime |
| `D1_ANALYTICS_API_TOKEN` | No | Cloudflare API token for D1 analytics — injected by the release workflow |

### Injected by Release Workflow — Not Consumed by Source

These values are written to `wrangler.toml` by the GitHub Actions release pipeline but have no corresponding `c.env` accessor in the backend runtime source code. They are absent from the `Env` interface in `src/backend/src/types/index.ts`:

| Variable | How Injected | Notes |
|----------|--------------|-------|
| `D1_ANALYTICS_ACCOUNT_ID` | Worker `[vars]` | Written by `deploy-admin-api` job; no runtime consumer |
| `D1_ANALYTICS_DATABASE_ID` | Worker `[vars]` | Written by `deploy-admin-api` job; no runtime consumer |

### Present in Types or Examples — Not Consumed at Runtime

These variables appear in the `Env` interface (`src/backend/src/types/index.ts`) or in `wrangler.local.toml.example` but are **not** accessed via `c.env` in the production source code. The backend authenticates solely via Microsoft Entra JWKS; a local HMAC JWT secret is not used.

| Variable | Location | Notes |
|----------|----------|-------|
| `JWT_SECRET` | `Env` types | Declared; not accessed in runtime code |
| `JWT_EXPIRES_IN` | `Env` types + example (value: `"7d"`) | Declared; not accessed in runtime code |
| `SHORT_DOMAIN` | `Env` types + test mocks | Declared as optional; not read via `c.env` in any production route handler |
| `ENTRA_ID_CLIENT_SECRET` | `Env` types + release workflow secrets | Declared in types and injected by CI; not accessed in runtime source |

## Example Files Reference

| Service | Example File | Copy To | Notes |
|---------|-------------|---------|-------|
| Frontend | `src/frontend/.env.example` | `src/frontend/.env` | — |
| Admin API | `src/backend/wrangler.local.toml.example` | `src/backend/wrangler.local.toml` | Uses `compatibility_flags = ["nodejs_compat"]` |
| Admin API legacy env example | `src/backend/.env.example` | Do not copy | Legacy/reference-only keys; Worker bindings and runtime vars belong in `wrangler.local.toml` |
| Redirect | `src/redirect/wrangler.local.toml.example` | `src/redirect/wrangler.local.toml` | Uses the older `node_compat = true` syntax |

The `wrangler.local.toml` files are listed in `.gitignore` to prevent credential leaks. The tracked `wrangler.toml` files contain `database_id = ""` (empty). Supply your actual database ID in the `.local.toml` copies for local development; the release workflow populates it automatically for CI/CD deployment.

---

📚 [Documentation](README.md) · [Setup](SETUP.md) · [API](API.md)
