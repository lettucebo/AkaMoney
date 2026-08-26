English | [繁體中文](DEVELOPMENT.zh-TW.md)

# Development Guide

This guide details the local development workflow, environment requirements, service orchestration, configuration, and architectural boundaries for the AkaMoney URL shortening platform.

## Prerequisites and Environment

### Node.js and Package Manager

- **Node.js**: `24.x` (LTS) or higher (enforced via `"engines": { "node": ">=24.0.0" }` in `package.json`).
- **Package Manager**: `npm` (each subpackage maintains its own `package-lock.json`).
- **Cloudflare Wrangler CLI**: Installed locally per package or globally (`npm install -g wrangler`).

### Repository Structure and Dependency Boundaries

AkaMoney is structured with three independent service packages inside `src/`. It does **not** use an npm workspace monorepo structure:

```
.
├── package.json              # Root scripts orchestrating subpackages
├── package-lock.json         # Root lockfile
└── src/
    ├── frontend/             # Vue 3 Single Page Application (management UI)
    │   ├── package.json      # Frontend dependencies & scripts
    │   └── package-lock.json
    ├── backend/              # Cloudflare Workers Admin API (Hono)
    │   ├── package.json      # Backend dependencies & scripts (Wrangler v4)
    │   └── package-lock.json
    └── redirect/             # Cloudflare Workers Redirect Service (Hono)
        ├── package.json      # Redirect dependencies & scripts (Wrangler v3)
        └── package-lock.json
```

Each service package manages its own dependencies independently. Running `npm install` only at the root will **not** install dependencies for `src/frontend`, `src/backend`, or `src/redirect`.

---

## Local Development Setup

### 1. Installing Dependencies

To install dependencies across all three packages in one step, use the root setup script:

```bash
# Install root and all subproject dependencies
npm run setup
```

Alternatively, install dependencies manually in each directory:

```bash
# Root
npm install

# Frontend
cd src/frontend && npm install

# Backend Admin API
cd ../backend && npm install

# Redirect Service
cd ../redirect && npm install
```

### 2. Local Wrangler Configuration

Cloudflare Workers configurations for local execution require local `.toml` files that are ignored by git (`.gitignore` excludes `wrangler.local.toml` and `.dev.vars`):

1. **Backend Admin API**:
   ```bash
   cd src/backend
   cp wrangler.local.toml.example wrangler.local.toml
   ```
   - **Wrangler v4 & Compatibility**: The backend uses Wrangler v4 (`^4.59.1`) with `compatibility_flags = ["nodejs_compat"]`.
   - In `wrangler.local.toml`, the D1 binding uses database name `akamoney-clicks`. Set `database_id` to your local D1 database UUID or dummy string for local Miniflare simulation.

2. **Redirect Service**:
   ```bash
   cd src/redirect
   cp wrangler.local.toml.example wrangler.local.toml
   ```
   - **Wrangler v3 & Future Upgrade**: The redirect service currently uses Wrangler v3 (`^3.114.17`) with `node_compat = true`. Note that when upgrading redirect service to Wrangler v4 in the future, `node_compat = true` must be updated to `compatibility_flags = ["nodejs_compat"]`.

3. **Frontend Environment**:
   ```bash
   cd src/frontend
   cp .env.example .env
   ```
   - Configure `VITE_API_URL=http://localhost:8787` (Admin API) and `VITE_SHORT_DOMAIN=http://localhost:8788` (Redirect Service).

### 3. Running Services Locally

Local development requires running three services concurrently on their designated ports:

| Service | Directory | Local Port | Default Command |
|---------|-----------|------------|-----------------|
| **Frontend UI** | `src/frontend` | `5173` | `npm run dev` (`vite`) |
| **Admin API** | `src/backend` | `8787` | `npx wrangler dev --config wrangler.local.toml --port 8787` |
| **Redirect Service** | `src/redirect` | `8788` | `npx wrangler dev --config wrangler.local.toml --port 8788` |

Vite is configured in `src/frontend/vite.config.ts` to reverse-proxy `/api` requests to `http://localhost:8787`.

### 4. Windows Development Workflow

On Windows (PowerShell / Command Prompt), running the root script `npm run dev` (which executes `npm run dev:frontend & npm run dev:backend`) is **not reliably concurrent** because the `&` operator in Windows shells behaves differently than Unix shells (either running sequentially or triggering background jobs without output streaming).

For a reliable development experience on Windows, **open three dedicated terminal tabs**:

```powershell
# Terminal 1 - Frontend (Port 5173)
cd src\frontend
npm run dev

# Terminal 2 - Backend Admin API (Port 8787)
cd src\backend
npx wrangler dev --config wrangler.local.toml --port 8787

# Terminal 3 - Redirect Service (Port 8788)
cd src\redirect
npx wrangler dev --config wrangler.local.toml --port 8788
```

---

## Frontend UI-Only Development (VITE_SKIP_AUTH)

When working purely on UI components, styling, charts, or automated screenshot generation, you can run the frontend completely standalone without running the backend worker or Microsoft Entra ID SSO.

Set `VITE_SKIP_AUTH=true` in `src/frontend/.env` or `src/frontend/.env.local`:

```ini
# Frontend standalone mock mode
VITE_SKIP_AUTH=true
```

### In-Memory Mock System

When `VITE_SKIP_AUTH=true` is set and Vite is running in development mode (`import.meta.env.DEV`):
- **Mock Authentication** (`src/frontend/src/services/auth.ts`): Bypasses MSAL and Entra ID login, injecting a mock user account (`Development User`, `dev@localhost`).
- **In-Memory Store** (`src/frontend/src/services/api.ts`): Intercepts API calls and returns mock URL items, analytics data, and KPI statistics in-memory. Create, update, and delete actions mutate the in-memory array for the duration of the session.
- **Safety**: `isAuthSkipped()` evaluates to `false` automatically in production builds (`import.meta.env.DEV` check), preventing accidental mock leakage.

---

## Source Boundaries and API Contracts

AkaMoney maintains clear architectural boundaries between frontend and backend services:

- **Type Contracts**: Frontend TypeScript interfaces in `src/frontend/src/types/index.ts` (`UrlResponse`, `CreateUrlRequest`, `UpdateUrlRequest`, `AnalyticsResponse`, `OverallStatsResponse`) mirror backend contracts defined in `src/backend/src/types/index.ts`.
- **Backend Isolation**: `src/backend` exclusively handles authenticated admin management endpoints (`/api/urls`, `/api/analytics`, `/api/storage`), Entra token verification, and scheduled cron cleanup.
- **Redirect Isolation**: `src/redirect` is a lightweight, public, read-only Cloudflare Worker focused purely on fast HTTP 302 redirects (`/:shortCode`) and asynchronous click telemetry recording via `c.executionCtx.waitUntil()`.

---

## Database Migrations

D1 schema migrations are located in `src/backend/migrations/`.

- **Apply Migrations Locally** (Miniflare SQLite):
  ```bash
  cd src/backend
  npx wrangler d1 migrations apply DB --local --config wrangler.local.toml
  ```

- **Apply Migrations to Production D1**:
  ```bash
  cd src/backend
  npx wrangler d1 migrations apply DB --remote --config wrangler.toml
  ```

  Populate the tracked config's empty `database_id` before running a manual remote command. The release workflow injects it automatically.

The package's current `db:*` scripts use the database name `akamoney`, while the
Worker binds `akamoney-clicks`. Use the `DB` binding commands above until those
scripts are aligned.

For comprehensive database schema diagrams, migration history, and D1 binding guidelines, refer to the [Database Documentation](DATABASE.md).

---

## Related Documents

- [Database Documentation](DATABASE.md)
- [Testing Guide](TESTING.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [API Documentation](API.md)
- [Setup Guide](SETUP.md)
- [Project README](../README.md)
