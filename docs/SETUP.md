English | [繁體中文](SETUP.zh-TW.md)

# AkaMoney Setup Guide

## Prerequisites

- **Node.js >= 24** and **npm** — see `.node-version` for the exact version
- **Wrangler CLI** — required for local backend development (`npm install -g wrangler`)
- **Cloudflare account** — free tier is sufficient for development

## Quick Start — UI-Only Mode

The fastest path: the frontend runs against an **in-memory stub API** with no backend infrastructure required. Useful for UI testing and demos.

```bash
git clone https://github.com/lettucebo/AkaMoney.git
cd AkaMoney
npm run setup
cp src/frontend/.env.example src/frontend/.env
```

Open `src/frontend/.env` and set:

```env
VITE_SKIP_AUTH=true
VITE_API_URL=http://localhost:8787
VITE_SHORT_DOMAIN=http://localhost:8788
```

Start the frontend:

```bash
cd src/frontend && npm run dev
```

Open <http://localhost:5173>. With `VITE_SKIP_AUTH=true` all backend calls are replaced by in-memory mock data and Entra ID authentication is bypassed. **No real data is stored or retrieved. Do not use for production.**

For the full environment variable reference, see [CONFIGURATION.md](CONFIGURATION.md).

## Full Stack Local Development

### 1. Clone and Install

```bash
git clone https://github.com/lettucebo/AkaMoney.git
cd AkaMoney
npm run setup
```

### 2. Authenticate with Cloudflare

```bash
wrangler login
```

### 3. Create the D1 Database

```bash
wrangler d1 create akamoney-clicks
```

Copy the `database_id` UUID from the output — you will need it in the next two steps.

### 4. Configure the Admin API

```bash
cp src/backend/wrangler.local.toml.example src/backend/wrangler.local.toml
```

Edit `src/backend/wrangler.local.toml` and set your `database_id`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "akamoney-clicks"
database_id = "<paste-your-database-id-here>"
```

> The backend and redirect examples both use `compatibility_flags = ["nodejs_compat"]`; do not reintroduce the older `node_compat = true` key into local Wrangler config.

### 5. Configure the Redirect Service

```bash
cp src/redirect/wrangler.local.toml.example src/redirect/wrangler.local.toml
```

Edit `src/redirect/wrangler.local.toml` and set the same `database_id`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "akamoney-clicks"
database_id = "<paste-your-database-id-here>"
```

### 6. Apply Database Migrations

```bash
cd src/backend
npx wrangler d1 migrations apply DB --local --config wrangler.local.toml
```

### 7. Configure the Frontend

```bash
cp src/frontend/.env.example src/frontend/.env
```

Edit `src/frontend/.env`:

```env
VITE_API_URL=http://localhost:8787
VITE_SHORT_DOMAIN=http://localhost:8788
VITE_ENTRA_ID_CLIENT_ID=<your-client-id>
VITE_ENTRA_ID_TENANT_ID=<your-tenant-id>
VITE_ENTRA_ID_REDIRECT_URI=http://localhost:5173
VITE_APP_NAME=AkaMoney
```

The tracked `.env.example` already uses `VITE_SHORT_DOMAIN=http://localhost:8788`, the redirect service port.

See [CONFIGURATION.md](CONFIGURATION.md) for the full variable reference.

### 8. Start All Services

Open three separate terminals:

**Terminal 1 — Admin API (port 8787)**

```bash
cd src/backend
npx wrangler dev --config wrangler.local.toml --port 8787
```

**Terminal 2 — Redirect Service (port 8788)**

```bash
cd src/redirect
npx wrangler dev --config wrangler.local.toml --port 8788
```

**Terminal 3 — Frontend (port 5173)**

```bash
cd src/frontend
npm run dev
```

> **Windows note:** The root `npm run dev` script only starts the frontend and Admin API using shell `&`. It does **not** start the redirect service and may behave differently across shells. Use the three-terminal approach above on Windows.

## Health Checks

Once all three services are running, verify:

```bash
curl http://localhost:8787/health
curl http://localhost:8788/health
```

The frontend login page is at <http://localhost:5173/login>.

## Authentication Notes

- **Full-stack mode** requires a valid **Microsoft Entra ID** token for all protected API endpoints (`/api/urls`, `/api/analytics/*`, etc.). Complete the [Entra ID Configuration](#entra-id-configuration) section below.
- **`VITE_SKIP_AUTH=true`** replaces all API calls with an in-memory stub and skips authentication entirely. No Entra ID app registration is needed, but no real backend data is accessed.

## Entra ID Configuration

To enable Microsoft authentication for the management dashboard:

### Register an Application in Azure Portal

1. Go to [Azure Portal](https://portal.azure.com) > **Microsoft Entra ID** > **App registrations** > **+ New registration**.
2. Enter a name (e.g., `AkaMoney`), choose supported account types, and set the Redirect URI to **Single-page application (SPA)**: `http://localhost:5173`.
3. Click **Register** and note the **Application (client) ID** and **Directory (tenant) ID**.

### Configure API Permissions

1. In the app registration, go to **API permissions**.
2. Ensure **Microsoft Graph** > **User.Read** (delegated) is present. Add it if not.

### Update Environment Variables

Add to `src/frontend/.env`:

```env
VITE_ENTRA_ID_CLIENT_ID=<Application-Client-ID>
VITE_ENTRA_ID_TENANT_ID=<Directory-Tenant-ID>
VITE_ENTRA_ID_REDIRECT_URI=http://localhost:5173
```

Add to `src/backend/wrangler.local.toml` under `[vars]`:

```toml
ENTRA_ID_TENANT_ID = "<Directory-Tenant-ID>"
ENTRA_ID_CLIENT_ID = "<Application-Client-ID>"
```

### Production Redirect URIs

For production deployment, add your production domain to the app registration's Redirect URIs under **Authentication** > **Single-page application** > **Add URI**.

## Deployment

```bash
npm run deploy
```

This runs `deploy:frontend`, `deploy:backend`, and `deploy:redirect` in sequence, but it assumes every package config already contains valid production resource IDs and variables. Prefer the release workflow for normal production releases. For CI/CD details, environment secret injection, manual prerequisites, and custom domain configuration, see [DEPLOYMENT.md](DEPLOYMENT.md).

---

📚 [Documentation](README.md) · [Configuration](CONFIGURATION.md) · [API](API.md)