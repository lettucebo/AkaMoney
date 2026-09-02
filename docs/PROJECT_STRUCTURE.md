English | [繁體中文](PROJECT_STRUCTURE.zh-TW.md)

# Project structure

AkaMoney is three independently deployed services plus mirrored contracts, D1 migrations, design mockups, docs, and GitHub workflows. This is a responsibility map, not an exhaustive tree.

## Three deployables

| Deployable | Path | Runtime | Role |
|------------|------|---------|------|
| Management dashboard | `src/frontend/` | Vue 3 + Vite → Cloudflare Pages (`akamoney-admin`) | Entra ID sign-in, URL admin UI |
| Admin API | `src/backend/` | Cloudflare Worker `akamoney-admin-api` | Entra-protected management and analytics |
| Redirect | `src/redirect/` | Cloudflare Worker `akamoney-redirect` | Public `GET /:shortCode` → 302, click recording |

Root `package.json` declares an npm workspace over `src/frontend`, `src/backend`, and `src/redirect`, orchestrating `dev` / `build` / `test` / `deploy` per package through workspace selectors (`-w <name>`). There is one root `package-lock.json` shared by all three application workspaces; `docs/design-mockups/validation` is an intentionally independent npm package with its own lockfile and is not part of the workspace. Frontend proxies `/api` to `http://localhost:8787` during Vite dev.

**Frontend boundaries** (`src/frontend/src/`):

- `views/` — one view per route (`LoginView`, `DashboardView`, `OverallStatsView`, `AnalyticsView`, `NotFoundView`)
- `components/layout/` — `AppShell`, `AppSidebar`, `AppTopbar`
- `components/dashboard/` — KPI, on-demand create modal, table, toolbar, pagination, edit/confirm/toasts
- `components/common/` — `BaseButton`, `BaseBadge`, `BaseModal`, `BaseChart`, `EmptyState`, `StateBlock`
- `stores/` — `auth`, `theme`, `url`
- `services/` — `api.ts` (Admin API client), `auth.ts` (MSAL)
- `types/` — dashboard TypeScript contracts
- `assets/css/main.css` — Tailwind v4 tokens and component CSS (see [THEME](THEME.md))

**Admin API boundaries** (`src/backend/src/`):

- `index.ts` — Hono routes (`/health`, `/api/shorten`, `/api/urls`, `/api/analytics/:shortCode`, `/api/stats/overall`, `/api/storage/*`, `/api/admin/cleanup`)
- `middleware/` — CORS, errors, Entra bearer-token authentication
- `services/url.ts`, `analytics.ts`, `cleanup.ts`, `jwt.ts`, `user.ts`
- `services/storage/` — factory + R2 / Azure providers
- `types/` — `Env`, D1 row shapes, request/response types
- `wrangler.toml` — Worker name, D1 `akamoney-clicks`, R2 `akamoney-storage`, daily cron `0 2 * * *`

**Redirect boundaries** (`src/redirect/src/`):

- `index.ts` — `/health`, `GET /:shortCode` (404 / 410 expired / 302)
- `services.ts` — lookup + async click insert
- `types.ts` — redirect-local types
- same D1 database binding as the Admin API; no authentication

## Shared contracts

`src/shared/types/index.ts` exists, but **nothing in the repo imports it**. Frontend, backend, and redirect each keep their own copies.

When a field changes (for example `image_url` on URLs), update every consumer that actually compiles:

- `src/frontend/src/types/index.ts`
- `src/backend/src/types/index.ts`
- `src/redirect/src/types.ts` when the redirect worker needs the field
- `src/shared/types/index.ts` only if you are preparing a future shared package — it is not wired today

Do not `import` from `src/shared` until a real workspace package exists.

```
src/shared/types/index.ts     — not imported
src/frontend/src/types/       — Vue app contracts
src/backend/src/types/        — Worker + D1 contracts
src/redirect/src/types.ts     — redirect-only contracts
```

## Data and migrations

D1 schema lives only under `src/backend/migrations/`:

| File | Responsibility |
|------|----------------|
| `0001_initial_schema.sql` | `urls`, `click_records`, `users` |
| `0002_add_sso_provider.sql` | generic `sso_provider` / `sso_id` |
| `0003_fix_sso_unique_constraint.sql` | recreate `users` for `UNIQUE(sso_provider, sso_id)` |
| `0004_add_image_url.sql` | `urls.image_url` |

Apply migrations through Wrangler / the Admin API Worker. The redirect Worker is a reader of the same `akamoney-clicks` database.

## Frontend boundaries

Route table is in `src/frontend/src/router/index.ts`. Authenticated views render inside `AppShell`; `/login` is standalone (`App.vue`). List search/filter/sort is **current page only** because `GET /api/urls` accepts `page` / `limit` only.

Theme, tokens, and Chart.js rules: [THEME](THEME.md). Shipped screens vs design captures: [SCREENSHOTS](SCREENSHOTS.md).

## Design mockups

`docs/design-mockups/` is the frozen design-bakeoff tree, not a deployable:

- `BRIEF.md` — proposal contract
- `proposals/` — HTML + `*.manifest.json` (current visual ancestor: **`m2-mone-dense`**)
- `screenshots/` — mockup captures (see [SCREENSHOTS](SCREENSHOTS.md))
- `validation/` — Playwright + static checks for those HTML proposals
- `shared/` — bakeoff-only tokens and fixtures

Treat mockups as design history. Runtime CSS is `src/frontend/src/assets/css/main.css`.

## Documentation and workflows

`docs/` holds the bilingual technical set: [API](API.md), [SETUP](SETUP.md), [THEME](THEME.md), [PROJECT_STRUCTURE](PROJECT_STRUCTURE.md), [SCREENSHOTS](SCREENSHOTS.md). Root keeps `README`, `CHANGELOG`, `CONTRIBUTING`, `LICENSE`.

`.github/workflows/`:

- `ci.yml` — Node 24, one root `npm ci`, coverage and builds per workspace via `-w`
- `release.yml` — SemVer tag push or confirmed manual dispatch deploy to Cloudflare Pages + Workers

`.github/scripts/`:

- `resolve-release-ref.mjs` — trusted release ref validator run from a `main`-only checkout; turns the triggering event into an immutable, mainline-verified commit SHA (see [Deployment](DEPLOYMENT.md))

## Related documents

- [README](../README.md)
- [Setup](SETUP.md)
- [API](API.md)
- [Theme](THEME.md)
- [Screenshots](SCREENSHOTS.md)
