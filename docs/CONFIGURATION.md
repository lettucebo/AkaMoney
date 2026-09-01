English | [繁體中文](CONFIGURATION.zh-TW.md)

# AkaMoney Configuration Reference

This document is the canonical source of truth for environment variables, Worker bindings, observability settings, and secrets used by AkaMoney. For setup steps see [SETUP.md](SETUP.md). For monitoring operations see [MONITORING.md](MONITORING.md).

## Frontend Environment Variables

### Consumed by Source (`import.meta.env`)

| Variable | Required | Local Default | Description |
|----------|----------|---------------|-------------|
| `VITE_API_URL` | Yes | `http://localhost:8787` | Admin API base URL |
| `VITE_ENTRA_ID_CLIENT_ID` | Yes\* | — | Microsoft Entra ID app client ID |
| `VITE_ENTRA_ID_TENANT_ID` | Yes\* | `common` | Microsoft Entra ID tenant ID |
| `VITE_ENTRA_ID_REDIRECT_URI` | No | `window.location.origin` | OAuth redirect callback URI |
| `VITE_APP_NAME` | No | `AkaMoney` | Application display name shown in navigation |
| `VITE_SHORT_DOMAIN` | No | — | Redirect service base URL used to build short-link targets |
| `VITE_SKIP_AUTH` | Dev only | `false` | Set to `true` to bypass Entra ID and use an in-memory stub API |
| `VITE_SENTRY_DSN` | Production release: Yes; local: No | empty | Public Sentry DSN for the `akamoney-web` project; empty disables local frontend Sentry initialization, while the release workflow fails closed if it is missing |
| `VITE_SENTRY_ENVIRONMENT` | No | Vite mode | Sentry environment name reported by the frontend SDK |
| `VITE_SENTRY_REPLAY_ENABLED` | No | `false` in `.env.example` | Controls error-session Replay; source enables error-session Replay unless the trimmed, lower-cased value is `false`, while normal Replay sessions remain sampled at 0% |

\* Required for real Entra ID authentication; optional when `VITE_SKIP_AUTH=true`.

> **`VITE_SKIP_AUTH` is dev-only.** The flag is gated on `import.meta.env.DEV`; it has no effect in production builds even if the variable is set.

The tracked `src/frontend/.env.example` uses local service URLs and empty Sentry values. Do not commit concrete DSN values.

### Build-Process Variables (`process.env`, read by `vite.config.ts`)

These are read by the Vite config during the build and are not part of `import.meta.env`:

| Variable | Effect |
|----------|--------|
| `GITHUB_ACTIONS` | When present and non-blank, `build.sourcemap` is `'hidden'`; otherwise source maps are disabled so a manual build cannot publish them |
| `SENTRY_AUTH_TOKEN` | When present and non-blank, enables hidden source maps and activates the Sentry Vite plugin, which uploads the maps and then deletes them from `dist/` |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Override the default `money-5c` / `akamoney-web` upload target for that plugin |

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
| `BUCKET` | `R2Bucket` | No | R2 storage bucket; required when `STORAGE_PROVIDER=r2` for storage operations |
| `CF_VERSION_METADATA` | `WorkerVersionMetadata` | No | Cloudflare version metadata binding configured through `[version_metadata]` for release/version observability |

### Environment Variables (consumed via `c.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `ENTRA_ID_TENANT_ID` | Yes | Entra ID tenant ID for JWKS endpoint construction during token verification |
| `ENTRA_ID_CLIENT_ID` | Yes | Entra ID app client ID for token audience validation |
| `ENVIRONMENT` | Yes | Deployment environment reported to Sentry and used by runtime behavior. The tracked config ships `"development"`; the release workflow replaces it with `"production"` before deploying. |
| `SENTRY_DSN` | Production release: Yes; local: No | Public Sentry DSN for the Admin API Worker. Empty value disables local transport by passing `undefined` to the SDK. The release workflow requires and injects this from the `SENTRY_BACKEND_DSN` repository variable. |
| `STORAGE_PROVIDER` | No — default `r2` | Storage backend: `r2` (default) or `azure` |
| `R2_PUBLIC_URL` | No | Base URL for publicly accessible R2-served content |
| `AZURE_STORAGE_ACCOUNT` | If `azure` | Azure Blob Storage account name |
| `AZURE_STORAGE_CONTAINER` | If `azure` | Azure Blob Storage container name |
| `AZURE_STORAGE_SAS_TOKEN` | If `azure` | Azure SAS token; set as a secret, not a plain var |
| `AZURE_PUBLIC_URL` | No | Base URL for publicly accessible Azure-served content |
| `CDN_URL` | No | CDN base URL; overrides both `R2_PUBLIC_URL` and `AZURE_PUBLIC_URL` when set |

### Worker observability and source maps

| Setting | Admin API | Redirect | Description |
| --- | --- | --- | --- |
| `compatibility_flags = ["nodejs_compat"]` | Yes | Yes | Required by the Sentry Cloudflare SDK path currently used by the Workers. |
| `upload_source_maps = true` | Yes | Yes | Wrangler uploads Worker source maps during `wrangler deploy` / `wrangler versions deploy`. |
| `[version_metadata] binding = "CF_VERSION_METADATA"` | Yes | Yes | Exposes Worker version metadata to runtime code and telemetry systems. |
| `[observability] enabled = true` | Yes | Yes | Enables Cloudflare Workers Logs. |
| `[observability] head_sampling_rate = 1` | Yes | Yes | Keeps Cloudflare Workers Logs head sampling at 100%. |

Cloudflare source-map behavior is documented at https://developers.cloudflare.com/workers/observability/source-maps/. Workers Logs are documented at https://developers.cloudflare.com/workers/observability/logs/workers-logs/. Version metadata is documented at https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/.

### Secrets (set via `wrangler secret put` or protected CI secrets)

Secrets are encrypted at rest and are not visible in `wrangler.toml` or logs.

| Secret | Required | Description |
|--------|----------|-------------|
| `AZURE_STORAGE_SAS_TOKEN` | If `azure` storage | Azure Blob Storage SAS token |
| `ENTRA_ID_CLIENT_SECRET` | No | Entra ID client secret — injected by the release workflow; not consumed at runtime |
| `D1_ANALYTICS_API_TOKEN` | No | Cloudflare API token for D1 analytics — injected by the release workflow |
| `SENTRY_AUTH_TOKEN` | Frontend source-map upload only | GitHub production environment secret used by the protected deploy job for `sentry-cli sourcemaps inject/upload`; never put this in Wrangler config |

### Error-response policy

Backend and redirect 5xx responses are sanitized and must not include stack traces, raw exception details, tokens, or provider diagnostics. 4xx responses may keep safe validation details, such as invalid input messages, when they do not reveal secrets.

### Injected by Release Workflow — Not Consumed by Source

These values are written to `wrangler.toml` by the GitHub Actions release pipeline but have no corresponding `c.env` accessor in the backend runtime source code. They are absent from the `Env` interface in `src/backend/src/types/index.ts`:

| Variable | How Injected | Notes |
|----------|--------------|-------|
| `D1_ANALYTICS_ACCOUNT_ID` | Worker `[vars]` | Written by `deploy-admin-api` job; no runtime consumer |
| `D1_ANALYTICS_DATABASE_ID` | Worker `[vars]` | Written by `deploy-admin-api` job; no runtime consumer |

### Present in Types or Examples — Not Consumed at Runtime

These variables appear in the `Env` interface (`src/backend/src/types/index.ts`) or in examples but are not accessed via `c.env` in the production source code. The backend authenticates solely via Microsoft Entra JWKS; a local HMAC JWT secret is not used.

| Variable | Location | Notes |
|----------|----------|-------|
| `JWT_SECRET` | `Env` types | Declared; not accessed in runtime code |
| `JWT_EXPIRES_IN` | `Env` types + example (value: `"7d"`) | Declared; not accessed in runtime code |
| `SHORT_DOMAIN` | `Env` types + test mocks | Declared as optional; not read via `c.env` in any production route handler |
| `ENTRA_ID_CLIENT_SECRET` | `Env` types + release workflow secrets | Declared in types and injected by CI; not accessed in runtime source |

## Redirect Worker Configuration

| Variable / Binding | Required | Description |
| --- | --- | --- |
| `DB` | Yes | D1 binding used to resolve active short codes and record clicks |
| `ENVIRONMENT` | Yes | Deployment environment reported to Sentry. The tracked config ships `"development"`; the release workflow replaces it with `"production"` before deploying. |
| `SENTRY_DSN` | Production release: Yes; local: No | Public Sentry DSN for the redirect Worker. Empty value disables local transport by passing `undefined` to the SDK. The release workflow requires and injects this from the `SENTRY_REDIRECT_DSN` repository variable. |
| `CF_VERSION_METADATA` | No | Version metadata binding configured through `[version_metadata]` |

## Example Files Reference

| Service | Example File | Copy To | Notes |
|---------|-------------|---------|-------|
| Frontend | `src/frontend/.env.example` | `src/frontend/.env` | Uses empty Sentry DSN and local service URLs |
| Admin API | `src/backend/wrangler.local.toml.example` | `src/backend/wrangler.local.toml` | Uses `compatibility_flags = ["nodejs_compat"]`, source maps, `CF_VERSION_METADATA`, observability, and empty `SENTRY_DSN` |
| Admin API legacy env example | `src/backend/.env.example` | Do not copy | Legacy/reference-only keys; Worker bindings and runtime vars belong in `wrangler.local.toml` |
| Redirect | `src/redirect/wrangler.local.toml.example` | `src/redirect/wrangler.local.toml` | Uses `compatibility_flags = ["nodejs_compat"]`, source maps, `CF_VERSION_METADATA`, observability, and empty `SENTRY_DSN` |

The `wrangler.local.toml` files are listed in `.gitignore` to prevent credential leaks. The tracked `wrangler.toml` files contain `database_id = ""` (empty). Supply your actual database ID in the `.local.toml` copies for local development; the release workflow populates it automatically for CI/CD deployment.

---

📚 [Documentation](README.md) · [Setup](SETUP.md) · [API](API.md) · [Monitoring](MONITORING.md)
