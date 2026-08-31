# AkaMoney repository instructions

## Tooling and commands

- Use Node.js 24.x and npm. This repository IS an npm workspace: the root
  `package.json` declares `src/frontend`, `src/backend`, and `src/redirect` as
  workspaces, and there is one root `package-lock.json` shared by all three
  application workspaces (`docs/design-mockups/validation` is an intentionally
  independent npm package with its own lockfile and is not part of the
  workspace). Run `npm install` from the repository root for a fresh install
  (`npm run setup` is an alias); CI and release jobs run one root `npm ci`
  followed by workspace-selected build/test commands.
- Run services from the repository root with `npm run dev:frontend`,
  `npm run dev:backend`, or `npm run dev:redirect`. On Windows, start the
  frontend and Admin API in separate terminals: the root `npm run dev` script
  uses `&`, which `cmd.exe` treats as a sequential separator rather than a
  portable concurrent runner.
- `npm run build` - Vite production build plus Wrangler dry-runs for both
  Workers.
- `npm test` - frontend, backend, and redirect Vitest suites.
- `npm run test:coverage` - all three coverage suites.
- Run one suite from its package directory:
  - Frontend: `cd src/frontend && npm test -- src/utils/__tests__/trend.test.ts`
  - Backend: `cd src/backend && npm test -- src/services/__tests__/url.test.ts`
  - Redirect: `cd src/redirect && npm test -- src/__tests__/services.test.ts`
  - Add `-t "test name"` after the path to select one Vitest test.
- Frontend type-check: `cd src/frontend && npx vue-tsc --noEmit`.
- There is no configured lint script. Do not invent a lint command or add a
  linter solely to validate unrelated work.
- CI (`.github/workflows/ci.yml`) runs one root `npm ci`, then runs coverage
  suites and builds (including the Wrangler dry-runs) per workspace with
  `-w akamoney-<frontend|backend|redirect>`. Coverage thresholds are 80% for
  frontend and backend TypeScript.
- Local Cloudflare development needs ignored `wrangler.local.toml` files based
  on each Worker's example config. The current backend `db:*` npm scripts refer
  to `akamoney`, while Wrangler config names the database `akamoney-clicks`; do
  not rely on those scripts until they are aligned. From `src/backend`, apply
  local migrations against the binding explicitly:
  `npx wrangler d1 migrations apply DB --local --config wrangler.local.toml`.
- Use each package's local npm scripts for Wrangler commands. The Admin API
  and redirect package intentionally pin different exact Wrangler versions
  (backend `4.90.0`, redirect `3.114.17`); do not unify them.

## Architecture

AkaMoney is three separately deployed applications backed by the same
Cloudflare D1 schema:

1. `src/frontend` is the authenticated Vue 3 management SPA. Vue Router guards
   initialize the Pinia auth store before entering protected routes. MSAL obtains
   Microsoft Entra access tokens; the Axios service attaches them to Admin API
   requests. `App.vue` renders authenticated pages inside `AppShell`, while the
   login page is standalone.
2. `src/backend` is the Hono Admin API Worker. `src/index.ts` owns HTTP routing
   and middleware composition; domain/database work belongs in `src/services`.
   Management routes use Entra JWKS validation from `middleware/auth.ts`;
   `/api/shorten` permits optional authentication. The Worker also runs the
   scheduled click-retention cleanup and selects R2 or Azure Blob storage through
   `services/storage/factory.ts`. The limited
   `/api/public/analytics/:shortCode` route is intentionally unauthenticated and
   must not expose owner-scoped analytics.
3. `src/redirect` is the unauthenticated public redirect Worker. It resolves an
   active short code from D1, rejects expired links in the route handler,
   returns a 302 for valid links, and records click metadata asynchronously with
   `executionCtx.waitUntil` so analytics do not delay redirects.

Database changes are ordered SQL files under `src/backend/migrations`; both
Workers depend on that schema. API contracts are duplicated in
`src/backend/src/types/index.ts` and `src/frontend/src/types/index.ts`.
`src/shared/types` is not currently imported as a package, so contract changes
must update both live type files plus frontend mock responses.

## Frontend conventions

- The UI uses Vue 3 Composition API with `<script setup>`, Pinia, Tailwind CSS
  v4, and Chart.js. The Bootstrap guidance still present in older README and
  CONTRIBUTING text is stale; do not add Bootstrap classes, Bootstrap Icons, or
  `data-bs-*` behavior.
- Tailwind is CSS-first: `src/assets/css/main.css` imports Tailwind and defines
  the Monē design tokens and component classes. There is intentionally no
  `tailwind.config.js`. Preserve the light/dark token system and switch themes
  through `document.documentElement[data-theme]` via `stores/theme.ts`.
- `VITE_SKIP_AUTH=true` bypasses auth only when Vite is in development mode.
  In that mode `services/api.ts` is an in-memory API used for UI development and
  screenshots. Keep mock behavior aligned with the real Admin API, including
  pagination, errors, analytics response shapes, and update semantics.
- For partial URL updates, `null` explicitly clears `title`, `description`,
  `image_url`, or `expires_at`; `undefined`/omission leaves the stored value
  unchanged. Keep `UpdateUrlRequest`, backend SQL handling, and
  `applyMockUrlUpdate` in sync.
- The Admin API's `short_url` may be only a short code. Never use it directly as
  an href or clipboard value. Build functional links from `short_code` with
  `utils/shortLink.ts`; the displayed brand host remains `aka.money`.
- Analytics date maps are sparse. Use the UTC calendar helpers in
  `utils/trend.ts` to fill missing dates rather than treating returned entries
  as consecutive days.
- Preserve explicit race handling around asynchronous UI state. The URL store
  uses monotonic request IDs and mutation invalidation; upload flows and
  `BaseChart` use generation guards. A stale response must not overwrite newer
  list, KPI, image, or chart state.
- Tests are colocated in `__tests__` directories. Frontend tests run in
  `happy-dom`; backend and redirect tests run in Node. Frontend coverage includes
  `src/**/*.ts` but excludes declaration files, `main.ts`, `router/**`,
  `services/api.ts`, `services/auth.ts`, and test directories; Vue SFCs are not
  in the include glob. New TypeScript utilities/composables outside those
  exclusions need direct tests. Backend coverage excludes `src/index.ts`, so
  keep testable domain logic in services rather than route handlers. Redirect
  coverage currently has no numeric threshold.

## Backend and redirect conventions

- Keep Hono handlers thin and use parameter-bound D1 statements in services.
  Ownership checks use the authenticated Entra user ID; list queries are scoped
  to `user_id`.
- Admin authentication accepts real Microsoft Entra tokens verified against the
  tenant JWKS, issuer, and audience. `services/jwt.ts` has no production caller
  and is exercised only by its own tests; do not wire it into Admin API routes
  as a substitute for Entra middleware authentication.
- Storage defaults to R2. `STORAGE_PROVIDER=azure` switches to Azure Blob
  storage; `CDN_URL` overrides provider-specific public URLs. New upload behavior
  must work through the `StorageProvider` abstraction rather than branching in
  route handlers.
- Redirect lookup is case-insensitive and returns active links from D1; the
  route handler then rejects expired links. Preserve the 404/410 distinction and
  asynchronous click recording when changing the redirect path.
- Use epoch milliseconds for persisted timestamps. Overall-stat date query
  parameters are inclusive UTC calendar dates in `YYYY-MM-DD` format.
