English | [繁體中文](TROUBLESHOOTING.zh-TW.md)

# Troubleshooting Guide

This guide provides diagnostic procedures and actionable remedies for common errors encountered during local development, database operations, authentication, deployment, and UI rendering in AkaMoney.

## Overview

AkaMoney consists of three distinct subsystems (Frontend, Admin API, and Redirect Service). When debugging, identify which subsystem is reporting the error by checking the port, logs, or HTTP status codes.

---

## Local Development and Environment Issues

### 1. Missing Dependencies in Subprojects

- **Symptom**: `Cannot find module '@azure/msal-browser'`, `hono not found`, or TypeScript compiler errors after running `npm install`.
- **Cause**: AkaMoney maintains independent `package.json` files in `src/frontend`, `src/backend`, and `src/redirect`. Running `npm install` only in the repository root does not install subproject dependencies.
- **Remedy**: Run the root setup command or install dependencies individually:
  ```bash
  # Install dependencies across root and all subprojects
  npm run setup
  ```

### 2. Service Port Collisions (8787 vs 8788)

- **Symptom**: `Error: Port 8787 is already in use` or `EADDRINUSE` when starting the redirect worker or backend API.
- **Cause**: Both Cloudflare Workers default to port `8787` if not configured explicitly.
- **Remedy**: Start the redirect service explicitly on port `8788`:
  ```bash
  cd src/redirect
  npx wrangler dev --config wrangler.local.toml --port 8788
  ```

### 3. Windows PowerShell Root dev Script Concurrency

- **Symptom**: Running `npm run dev` in Windows PowerShell fails with syntax errors around `&`, or only starts the frontend while the backend never starts.
- **Cause**: The root script `"dev": "npm run dev:frontend & npm run dev:backend"` uses POSIX shell backgrounding syntax (`&`), which is not supported in Windows PowerShell.
- **Remedy**: Open three separate terminal windows or tabs:
  ```powershell
  # Terminal 1: Frontend (5173)
  cd src\frontend; npm run dev

  # Terminal 2: Admin API (8787)
  cd src\backend; npx wrangler dev --config wrangler.local.toml --port 8787

  # Terminal 3: Redirect Service (8788)
  cd src\redirect; npx wrangler dev --config wrangler.local.toml --port 8788
  ```

### 4. Stale Backend node_compat in Local Wrangler Configs

- **Symptom**: Wrangler v4 displays deprecation warnings or errors: `ExperimentalNodeCompatError: node_compat is deprecated`.
- **Cause**: Older versions of `wrangler.local.toml.example` contained `node_compat = true`. The backend uses Wrangler v4 (`^4.59.1`), which requires `compatibility_flags`.
- **Remedy**: Update your local `src/backend/wrangler.local.toml` to replace `node_compat` with:
  ```toml
  # In src/backend/wrangler.local.toml
  compatibility_date = "2024-12-17"
  compatibility_flags = ["nodejs_compat"]
  ```

---

## Database and Migration Pitfalls

### 5. Empty D1 Database ID Errors

- **Symptom**: API returns `500 Configuration Error: Database is not configured` with details `DB binding is missing`.
- **Cause**: `wrangler.local.toml` contains `database_id = ""` or is missing the `[[d1_databases]]` binding.
- **Remedy**: Add a dummy or actual D1 UUID in your local configuration:
  ```toml
  [[d1_databases]]
  binding = "DB"
  database_name = "akamoney-clicks"
  database_id = "local-dev-db-id"
  ```

### 6. Database Name Trap: akamoney vs akamoney-clicks

- **Symptom**: Migration runs without error, but API queries fail with `no such table: urls` or `no such table: click_records`.
- **Cause**: Scripts in `src/backend/package.json` default to `wrangler d1 migrations apply akamoney`, whereas `wrangler.toml` and CI configure `database_name = "akamoney-clicks"`. If the database name passed to the CLI differs from the worker binding, migrations apply to a different database instance.
- **Remedy**: Use the `DB` binding from the local Wrangler configuration instead of a package script or a second database name:
  ```bash
  cd src/backend
  npx wrangler d1 migrations apply DB --local --config wrangler.local.toml
  ```

### 7. Local vs Remote D1 Database Isolation

- **Symptom**: Everything works in local development, but production deployment fails with `D1_ERROR: no such table: urls`.
- **Cause**: Local Miniflare D1 state (`.wrangler/state/v3/d1`) is completely isolated from Cloudflare Cloud D1. Local migrations do not alter production.
- **Remedy**: Apply migrations to remote Cloudflare D1 before or during deployment:
  ```bash
  cd src/backend
  npx wrangler d1 migrations apply DB --remote --config wrangler.toml
  ```
  The tracked `wrangler.toml` has an empty `database_id`; populate it first, or use the release workflow, which injects the production ID.

---

## Routing, Domain, and Auth Issues

### 8. VITE_SHORT_DOMAIN Pointing to Wrong Port

- **Symptom**: Clicking shortened URLs generated in the frontend during local testing leads to `http://localhost:8787/xyz` (404 Not Found) instead of redirecting.
- **Cause**: `src/frontend/.env` (or a higher-precedence `.env.local`) sets `VITE_SHORT_DOMAIN=http://localhost:8787` (Admin API) rather than port `8788` (Redirect Service).
- **Remedy**: Update `src/frontend/.env`; if `.env.local` exists, update or remove its override:
  ```ini
  # In src/frontend/.env
  VITE_API_URL=http://localhost:8787
  VITE_SHORT_DOMAIN=http://localhost:8788
  ```

### 9. Auth 401 Unauthorized vs Entra ID 500 Internal Server Error

- **Symptom & Distinction**:
  - **401 Unauthorized**: JWT token is missing, expired, or invalid in the `Authorization: Bearer <token>` header.
  - **500 Internal Server Error (during SSO)**: Backend authentication is not configured because `ENTRA_ID_TENANT_ID` or `ENTRA_ID_CLIENT_ID` is missing.
- **Remedy**: Check backend logs using `wrangler tail` or console output. For local UI testing without Entra ID, set `VITE_SKIP_AUTH=true` in `src/frontend/.env` (or `.env.local`, which takes precedence):
  ```bash
  # Check live worker logs
  npx wrangler tail akamoney-admin-api
  ```

### 10. CORS (Cross-Origin Resource Sharing) Errors

- **Symptom**: Browser console logs: `Access to fetch at 'http://localhost:8787/api/...' has been blocked by CORS policy`.
- **Cause**: The API client uses `VITE_API_URL` (default `http://localhost:8787`), so browser requests go directly to the Admin API and rely on its CORS middleware. The backend may be stopped, the URL may be wrong, or the preflight response may be missing CORS headers.
- **Remedy**: Confirm the Admin API is running on `8787`, keep the frontend value aligned, and inspect the backend response/logs. The committed API client does not use a relative proxy URL by default:
  ```env
  VITE_API_URL=http://localhost:8787
  ```

---

## Storage, Media, and UI Issues

### 11. Storage Upload Failures and Broken Public URLs

- **Symptom**: Image upload fails with `500 Storage is not configured` or uploaded preview images show broken icons.
- **Cause**: `STORAGE_PROVIDER` is missing from `[vars]`, or `R2_PUBLIC_URL` / `BUCKET` binding is not set in `wrangler.local.toml`.
- **Remedy**: Ensure `wrangler.local.toml` defines the R2 bucket binding and valid public URL:
  ```toml
  [[r2_buckets]]
  binding = "BUCKET"
  bucket_name = "akamoney-storage"
  preview_bucket_name = "akamoney-storage-preview"

  [vars]
  STORAGE_PROVIDER = "r2"
  R2_PUBLIC_URL = "https://storage.aka.money"
  ```

### 12. Chart.js Styling and Dark Mode Theme Glitches

- **Symptom**: Analytics charts display dark text against dark backgrounds when toggling dark mode.
- **Cause**: Chart.js canvas elements do not inherit updated CSS token values merely because the `data-theme` attribute changes.
- **Remedy**: AkaMoney provides the `useChartTheme` composable (`src/frontend/src/composables/useChartTheme.ts`), which returns a computed theme. `BaseChart.vue` observes the value and applies it to Chart.js:
  ```typescript
  import { useChartTheme } from '@/composables/useChartTheme';
  const chartTheme = useChartTheme();
  // chartTheme.value.text and chartTheme.value.grid
  ```

---

## Related Documents

- [Development Guide](DEVELOPMENT.md)
- [Testing Guide](TESTING.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Database Documentation](DATABASE.md)
- [Theme Documentation](THEME.md)
- [API Documentation](API.md)
- [Project README](../README.md)
