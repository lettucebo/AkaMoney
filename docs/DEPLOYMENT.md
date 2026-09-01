English | [繁體中文](DEPLOYMENT.zh-TW.md)

# Deployment Guide

This document explains the production deployment architecture, GitHub Actions CI/CD release workflow (`.github/workflows/release.yml`), resource auto-provisioning, secrets configuration, database migrations, and manual fallback procedures for AkaMoney.

## Architecture and Release Overview

AkaMoney is deployed to the Cloudflare developer platform across three distinct services:

| Component | Target Platform | Production Project/Service Name | Routing/Domain |
|-----------|-----------------|---------------------------------|----------------|
| **Frontend UI** | Cloudflare Pages | `akamoney-admin` | `admin.aka.money` (or `*.pages.dev`) |
| **Admin API** | Cloudflare Workers | `akamoney-admin-api` | `api.aka.money` (or `*.workers.dev`) |
| **Redirect Service** | Cloudflare Workers | `akamoney-redirect` | `go.aka.money` (or `*.workers.dev`) |

---

## Automated CI/CD Release Pipeline (.github/workflows/release.yml)

Production releases are automated via GitHub Actions in `.github/workflows/release.yml`.

### Workflow Triggers

The release pipeline executes under three verified triggers:

```yaml
on:
  push:
    tags:
      - '*'
  pull_request_target:
    types: [labeled]
  workflow_dispatch:
```

1. **Tag Push (`push: tags: ['*']`)**: Recommended for standard production releases (e.g. `git tag 1.3.0 && git push origin 1.3.0`).
2. **Manual Dispatch (`workflow_dispatch`)**: Triggerable from the GitHub Actions tab by repository maintainers.
3. **PR Labeled Release (`pull_request_target`)**: Triggers when the label `run-release` is added to a pull request.

### Security Model (pull_request_target)

- **Execution Context**: Unlike `pull_request`, `pull_request_target` executes in the context of the base repository (`main`), granting access to repository secrets (e.g., `CLOUDFLARE_API_TOKEN`).
- **Access Control**: Applying the `run-release` label requires triage/write access to the repository, ensuring untrusted contributors cannot unilaterally trigger releases with secrets.
- **Pre-Production Caution**: The workflow checks out the PR head commit (`github.event.pull_request.head.sha`). Maintainers must review PR code before applying `run-release` to avoid deploying unverified code to production.

### Pipeline Execution Order and Provisioning

The workflow contains four coordinated jobs:

1. **`build` Job**:
   - Checks out the appropriate ref.
   - Installs dependencies across root, backend, frontend, and redirect.
   - Injects build-time frontend environment variables (`VITE_ENTRA_ID_CLIENT_ID`, `VITE_ENTRA_ID_TENANT_ID`, `VITE_ENTRA_ID_REDIRECT_URI`, `VITE_API_URL`, `VITE_APP_NAME`, `VITE_SHORT_DOMAIN`, `VITE_ARCHIVED_REDIRECT_URL`).
   - Builds frontend assets (`src/frontend/dist/`) and uploads `frontend-dist` artifact.
   - Runs dry-run deployment checks (`wrangler deploy --dry-run`) for backend and redirect workers.

2. **`deploy-admin-api` Job** (Target environment: `production`):
   - Automatically checks if D1 database `akamoney-clicks` exists; creates it via `wrangler d1 create` if missing.
   - Dynamically retrieves the D1 UUID via `wrangler d1 list --json` and injects it into `src/backend/wrangler.toml`:
     ```bash
     sed -i 's/^[[:space:]]*database_id[[:space:]]*=[[:space:]]*""/database_id = "'"${CLOUDFLARE_D1_DATABASE_ID}"'"/' src/backend/wrangler.toml
     ```
   - Checks if R2 bucket `akamoney-storage` exists; creates it via `wrangler r2 bucket create` if missing.
   - Injects worker variables (`[vars]`) and worker secrets (`wrangler secret put`).
   - Deploys the worker via `cloudflare/wrangler-action@v3`.

3. **`deploy-redirect` Job** (Target environment: `production`):
   - Retrieves the D1 database ID for `akamoney-clicks` and injects it into `src/redirect/wrangler.toml`.
   - Deploys the redirect worker via `cloudflare/wrangler-action@v3`.

4. **`deploy-frontend` Job** (Target environment: `production`):
   - Downloads `frontend-dist` artifact.
   - Ensures Pages project `akamoney-admin` exists (creates it via `wrangler pages project create` if missing).
   - Deploys static build files via `wrangler pages deploy dist --project-name=akamoney-admin`.

---

## Environment Configuration: GitHub Secrets and Variables

Configure the following GitHub Secrets and Variables under **Settings > Secrets and variables > Actions**:

### Workflow Secrets

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with permissions for Workers, Pages, D1, and R2 (`Edit Cloudflare Workers`, `D1:Edit`, `R2:Edit`, `Pages:Edit`).
- `SENTRY_AUTH_TOKEN`: **Required production environment secret.** Used only by the protected frontend deploy job to inject and upload source maps. Keep it out of repository secrets and require a production environment reviewer.
- `ENTRA_ID_CLIENT_SECRET`: *(Optional)* The release workflow injects it only when present. The runtime backend does not read it or perform an SSO token exchange.
- `AZURE_STORAGE_SAS_TOKEN`: *(Optional)* Azure Blob Storage SAS token (only required when `STORAGE_PROVIDER=azure`).

### Required and Optional Variables

- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID.
- `CLOUDFLARE_D1_DATABASE_ID`: *(Optional)* Explicit D1 UUID override if not querying dynamically.
- `ENTRA_ID_TENANT_ID`: Microsoft Entra ID Tenant ID.
- `ENTRA_ID_CLIENT_ID`: Microsoft Entra ID Application (client) ID.
- `ENTRA_ID_REDIRECT_URI`: Frontend redirect URL (e.g., `https://admin.aka.money`).
- `VITE_API_URL`: Backend Admin API base URL (e.g., `https://api.aka.money`).
- `VITE_SENTRY_DSN`: Required public DSN for the frontend production build.
- `VITE_SENTRY_REPLAY_ENABLED`: Set to `true` to enable error-session Replay or `false` to disable it.
- `SENTRY_BACKEND_DSN`: Required public DSN injected into the Admin API Worker.
- `SENTRY_REDIRECT_DSN`: Required public DSN injected into the redirect Worker.
- `SHORT_DOMAIN`: Short domain URL used for generated links (e.g., `https://aka.money` or `https://go.aka.money`).
- `STORAGE_PROVIDER`: `"r2"` (default) or `"azure"`.
- `AZURE_STORAGE_ACCOUNT` & `AZURE_STORAGE_CONTAINER`: *(Optional)* Azure Blob storage account and container names.
- `ENVIRONMENT`: Set to `"production"` for a production Worker. The tracked config defaults to `"development"`, and the current release workflow does not override it.

The release workflow validates the frontend DSN before the frontend build. Each Worker DSN is validated in its deploy job before any Cloudflare or configuration mutation. All three paths fail closed for missing or malformed values. Frontend source maps are uploaded from the protected `production` environment and deleted before Pages deployment.

### Dead Scaffolding Variables Notice

The release workflow contains variable injection steps for legacy/experimental scaffolding:
- `D1_ANALYTICS_ACCOUNT_ID`, `D1_ANALYTICS_DATABASE_ID`, `D1_ANALYTICS_API_TOKEN`
- `VITE_ARCHIVED_REDIRECT_URL` / `ARCHIVED_REDIRECT_URL`

> **Maintainer Notice**: These variables are **not referenced** by application logic in `src/frontend`, `src/backend`, or `src/redirect`. Do not assume analytics API integration or archived URL redirection features exist based on their presence in workflow configuration.

---

## Scheduled Tasks: Automatic Click Cleanup Cron

The Admin API Worker (`src/backend`) includes scheduled cron execution configured in `src/backend/wrangler.toml`:

```toml
[triggers]
crons = ["0 2 * * *"]  # Daily at 02:00 UTC (10:00 Taiwan time)
```

- **Execution Logic**: `src/backend/src/index.ts` exports a `scheduled` handler that invokes `cleanupOldClickRecords(env.DB, 365)`.
- **Retention**: Deletes click records older than 365 days from the `click_records` table to prevent unbounded database growth.

---

## Database Migrations in Deployment

Database migrations are located in `src/backend/migrations/`. When deploying schema updates to production:

```bash
cd src/backend
npx wrangler d1 migrations apply DB --remote --config wrangler.toml
```

*(Note: Verify the D1 database name `akamoney-clicks` matches your production D1 instance name).*

---

## Manual Deployment Alternative

If you need to deploy services manually using Wrangler CLI:

### 1. Manual Admin API Deployment

The commands below modify the tracked `wrangler.toml` configuration. Do not commit environment-specific edits; prefer the release workflow, which injects the production database ID.

```bash
cd src/backend

# First populate the empty database_id and production vars in wrangler.toml.
# Apply remote database migrations through the configured binding.
npx wrangler d1 migrations apply DB --remote --config wrangler.toml

# Set Azure storage credentials only when STORAGE_PROVIDER=azure
npx wrangler secret put AZURE_STORAGE_SAS_TOKEN

# Deploy Worker
npx wrangler deploy
```

### 2. Manual Redirect Service Deployment

```bash
cd src/redirect

# Deploy Redirect Worker
npx wrangler deploy
```

### 3. Manual Frontend Deployment

```bash
cd src/frontend

# Build production assets with environment variables
VITE_API_URL="https://api.aka.money" \
VITE_SHORT_DOMAIN="https://go.aka.money" \
VITE_ENTRA_ID_CLIENT_ID="<your-client-id>" \
VITE_ENTRA_ID_TENANT_ID="<your-tenant-id>" \
VITE_ENTRA_ID_REDIRECT_URI="https://admin.aka.money" \
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name=akamoney-admin
```

---

## Verification, Observability, and Rollback

### Post-Deployment Smoke Checks

Verify each endpoint using `curl`:

```bash
# 1. Verify Admin API Health
curl -s https://api.aka.money/health

# 2. Verify Redirect Service Health
curl -s https://go.aka.money/health

# 3. Test URL Redirection (Expect HTTP 302)
curl -I https://go.aka.money/demo1
```

### Live Tail Logging

Stream real-time production Worker logs using `wrangler tail`:

```bash
# Stream Admin API logs
npx wrangler tail akamoney-admin-api

# Stream Redirect Service logs
npx wrangler tail akamoney-redirect
```

### Rollback Strategy

In case of a faulty release:

```bash
# Rollback Cloudflare Pages (Frontend)
npx wrangler pages deployment list --project-name=akamoney-admin
npx wrangler pages deployment rollback <DEPLOYMENT_ID> --project-name=akamoney-admin

# Rollback Cloudflare Workers (Backend / Redirect)
npx wrangler deployments list --name akamoney-admin-api
npx wrangler rollback <DEPLOYMENT_ID> --name akamoney-admin-api
```

Alternatively, rollbacks can be executed directly from the Cloudflare Dashboard under **Workers & Pages > Deployments**.

---

## Related Documents

- [Development Guide](DEVELOPMENT.md)
- [Testing Guide](TESTING.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [Database Documentation](DATABASE.md)
- [API Documentation](API.md)
- [Project README](../README.md)
