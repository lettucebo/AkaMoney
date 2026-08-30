English | [繁體中文](IMPLEMENTATION_SUMMARY.zh-TW.md)

# AkaMoney — Implementation Summary

> **Secondary / non-authoritative.** This document is a point-in-time snapshot of the
> current state of the codebase. It is *not* a source of truth for how to set up, run, or
> operate AkaMoney. For authoritative, maintained instructions always prefer the task
> guides — [Setup](SETUP.md), [API](API.md), and [Authentication](AUTHENTICATION.md) —
> which are kept in sync with the code. If this snapshot ever disagrees with those guides,
> the task guides win.

## Scope and Status

AkaMoney is a URL shortening service deployed on Cloudflare. This summary describes what is
actually shipped in the repository today so a reader can orient quickly. It intentionally
avoids roadmap promises and feature claims that are not backed by code. Where the backend is
known to be incomplete, the gaps are listed under [Known Backend API Gaps](#known-backend-api-gaps)
with links to the tracking issues rather than being papered over.

## Architecture Snapshot

The project is split into three independently deployable services. A `src/shared` directory
also exists, but no live service imports it; contracts are currently duplicated within the
service packages.

| Service | Directory | Auth | Responsibility |
|---------|-----------|------|----------------|
| Redirect Service (`akamoney-redirect`) | `src/redirect/` | None (public) | Resolve `GET /:shortCode` and issue a 302 redirect |
| Admin API (`akamoney-admin-api`) | `src/backend/` | Microsoft Entra ID (JWT) | URL CRUD, analytics, storage, cleanup |
| Frontend (management dashboard) | `src/frontend/` | Microsoft Entra ID (MSAL) | Operator UI |
| Unwired type declarations | `src/shared/` | — | Present in the repository but not imported by live services |

```text
src/
├── frontend/   # Vue 3 + Vite + Tailwind v4 management dashboard
├── backend/    # Admin API — Cloudflare Worker (Hono), JWT-protected
├── redirect/   # Public redirect Worker (Hono), no auth
└── shared/     # Type declarations present but not wired into live services
```

## Frontend (Proposal F / m2-mone-dense)

The dashboard implements the **Proposal F** design direction (manifest
`docs/design-mockups/proposals/m2-mone-dense.manifest.json`, "Monē 高密度資料工具變體"). It is
built with Vue 3 (`<script setup>`), Vite, and **Tailwind CSS v4** using a CSS-first
`@theme` configuration (no `tailwind.config.js`); there is no Bootstrap. Runtime light/dark
theming is driven by a `data-theme` attribute on `<html>` and a Pinia theme store.

Shipped capabilities that exist as components/views:

- **Collapsible sidebar shell** — `AppShell`, `AppSidebar`, `AppTopbar`.
- **Dense, scannable URL table** — `UrlTable` with `UrlTableToolbar` and `DashboardPagination`.
- **On-demand URL creation** — `UrlCreateModal` opens from dashboard actions without occupying the normal link-management workspace.
- **KPI summary** — `KpiSummary` fed by the `useKpiSummary` composable.
- **Comparative analytics** — `AnalyticsView` and `OverallStatsView` with `BaseChart` and a
  shared categorical palette from `useChartTheme`.
- **Edit / confirm / toast UX** — `UrlEditModal`, `ConfirmActionModal`, `DashboardToastStack`.

## Admin API

The Admin API is a Hono Worker (`src/backend/src/index.ts`). Authentication verifies
Microsoft Entra ID tokens against the tenant JWKS (via `jose`) rather than minting local
HS256 tokens; protected routes use `authMiddleware` and `/api/shorten` uses
`optionalAuthMiddleware`. Implemented routes include:

- `GET /health`
- `POST /api/shorten` (optional auth)
- `GET /api/urls`, `GET /api/urls/:id`, `PUT /api/urls/:id`, `DELETE /api/urls/:id`
- `GET /api/analytics/:shortCode`, `GET /api/public/analytics/:shortCode`
- `GET /api/stats/overall`
- `POST /api/admin/cleanup`
- `GET /api/storage/config`, `POST /api/storage/upload`, `GET /api/storage/files`,
  `GET /api/storage/files/:key`, `DELETE /api/storage/files/:key`

A `scheduled` cron handler runs the retention cleanup automatically.

## Redirect Service

The Redirect Service (`src/redirect/src/index.ts`) is intentionally minimal and public. It
exposes `GET /health` and `GET /:shortCode`, looks the code up in D1, and returns a `302`
redirect to the original URL. Keeping redirection separate from the Admin API means an issue
in management endpoints cannot take down redirects.

## Data, Storage, and Authentication

- **Database (Cloudflare D1):** `urls`, `click_records`, and `users` tables. Later migrations
  add `image_url` to `urls` (`0004`) and generic SSO fields to `users` (`0002`/`0003`).
- **Object storage:** a provider abstraction (`src/backend/src/services/storage/`) supports
  Cloudflare R2 and Azure Blob Storage via a factory, selected by configuration.
- **Authentication:** Microsoft Entra ID is used both for the dashboard (MSAL) and for Admin
  API bearer tokens (verified server-side). See [Authentication](AUTHENTICATION.md) for the
  canonical runtime behaviour, and [SSO User Auto-Provisioning](IMPLEMENTATION_SSO_USER.md)
  for how login persists user records.
- **Retention:** old click records are pruned on a daily cron and via `POST /api/admin/cleanup`.

## Test Posture

Each service carries its own Vitest suite. Tests live in `__tests__/` folders next to the
code they cover (frontend components/views/stores/composables, Admin API middleware and
services including auth and user upsert, and the redirect service). Run them from the repo
root:

```bash
npm run test              # all three services
npm run test:frontend     # dashboard only
npm run test:backend      # admin API only
npm run test:redirect     # redirect service only
npm run test:coverage     # with coverage
```

## Known Backend API Gaps

Some dashboard capabilities are ahead of the backend. These gaps are tracked in GitHub and
should be treated as the authoritative list rather than any status claim in this file:

- [#132 — Epic: Backend API gaps for Proposal F (mone-dense) dashboard rollout](https://github.com/lettucebo/AkaMoney/issues/132)
- [#133 — `GET /api/urls`: add search (q), sort/order, status filter, status counts](https://github.com/lettucebo/AkaMoney/issues/133)
- [#134 — `OverallStatsResponse`: add `links_created_in_range` tied to `date_range`](https://github.com/lettucebo/AkaMoney/issues/134)
- [#135 — `AnalyticsResponse`: add `clicks_by_os` and `clicks_by_referer` (safe hostname)](https://github.com/lettucebo/AkaMoney/issues/135)

## Related Documentation

- [README](../README.md)
- [Architecture](ARCHITECTURE.md)
- [Authentication](AUTHENTICATION.md)
