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

The release pipeline executes under exactly two triggers:

```yaml
on:
  push:
    tags:
      - '*.*.*'
  workflow_dispatch:
    inputs:
      release_ref:
        description: 'Commit to deploy: the literal "main", or an exact 40-character commit SHA already on main'
        required: true
        default: 'main'
        type: string
      confirm_production:
        description: 'Type DEPLOY_PRODUCTION exactly to confirm a production deployment'
        required: true
        type: string
```

1. **Tag Push (`push: tags: ['*.*.*']`)**: The standard production release path (e.g. `git tag 1.3.0 && git push origin 1.3.0`). The glob is only a coarse prefilter; `prepare-release` additionally requires an exact `MAJOR.MINOR.PATCH` tag with no leading `v` and no suffix, and requires the tagged commit to be on `main`.
2. **Manual Dispatch (`workflow_dispatch`)**: Must be started from the `main` branch. `release_ref` accepts only the literal `main` or an exact 40-character commit SHA that is already on `main`; `confirm_production` must be typed exactly as `DEPLOY_PRODUCTION`.

Merging a pull request deploys nothing: `main` has no push trigger, and pull request events cannot start this workflow at all. The former label-driven path — a `pull_request_target` trigger plus a `run-release` label that built and deployed the **unmerged PR head commit** in jobs holding Cloudflare, Azure, Entra and Sentry credentials — has been removed (issue #140).

Only accounts with write access to this repository can push a tag or start a manual dispatch, and `production` deployments still wait for the environment's required reviewer.

### Release Trust Boundary

`prepare-release` is a credential-free job that decides which commit the release deploys:

- It checks out **only `main`** into `.release-policy` with `fetch-depth: 0`. The ref being released is never checked out as executable code in this job, so a tag or dispatch cannot supply the validator that judges it.
- It runs the trusted `.release-policy/.github/scripts/resolve-release-ref.mjs`. Every event value (`github.event_name`, `github.ref_type`, `github.ref_name`, `github.sha`, and both dispatch inputs) is passed through `env:` into shell-free Node code; git is invoked with fixed argv arrays, so no ref name or input is ever expanded by a shell.
- The resolver fetches `origin/main` with full history (deepening a shallow clone), dereferences annotated tags with `^{commit}`, cross-checks the resolved commit against the SHA GitHub reported for the event, verifies the object with `git cat-file -e`, and requires `git merge-base --is-ancestor` to place the commit on `origin/main`. A "not an ancestor" answer (exit 1) is reported separately from a git failure (exit >1) so infrastructure errors cannot be mistaken for policy decisions.
- The immutable commit SHA is the job's only output. `build`, `deploy-admin-api` and `deploy-redirect` check out exactly that SHA; `deploy-frontend` checks out no application code and deploys the artifact `build` produced from it. Every deployment summary reports that SHA instead of the raw event ref.
- Each deploy job checks out the validated commit first, then adds the trusted `.release-policy` clone from `main`, and re-runs the resolver in ancestry-recheck mode on the runner's preinstalled Node **before** `actions/setup-node`, before `npm ci` (which executes the released commit's lifecycle scripts) and before any step that reads a secret — so not even the npm cache is keyed on the selected tree until ancestry has been re-proved. This closes the drift window while a release waits for reviewer approval. `deploy-frontend` performs the same trusted checkout and recheck before it downloads the artifact or touches a credential, even though it deploys only the prebuilt artifact and checks out no application code.
- `concurrency: { group: release-production, cancel-in-progress: false }` serialises releases and never cancels a half-finished deployment.

`prepare-release` holds no environment, no secret and only `contents: read`. `build` also receives no deployment credential; production secrets stay in the three reviewer-protected `environment: production` jobs.

The invariants above are enforced by tests in `src/backend/src/__tests__/release-ref-security.test.ts`, which execute the resolver against throwaway git repositories (hostile tags, hostile dispatch inputs, annotated tags, non-mainline commits, git failures) and assert the workflow's structure.

### Production Environment Protection Policy

All three deploy jobs declare `environment: production`, so GitHub's environment protection is the platform-side half of the trust boundary. The intended configuration is:

| Setting | Intended value | Why |
|---------|----------------|-----|
| Required reviewers | The maintainer (`lettucebo`) | A human must confirm every production deployment. |
| Deployment branch/tag policy | Custom policies: branch `main` **and** tag `*.*.*` | A dispatch or tag from any other ref cannot obtain the environment, even if that ref rewrote the workflow. |
| Protected-branches mode | Not used | The repository has no branch protection rules, so that mode would allow nothing. |

**Verified current state (2026-09-03)**: the required reviewer (`lettucebo`) is configured, `prevent_self_review` is `false`, `can_admins_bypass` is `true`, and the deployment branch/tag policy in the table above **is applied** — `deployment_branch_policy` is `{ "protected_branches": false, "custom_branch_policies": true }` with exactly two policies, branch `main` and tag `*.*.*`. The ref restriction is therefore enforced both by the environment and by the checks inside the workflow.

The commands below are **reference material for re-verifying or re-applying** that configuration, not a pending action. The environment `PUT` replaces the configuration, so `reviewers` must be sent again or the required reviewer is removed:

```bash
# 1. Read-only inspection of the current state.
gh api repos/lettucebo/AkaMoney/environments/production

# 2. Enable custom deployment policies while preserving the required reviewer.
#    environment-policy.json:
#    {
#      "wait_timer": 0,
#      "prevent_self_review": false,
#      "reviewers": [{ "type": "User", "id": 891383 }],
#      "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
#    }
gh api --method PUT repos/lettucebo/AkaMoney/environments/production --input environment-policy.json

# 3. Allow exactly the release refs: the default branch and SemVer-shaped tags.
gh api --method POST repos/lettucebo/AkaMoney/environments/production/deployment-branch-policies \
  -f name='main' -f type='branch'
gh api --method POST repos/lettucebo/AkaMoney/environments/production/deployment-branch-policies \
  -f name='*.*.*' -f type='tag'

# 4. Verify.
gh api repos/lettucebo/AkaMoney/environments/production
gh api repos/lettucebo/AkaMoney/environments/production/deployment-branch-policies
```

`prevent_self_review` stays `false` on purpose: the maintainer is the only reviewer, so enabling it would block every release. That trade-off is recorded as a limitation below rather than hidden.

### Known Limitations of the Release Controls

These are real, documented gaps rather than solved problems:

- **Required reviewer is a confirmation, not independent authorization.** The `production` environment reviewer is the sole maintainer, self-review is permitted (`prevent_self_review: false`), and repository admins can bypass environment protection (`can_admins_bypass: true`).
- **Historical workflows.** A newly created SemVer tag that points at a historical commit runs *that commit's* workflow file, including versions from before this hardening. Neither the tag pattern nor the reviewer can inspect workflow age; the maintainer must reject such a run.
- **Same-repo write access is trusted.** Anyone with write access can push a tag or dispatch the workflow, and the repository currently has no branch protection or rulesets, so such an account can also change `main`. This fix removes *external/unmerged PR-head* code execution; it does not attempt to constrain trusted writers.
- **Repository-scoped secrets.** `CLOUDFLARE_API_TOKEN` and `AZURE_STORAGE_SAS_TOKEN` are still repository secrets, so they are readable by any workflow run in this repository, not only by `environment: production` jobs. Only `SENTRY_AUTH_TOKEN` is environment-scoped today. Migrating the remaining secrets requires the maintainer to supply or mint replacement values (GitHub secret values are write-only and cannot be read back for copying); it is deliberately **not** attempted automatically, because deleting the repository copies on name evidence alone would risk breaking production deployment.

### Pipeline Execution Order and Provisioning

The workflow contains five coordinated jobs:

1. **`prepare-release` Job** (no environment, no secrets):
   - Checks out `main` into `.release-policy` and validates the event as described above.
   - Publishes the immutable, mainline-verified commit SHA consumed by every later job.

2. **`build` Job**:
   - Checks out the validated commit SHA.
   - Installs dependencies across root, backend, frontend, and redirect.
   - Injects build-time frontend environment variables (`VITE_ENTRA_ID_CLIENT_ID`, `VITE_ENTRA_ID_TENANT_ID`, `VITE_ENTRA_ID_REDIRECT_URI`, `VITE_API_URL`, `VITE_APP_NAME`, `VITE_SHORT_DOMAIN`, `VITE_ARCHIVED_REDIRECT_URL`).
   - Builds frontend assets (`src/frontend/dist/`) and uploads `frontend-dist` artifact.
   - Runs dry-run deployment checks (`wrangler deploy --dry-run`) for backend and redirect workers.

3. **`deploy-admin-api` Job** (Target environment: `production`):
   - Checks out the validated commit, adds the trusted `.release-policy` clone, and rechecks mainline ancestry before installing dependencies or reading a secret.
   - Validates `SENTRY_BACKEND_DSN` and hardcodes `ENVIRONMENT = "production"` in `src/backend/wrangler.toml` before any Cloudflare call, verifying that exactly one production assignment exists.
   - Automatically checks if D1 database `akamoney-clicks` exists; creates it via `wrangler d1 create` if missing.
   - Dynamically retrieves the D1 UUID via `wrangler d1 list --json` and injects it into `src/backend/wrangler.toml`:
     ```bash
     sed -i 's/^[[:space:]]*database_id[[:space:]]*=[[:space:]]*""/database_id = "'"${CLOUDFLARE_D1_DATABASE_ID}"'"/' src/backend/wrangler.toml
     ```
   - Checks if R2 bucket `akamoney-storage` exists; creates it via `wrangler r2 bucket create` if missing.
   - Injects worker variables (`[vars]`) and worker secrets (`wrangler secret put`).
   - Deploys the worker via `cloudflare/wrangler-action@v3`.

4. **`deploy-redirect` Job** (Target environment: `production`):
   - Performs the same validated checkout and mainline recheck as `deploy-admin-api`.
   - Validates `SENTRY_REDIRECT_DSN` and hardcodes `ENVIRONMENT = "production"` in `src/redirect/wrangler.toml` before any Cloudflare call.
   - Retrieves the D1 database ID for `akamoney-clicks` and injects it into `src/redirect/wrangler.toml`.
   - Deploys the redirect worker via `cloudflare/wrangler-action@v3`.

5. **`deploy-frontend` Job** (Target environment: `production`):
   - Checks out only the trusted `.release-policy` clone and rechecks mainline ancestry before touching the artifact or any credential; it never checks out application code.
   - Downloads `frontend-dist` artifact.
   - Uploads and then deletes hidden source maps (see [Monitoring](MONITORING.md)).
   - Ensures Pages project `akamoney-admin` exists (creates it via `wrangler pages project create` if missing).
   - Deploys static build files via `wrangler pages deploy dist --project-name=akamoney-admin`.


---

## Environment Configuration: GitHub Secrets and Variables

Configure the following GitHub Secrets and Variables under **Settings > Secrets and variables > Actions**:

### Workflow Secrets

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with permissions for Workers, Pages, D1, and R2 (`Edit Cloudflare Workers`, `D1:Edit`, `R2:Edit`, `Pages:Edit`). Currently stored as a **repository** secret.
- `SENTRY_AUTH_TOKEN`: **Required production environment secret.** Used only by the protected frontend deploy job to inject and upload source maps. Keep it out of repository secrets and require a production environment reviewer.
- `ENTRA_ID_CLIENT_SECRET`: *(Optional)* The release workflow injects it only when present. The runtime backend does not read it or perform an SSO token exchange. It is currently **not configured at either scope**; if it is ever added, create it as a `production` environment secret.
- `AZURE_STORAGE_SAS_TOKEN`: *(Optional)* Azure Blob Storage SAS token (only required when `STORAGE_PROVIDER=azure`). Currently stored as a **repository** secret.

> **Secret scope, stated accurately**: only `SENTRY_AUTH_TOKEN` is scoped to the `production` environment today; `CLOUDFLARE_API_TOKEN` and `AZURE_STORAGE_SAS_TOKEN` are repository secrets. The workflow references every deployment secret exclusively from jobs that declare `environment: production`, but a repository secret remains readable by any workflow run in this repository. Moving the remaining secrets to environment scope needs replacement values from the maintainer, because GitHub secret values cannot be read back for copying.

### Required and Optional Variables

- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID.
- `CLOUDFLARE_D1_DATABASE_ID`: *(Optional)* Explicit D1 UUID override if not querying dynamically.
- `ENTRA_ID_TENANT_ID`: Microsoft Entra ID Tenant ID.
- `ENTRA_ID_CLIENT_ID`: Microsoft Entra ID Application (client) ID.
- `ENTRA_ID_REDIRECT_URI`: Frontend redirect URL (e.g., `https://admin.aka.money`).
- `VITE_API_URL`: Backend Admin API base URL (e.g., `https://api.aka.money`).
- `VITE_SENTRY_DSN`: Required public DSN for the frontend production build.
- `VITE_SENTRY_REPLAY_ENABLED`: Set to `true` to enable error-session Replay or `false` to disable it. The value is trimmed and compared case-insensitively.
- `SENTRY_BACKEND_DSN`: Required public DSN injected into the Admin API Worker.
- `SENTRY_REDIRECT_DSN`: Required public DSN injected into the redirect Worker.
- `SHORT_DOMAIN`: Short domain URL used for generated links (e.g., `https://aka.money` or `https://go.aka.money`).
- `STORAGE_PROVIDER`: `"r2"` (default) or `"azure"`.
- `AZURE_STORAGE_ACCOUNT` & `AZURE_STORAGE_CONTAINER`: *(Optional)* Azure Blob storage account and container names.
The Worker `ENVIRONMENT` value is **not** a repository variable. The tracked configs keep `"development"` so local runs are never mistaken for production, and both deploy jobs replace it with `ENVIRONMENT = "production"` before any Cloudflare mutation, failing closed unless exactly one production assignment results.

The release workflow validates the frontend DSN before the frontend build. Each Worker DSN is validated in its deploy job before any Cloudflare or configuration mutation. All three paths fail closed for missing or malformed values. Frontend source maps are uploaded from the protected `production` environment and deleted before Pages deployment; the Vite build only emits them when `GITHUB_ACTIONS` or `SENTRY_AUTH_TOKEN` is present, so manual local builds cannot publish a hidden map.

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

The commands below modify the tracked `wrangler.toml` configuration. Do not commit environment-specific edits; prefer the release workflow, which injects the production database ID. A manual deployment must also set `ENVIRONMENT = "production"` and a non-empty `SENTRY_DSN` itself: the tracked config ships `"development"` and an empty DSN, and only the release workflow replaces them.

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

A manual build emits no source maps unless `GITHUB_ACTIONS` or `SENTRY_AUTH_TOKEN` is set, so `dist/` is safe to publish as-is; the trade-off is that manually deployed frontend errors are not symbolicated in Sentry. To upload maps manually, run the build with a Sentry upload token and confirm no `.map` file remains in `dist/` before deploying.

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
