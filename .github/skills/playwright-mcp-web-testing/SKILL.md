---
name: playwright-mcp-web-testing
description: "Agent-driven interactive browser testing for Monē web apps (mone-web, admin-portal, landing) using the Playwright MCP browser_* tools against a REAL local backend. USE FOR: manually verifying a feature in the browser, reproducing a UI bug, exploratory E2E checks during development, verifying computed values / optimistic updates / styling state, contrasting behavior variants (e.g. equal vs proportional). DO NOT USE FOR: writing or running the automated mocked Playwright spec suite under e2e/ (that is `pnpm test:e2e`), mobile testing (use maestro-mobile-testing), or unit/component tests (vitest)."
version: 1.0.0
category: testing
tags:
  - playwright
  - mcp
  - browser
  - e2e
  - web
  - vue
  - interactive-testing
  - verification
requires_tools:
  - microsoft-playwright-mcp-browser_*
---

# Playwright MCP Web Testing (interactive, real backend)

## Overview

This skill captures the **agent-driven, interactive** browser-testing workflow: you drive a
running Monē web app with the **Playwright MCP `browser_*` tools** (snapshot / click / type /
evaluate), against a **real local backend + database**, to verify a feature end-to-end, reproduce
a bug, or contrast behavior variants — all within the current session, no test file required.

### This is NOT the automated `e2e/` suite

The repo already has an **automated** Playwright suite. Keep the two clearly separate:

| | **This skill** (interactive MCP) | **Automated suite** (`e2e/`) |
|---|---|---|
| Driver | Playwright **MCP** `browser_*` tools | `@playwright/test` spec files |
| Trigger | Agent, ad-hoc, in-session | `pnpm test:e2e` / CI |
| Backend | **Real** local API + DB (`wrangler dev`) | **Mocked** via `page.route(...)` |
| Auth | Real login or injected tokens | `moneWebTest` fixture (localStorage tokens) |
| Web server | `vite` dev on **:5173** | `vite preview` on **:4173** |
| Purpose | Verify / explore / reproduce while building | Regression, deterministic, runs in CI |
| Artifact | A findings report (no file committed) | Committed `*.spec.ts` |

> When an interactive verification stabilizes into something worth guarding, **promote it** into a
> `e2e/mone-web/*.spec.ts` with mocked API (see "Promoting to an automated spec" below).

## When to use

- "用瀏覽器測試一下…" / "verify this in the browser" / "幫我重現這個畫面的 bug"
- Verifying a feature whose correctness depends on **computed values** (totals, shares, balances)
- Verifying **optimistic updates**, modal flows, edit-then-recompute flows
- Verifying **styling / active state** that has no semantic text (e.g. an active toggle button)
- **Contrasting variants** of the same flow (e.g. equal vs proportional allocation)

**Skip** for: the automated mocked suite (`pnpm test:e2e`), mobile (`maestro-mobile-testing`),
or pure unit/component logic (`vitest`).

## Prerequisites & environment

Run from the **current worktree** (not main). Interactive testing drives a real browser against a
real local stack, so you must start **both** local dev servers yourself — the **backend API** *and*
the **frontend web** — and keep both running for the whole session. The web app is useless without
its API (login, data, optimistic updates all 401/fail), so never start only one.

Default ports per app (memorize these — they matter for the parallel-session rules below):

| App | Web (vite) | API (wrangler) | Start scripts |
|-----|-----------|----------------|---------------|
| **mone-web** | `:5173` (`strictPort`) | `:8787` | `pnpm dev:web` / `pnpm dev:api` |
| **admin-portal** | `:5174` | `:8788` | `pnpm dev:admin-web` / `pnpm dev:admin-api` |
| **landing** | `:5175` | _(no API)_ | `pnpm dev:landing` |

### 1. Start the backend (API)

```powershell
# From the worktree root. Real backend bound to the REMOTE test D1 (mone-db-test):
cd src/mone-web/api
npx wrangler dev --remote      # → http://localhost:8787, uses the remote test database
```

- Use `--remote` to exercise the **real remote test DB** (what we used for split-billing). It is a
  dedicated *test* database — safe to write to, but it is shared state, so prefer creating fresh
  entities per run and avoid destructive edits to existing data.
- Omit `--remote` (plain `wrangler dev` / `pnpm dev:api`) for a local miniflare DB if you don't
  need remote data — but then you must seed everything locally first.

### 2. Start the web app

```powershell
# Separate shell, from the worktree root:
pnpm dev:web                   # → http://localhost:5173 (vite dev)
# admin portal instead:  pnpm dev:admin-web
# landing instead:       pnpm dev:landing
```

> Start both as **async / detached** background shells so they survive while you drive the browser.
> Verify they're listening (`curl http://localhost:8787`, open `http://localhost:5173`) before testing.

### 2.5 Parallel sessions: coexist on ports + browser, restore afterwards

Multiple agents / sessions may test at the same time. They collide on **two** shared resources — the
dev-server **ports** (below) and the Playwright MCP **browser profile** (further down). They all
default to the **same** ports (5173/8787, 5174/8788, 5175), so a naive start either fails ("port in
use") or — worse — tempts you to kill whatever is already there. **Don't.**

#### Coexistence rule (do NOT kill other servers)

Another running web/API server is very likely **another agent's session**. Stopping or `kill`-ing it
breaks their work. Instead:

1. **Detect first**, don't assume it's yours:
   ```powershell
   Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
   ```
2. If the port is **occupied**, **leave it alone** and start *your* server on a **different** port.
   Never `Stop-Process` / `taskkill` a server you didn't start.

#### Temporarily use a different port

- **API** (mone-web): `npx wrangler dev --remote --port 8799` (pick any free port).
  - admin-portal API port lives in `src/admin-portal/api/wrangler.toml` (`port = 8788`).
- **Web**: vite uses `strictPort: true`, so it will **fail rather than auto-pick** a free port — you
  **must** pass one explicitly. Run vite directly in the package dir to avoid nested-pnpm arg
  forwarding issues: `cd src/mone-web/web && pnpm dev --port 5199` (vite forwards `--port`).
- **Wire the frontend to your API port**: the frontend's API target is **hard-coded** to the default
  port in two places — if you move the API, update **both**, or the UI can't reach the backend:
  - `src/mone-web/web/.env` → `VITE_API_URL=http://localhost:<new-api-port>`
  - `src/mone-web/web/vite.config.ts` → `server.proxy['/api'].target`
  - (admin uses a different env var: `src/admin-portal/web/.env` → `VITE_API_BASE_URL=http://localhost:<new-api-port>/api/v1`)
- **⚠️ Move the WEB port → also fix the API's CORS allow-list (source code!)**: the API only accepts
  requests from a **hard-coded list of origins**, so a moved web port (e.g. `:5199`) is **CORS-blocked**
  even though the API is reachable. Temporarily add `http://localhost:<new-web-port>` to the `cors`
  `origin: [...]` array:
  - mone-web: `src/mone-web/api/src/index.ts` (currently lists `http://localhost:5173`)
  - admin: `src/admin-portal/api/src/index.ts` (currently lists `http://localhost:5174`)
- **(Option B real-login only)** Moving the web port also breaks the OAuth callback
  (`http://localhost:5173/auth/callback/google`), which must match a registered redirect URI. The
  recommended JWT-injection auth (§3 Option A) sidesteps this — prefer it when on a non-default port.

#### Where each port is defined (edit / restore reference)

| Port | File | Field |
|------|------|-------|
| mone-web web `5173` + proxy → `8787` | `src/mone-web/web/vite.config.ts` | `server.port`, `server.proxy['/api'].target` |
| mone-web API URL `8787` | `src/mone-web/web/.env` | `VITE_API_URL` |
| mone-web API `8787` | _(wrangler default; override via `--port`)_ | — |
| **mone-web API CORS origin `5173`** | `src/mone-web/api/src/index.ts` | `cors({ origin: [...] })` |
| admin web `5174` + proxy → `8788` | `src/admin-portal/web/vite.config.ts` | `server.port`, proxy `target` |
| admin web API URL `8788` | `src/admin-portal/web/.env` | `VITE_API_BASE_URL` (`…/api/v1`) |
| admin API `8788` | `src/admin-portal/api/wrangler.toml` | `port` |
| **admin API CORS origin `5174`** | `src/admin-portal/api/src/index.ts` | `cors({ origin: [...] })` |
| landing web `5175` | `src/landing/vite.config.ts` | `server.port` |
| dev start scripts | root `package.json` | `dev:web` / `dev:api` / `dev:admin-web` / `dev:admin-api` / `dev:landing` |

> Out of scope for this (web) skill, but for the record the **mobile** app also hard-codes the API
> port in `src/mobile/src/config/api.ts` (`DEV_API_BASE_URL = http://localhost:8787/api/v1/`) — only
> relevant if you're pointing the app at a moved API.

#### Restore the ports when done (MANDATORY)

Any port you changed is a **temporary, local-only** workaround. Before you finish — and **before any
commit / PR** — change every port back to its default. ⚠️ **A temporary port must never be committed
or merged into `main`**: doing so rewrites the project's **default** ports and breaks everyone else
and CI.

- Revert `.env` `VITE_API_URL` / `VITE_API_BASE_URL`, `vite.config.ts` proxy `target` / `server.port`,
  any `wrangler.toml` `port`, **and any `cors` `origin` entry you added to `src/*/api/src/index.ts`**.
- Drop any `--port` overrides (they're CLI-only, nothing to revert in files).
- Confirm a clean tree before committing:
  ```powershell
  git status            # config files / index.ts should NOT appear as modified
  git --no-pager diff   # expect no port- or CORS-related changes
  ```

#### Isolate the browser per session (avoid cross-session state bleed)

Ports aren't the only shared resource — the **Playwright MCP browser profile** is too. Each session
spawns its own `@playwright/mcp` stdio subprocess (its own browser *process*), but by **default** they
all share one **persistent profile**, keyed by `mcp-{channel}-{workspace-hash}` where the hash comes
from the **workspace root**. So multiple sessions **in the same repo share one profile dir**, which
causes two failures:

1. **Profile lock** — per the Playwright MCP docs: *"A persistent profile can only be used by one
   browser instance at a time, so concurrent MCP clients sharing the same workspace will conflict."*
   The second parallel browser fails to launch.
2. **Auth/state bleed** — shared `cookies` / `localStorage` means the `access_token` one session
   injects (see "Establish an authenticated session" below) **overwrites another session's** — your
   logins clobber each other.

**Fix — give each parallel session its own browser** (official guidance: *"start each additional
client with `--isolated` or point it at a distinct `--user-data-dir`"*):

| Option | How | Notes |
|--------|-----|-------|
| **`--isolated` (recommended)** | Add `--isolated` to the MCP server args (seed login via `--storage-state <file>` if needed) | In-memory profile, fresh per session, no lock conflict, **nothing persisted to clean up**. Fits this skill, which injects the JWT into `localStorage` each run and doesn't need a persisted login. |
| Distinct `--user-data-dir` | Point each session/worktree at its own profile path | Keeps per-session persistent state, but leaves profile dirs to manage. |

The server is configured in `.mcp.json` / `.vscode/mcp.json` under `microsoft/playwright-mcp` (args
currently just `@playwright/mcp@latest`, **no** isolation flag). ⚠️ Editing those args adds
`--isolated` **globally and is a committed change for the whole team** — only do that if the team
wants isolation by default. For an **ad-hoc parallel run**, prefer the env var
`PLAYWRIGHT_MCP_ISOLATED=true` (or a per-worktree MCP config) so you don't commit a global change —
same "temporary, restore-after" discipline as the ports.

### 3. Establish an authenticated session

Most pages are behind an auth guard. Against a **real backend** you need a **genuinely valid** JWT
(mock strings are rejected). Pick one:

#### Option A (recommended): mint a JWT with `JWT_SECRET`

The API verifies tokens itself — it doesn't call any external IdP — so you can sign your own.
Mechanism (`src/mone-web/api/src/services/jwt.ts` + `middleware/auth.ts`):

- Algorithm **HS256**, signed with **`JWT_SECRET`** (from `src/mone-web/api/.dev.vars`).
- The middleware verifies the signature, checks `exp`, and **requires `aud === 'mone-web'`**.
- Claims the app expects: `sub` (user id), `email`, `name`, `plan`, `aud: 'mone-web'`,
  `iss: 'mone-api'`, plus `iat`/`exp` (access token lives **1 hour**).

Mint one with the project's own `jose` dependency. Save as `mint-token.mjs` and run **from
`src/mone-web/api`** so `jose` resolves:

```js
// mint-token.mjs — run: cd src/mone-web/api && node mint-token.mjs
import { SignJWT } from 'jose'
import { readFileSync } from 'node:fs'

// Read JWT_SECRET from .dev.vars (never hard-code or print the secret)
const secret = readFileSync('.dev.vars', 'utf8')
  .split(/\r?\n/).find(l => l.startsWith('JWT_SECRET='))
  ?.slice('JWT_SECRET='.length).trim()
if (!secret) throw new Error('JWT_SECRET not found in .dev.vars')

const token = await new SignJWT({
  sub: process.env.UID ?? '<existing-user-id>', // MUST be a real user id in the (test) DB
  email: 'tester@example.com',
  name: 'Tester',
  plan: 'free',
  aud: 'mone-web',   // 🔒 required exactly — middleware 401s otherwise
  iss: 'mone-api',
})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(new TextEncoder().encode(secret))

console.log(token)
```

Then inject it into the running app and navigate (the auth store reads these `localStorage` keys —
see `e2e/fixtures/mock-auth.fixture.ts`):

```js
// browser_evaluate
() => {
  localStorage.setItem('access_token', '<minted-token>')
  localStorage.setItem('refresh_token', 'dev')  // placeholder is fine for short sessions
}
```

Re-navigate / reload so the guard re-reads the token.

> **Gotchas:** `sub` must be a **real user id** present in the DB you're hitting (`--remote` → remote
> test DB), otherwise ownership-scoped queries return empty / fail. `aud` must be exactly
> `'mone-web'`. The token expires in **1h** — re-mint if your session runs long (the `refresh_token`
> placeholder won't auto-refresh since real refresh needs a KV entry).

To find an existing user id, query the DB you're testing against, e.g.
`cd src/mone-web/api && npx wrangler d1 execute mone-db-test --remote --command "SELECT id,email FROM users LIMIT 5"`.

#### Option B: real login flow

Complete the actual login (e.g. Google) once in the browser, then proceed. Use this when you must
exercise the real auth/onboarding path itself rather than jump past it.

## Core loop: navigate → snapshot → act → verify

Repeat this short loop. **Re-snapshot after every action that re-renders the DOM.**

1. **Navigate** — `browser_navigate` to the page under test.
2. **Snapshot** — `browser_snapshot` to get the accessibility tree **with fresh element refs**.
3. **Act** — `browser_click` / `browser_type` / `browser_fill_form` / `browser_select_option`,
   referencing the `ref` from the *latest* snapshot.
4. **Verify** — assert via a new `browser_snapshot` (for text/structure) **or** `browser_evaluate`
   (for computed values, classes, DOM state). Use `browser_wait_for` for async UI.

## Drive the real UI — never shortcut data via the API (MANDATORY)

The whole point of this skill is to verify the app **as a user experiences it**. So:

- **Create / edit / delete data through the actual browser UI** — fill the real forms, click the real
  buttons, open the real modals. This exercises the frontend validation, request building, optimistic
  updates, and re-render paths that an API shortcut skips entirely.
- **Do NOT seed or mutate data with direct API calls** — no `curl`, no `fetch()` via
  `browser_evaluate`, no `wrangler d1 execute` INSERTs — to "save time" creating the records you're
  about to test. A green API call proves the backend works; it proves **nothing** about the UI, and it
  can hide real bugs (a form that never sends the field, a button that no-ops, a broken optimistic
  update).
- **Only exception — genuine, unavoidable preconditions**: if a required precondition has **no UI path
  at all** (e.g. a server-only state, or seeding a dependency that the feature-under-test consumes but
  doesn't itself create), you may set it up via API/DB. Even then, keep the **feature under test**
  driven entirely through the UI, and note in the report which preconditions were seeded and why.

> Rule of thumb: if a real user could do it in the browser, **you** must do it in the browser. The API
> is for *inspecting* what the UI did (`browser_network_requests`), not for *doing* the UI's job.

## Playwright MCP tool map

| Goal | Tool |
|------|------|
| Go to a URL | `browser_navigate` (`browser_navigate_back` for history) |
| Get interactable elements + refs | `browser_snapshot` (preferred over screenshots for actions) |
| Click / double-click / right-click | `browser_click` |
| Type into a field | `browser_type` (use `submit: true` to press Enter) |
| Fill several fields at once | `browser_fill_form` |
| Dropdowns | `browser_select_option` |
| Wait for async text / spinner | `browser_wait_for` (`text` / `textGone` / `time`) |
| Read computed values, classes, DOM | `browser_evaluate` ⭐ (the key verification tool) |
| Inspect API calls the UI made | `browser_network_requests` / `browser_network_request` |
| Visual confirmation for the human | `browser_take_screenshot` |
| Read JS errors | `browser_console_messages` (`level: "error"`) |
| Handle native dialogs | `browser_handle_dialog` |
| Resize viewport (responsive checks) | `browser_resize` |
| Upload a file | `browser_file_upload` |
| Drag & drop / hover / key press | `browser_drag` / `browser_hover` / `browser_press_key` |
| Multiple tabs / windows | `browser_tabs` |

> `wrangler dev` specifics (flags, bindings, remote DB) are owned by the **`wrangler`** skill — defer
> there for backend startup details; this skill only needs the server *running*.

## Critical gotchas (learned the hard way)

### 1. Element refs go stale after a re-render → re-snapshot
After any action that mutates the DOM (save, open modal, toggle, route change), the previous
snapshot's `ref` values are **stale**. Always take a **fresh `browser_snapshot`** before the next
interaction. Acting on a stale ref silently targets the wrong element or fails.

### 2. Active / styling state is NOT reliably in the a11y tree → read `className`
Toggle buttons, selected tabs, and "active" styling often have no semantic signal in the
accessibility snapshot. **Do not trust the snapshot** to tell you which option is active. Instead
read the class list via `browser_evaluate`:

```js
// browser_evaluate — is the "依比例分攤 (proportional)" button the active one?
() => {
  const btns = [...document.querySelectorAll('button')]
  const b = btns.find(el => el.textContent.includes('依比例分攤'))
  return b?.className   // active variant contains e.g. "primary" / "text-light-primary"
}
```

Active state in this codebase is signaled by a `primary` / `text-light-primary` class. Verify by
substring-matching the class, not by appearance.

### 3. Verify **computed numbers** with `browser_evaluate`, don't eyeball them
For totals, shares, balances — read the actual rendered text nodes and compare to the expected
math. This is how we confirmed proportional `990/110` vs equal `950/150` shares.

```js
() => [...document.querySelectorAll('[data-member-share]')].map(n => n.textContent.trim())
```

### 4. Wait for async UI before asserting
After a save / fetch, the modal or list updates asynchronously. Use `browser_wait_for({ text })`
(or `textGone` for a spinner) before snapshotting — never assume the DOM settled instantly.

### 5. Confirm the backend actually received the write
A green UI can be optimistic. Use `browser_network_requests` to confirm the `POST`/`PUT` fired and
returned 2xx, especially when verifying persistence against the real DB.

### 6. Re-open / re-enter to confirm persistence
Close the detail modal and re-open it (or reload) to confirm values were **persisted**, not just
held in component state.

## Contrast / variant testing pattern

When a feature has behavior **variants**, build a **crisp contrast case** where the variants produce
*obviously different* numbers, then exercise each:

1. Construct inputs whose two variants diverge clearly (e.g. 主餐 900 / 配菜 100 / 服務費 100).
2. Run variant A (依比例分攤) → save → read shares via `browser_evaluate` (→ 990/110).
3. Use the **edit flow** (✏️ 編輯) to switch to variant B (平均分攤) → save → re-read (→ 950/150).
4. Confirm the toggle **recomputes** and the active-state class flips (gotcha #2).

This proves both the calculation *and* the re-computation path in one pass.

## Enumerate test cases first — think broadly, don't stop at the happy path

Before you start clicking, **brainstorm as many test cases as you can** for the feature under test,
then drive each one. The point of interactive testing is *confidence the implementation is correct* —
a single happy-path run proves almost nothing. The more cases you derive up front, the more real bugs
you catch. Aim for breadth first, then prune the irrelevant ones.

**Derivation framework — generate cases systematically (don't rely on intuition alone):**

1. **Happy paths & variants** — every primary success flow, and **each behavior variant** run
   separately (equal vs proportional, income vs expense, etc.).
2. **Every input → equivalence classes + boundaries** — min/max, `0`, negative, very large numbers,
   decimals & rounding, max-length strings, special chars / emoji / full-width, whitespace-only.
3. **Empty / null / missing** — empty list or "no data yet" state, optional fields omitted, a
   referenced entity that was **deleted** (e.g. category gone → transaction still renders), default
   rows where `user_id IS NULL`.
4. **Invalid / error** — bad format, failed validation (correct message shown?), server `4xx`/`5xx`,
   network failure / offline, duplicate submit.
5. **State & sequencing** — `create → edit → delete → re-create`; double-click submit; optimistic
   update **and its rollback** on failure; stale data after another change.
6. **Permissions & ownership** — another user's data is **not** reachable; default vs user-owned data;
   role/plan gating.
7. **Idempotency / repeat** — run the same action twice; confirm already-processed items **do not
   reappear** and totals don't double.
8. **Cross-cutting** — locale 中/英 switch, dark mode, responsive breakpoints, and **persistence**
   after reload / re-entry.

**Track them** — record the enumerated cases (the session `todos` table or a written checklist work
well), capture **expected vs actual** for each, and **don't declare PASS until every case is exercised
or explicitly marked N/A**. Cross-reference the project's 5-round self-review (boundary conditions,
data-flow, business-logic consistency, user-perspective) in
[general.instructions.md](../../instructions/general.instructions.md) — the same rigor applies here.

> The category checklist below is the **menu**; this section is the **method** for filling it in
> exhaustively for your specific feature.

## Test scenario catalog (cover all of these)

Treat this as the checklist of **what to test** for any web feature. For each feature under test,
walk the relevant categories below — don't stop at the happy path. Each item is a concrete check you
can drive with the tools above.

### A. Authentication & session
- [ ] Protected route while logged out → redirected to login (guard works).
- [ ] Successful login → lands on the intended page; user identity rendered.
- [ ] Logout → tokens cleared, protected routes blocked again.
- [ ] Token refresh on expiry → session continues without a hard logout.
- [ ] Expired/invalid token → graceful redirect, no infinite spinner.

### B. Navigation & routing
- [ ] Every nav entry routes to the correct page (and active nav item highlights — gotcha #2).
- [ ] Browser back/forward (`browser_navigate_back`) preserves expected state.
- [ ] Deep-link directly to a sub-route works when authenticated.
- [ ] Unknown route → 404 / not-found state, not a blank screen.

### C. Forms & input validation
- [ ] Required-field omitted → inline error + submit blocked (button disabled or 400 surfaced).
- [ ] Invalid format (email, number, date) → validation message; no bad write.
- [ ] Boundary values: 0, negative, very large, max-length, decimals/rounding.
- [ ] Special characters / emoji / RTL / very long strings don't break layout or persistence.
- [ ] Whitespace-only and trimming behavior.
- [ ] Submit button disabled state reflects form validity (verify via `className`/`disabled`).

### D. CRUD lifecycle (per entity)
- [ ] **Create** → entity appears in list/detail; server `POST` returns 2xx (gotcha #5).
- [ ] **Read** → detail view shows all fields correctly; computed fields correct.
- [ ] **Update** → edit flow persists; re-open/reload confirms (gotcha #6); `PUT` 2xx.
- [ ] **Delete** → entity removed; confirm dialog handled; cascade effects correct.
- [ ] Duplicate create / rapid double-submit doesn't create duplicates.

### E. Computed values & formatting
- [ ] Totals / subtotals / shares / balances match expected math (read via `browser_evaluate`).
- [ ] Currency formatting (NT$, decimals, thousands separators) per locale.
- [ ] Percentages and ratios; rounding edge cases sum back to the total.
- [ ] Sign handling (expense negative vs income positive) renders correctly.
- [ ] Date/time formatting and timezone.

### F. Lists, tables & filtering
- [ ] Empty state renders (no data) — friendly message, not a broken grid.
- [ ] Single item vs many items.
- [ ] Filtering / search narrows results correctly; clearing restores.
- [ ] Sorting toggles order (asc/desc) — verify first/last row.
- [ ] Pagination / infinite scroll loads more; counts correct.
- [ ] Large dataset (e.g. 1000 rows) stays responsive.

### G. Modals, dialogs & overlays
- [ ] Open → focus moves into modal; background inert.
- [ ] Confirm vs Cancel produce correct outcomes.
- [ ] Dismiss via backdrop / Esc (`browser_press_key: "Escape"`).
- [ ] Nested modals / re-open after close work; no stale refs (gotcha #1).
- [ ] Native dialogs handled with `browser_handle_dialog`.

### H. Async, loading & error states
- [ ] Loading spinner/skeleton appears, then resolves (`browser_wait_for` `text`/`textGone`).
- [ ] Backend 4xx → user-facing error message, no silent failure.
- [ ] Backend 5xx / network failure → error UI + retry path works.
- [ ] No unhandled console errors during the flow (`browser_console_messages` level error).

### I. Optimistic updates & rollback
- [ ] UI updates immediately on mutation (before server confirms).
- [ ] On server failure, the optimistic change **rolls back** to prior state.
- [ ] Concurrent mutations don't corrupt displayed state.

### J. Permissions, ownership & roles
- [ ] Non-owner cannot edit/delete another user's entity (action hidden or 403 surfaced).
- [ ] Admin vs plain member capabilities differ as designed.
- [ ] Default/shared resources (e.g. `user_id IS NULL` categories) behave for all users.
- [ ] Direct API-driven action from the wrong role is rejected (verify via network panel).

### K. Multi-entity / variant flows
- [ ] Behavior variants produce the right divergent results (equal vs proportional — see above).
- [ ] Multi-currency: amounts grouped per currency; no cross-currency summing.
- [ ] Item-level breakdowns (one record, multiple items split differently) compute correctly.
- [ ] Settlement / state-transition flows (e.g. "mark as paid") update status + activity feed.

### L. i18n / locale
- [ ] Switch zh ↔ en → all visible strings translate (no raw i18n keys leaking).
- [ ] Locale-dependent number/currency/date formats update.
- [ ] Layout survives longer translated strings (no overflow/clipping).

### M. Theming / dark mode
- [ ] Toggle light ↔ dark updates colors; preference persists across reload.
- [ ] Text/background contrast remains readable in both modes.
- [ ] No hard-coded colors break in dark mode (spot-check via `browser_evaluate` computed styles).

### N. Responsive / viewport
- [ ] `browser_resize` to mobile width → layout adapts (nav collapses, etc.).
- [ ] Desktop width → full layout.
- [ ] Touch/click targets reachable at small sizes.

### O. Persistence & re-entry
- [ ] Reload mid-flow → state restored from backend (not lost).
- [ ] Re-open detail after edit confirms persisted values.
- [ ] Second browser session / member sees the shared change (badges, activity feed).

### P. Files: upload / import / export
- [ ] `browser_file_upload` an image/CSV → preview + successful processing.
- [ ] Invalid file type/size rejected with a clear message.
- [ ] Export/download triggers and produces the expected content.

### Q. Accessibility basics
- [ ] Keyboard navigation (`Tab` / `Enter` via `browser_press_key`) reaches interactive elements.
- [ ] Focus visible and logical order.
- [ ] Snapshot exposes roles/labels for key controls.

> Not every feature needs every category — pick the categories that apply, but within a chosen
> category **exercise all its items**, including the failure and edge cases, not just the happy path.

## Reusable verification snippets

Copy-paste starting points for `browser_evaluate` (and a few tool calls). Adjust selectors to the
feature. Letters in brackets map to the catalog categories above.

```js
// [C] Form validity: is the submit button disabled, and what errors are shown?
() => {
  const submit = [...document.querySelectorAll('button[type=submit],button')]
    .find(b => /儲存|送出|新增|save|submit/i.test(b.textContent))
  const errors = [...document.querySelectorAll('[role=alert],.error,.text-error,[data-error]')]
    .map(e => e.textContent.trim()).filter(Boolean)
  return { disabled: submit?.disabled, classes: submit?.className, errors }
}
```

```js
// [B][M] Which nav item / toggle is active? (active state is in className, not the a11y tree)
() => [...document.querySelectorAll('a,button')]
  .filter(el => /active|primary|text-light-primary|selected/.test(el.className))
  .map(el => el.textContent.trim())
```

```js
// [E][K] Read computed money/share values and compare to expected math yourself
() => [...document.querySelectorAll('[data-member-share],[data-amount],.amount')]
  .map(n => ({ label: n.closest('[data-member]')?.dataset.member ?? null, text: n.textContent.trim() }))
```

```js
// [F] List health: row count, empty-state, current sort order
() => {
  const rows = [...document.querySelectorAll('[data-row],tbody tr,[role=row]')]
  const empty = document.querySelector('[data-empty],.empty-state')?.textContent.trim() ?? null
  const first = rows[0]?.textContent.trim(), last = rows.at(-1)?.textContent.trim()
  return { count: rows.length, empty, first, last }
}
```

```js
// [M] Dark mode: confirm the theme actually flipped the computed background
() => {
  const root = document.documentElement
  return { htmlClass: root.className, bg: getComputedStyle(document.body).backgroundColor }
}
```

```js
// [L] i18n: detect raw i18n keys leaking into the UI (untranslated)
() => [...document.querySelectorAll('body *')]
  .map(e => e.childNodes.length === 1 ? e.textContent.trim() : '')
  .filter(t => /^[a-z0-9]+(\.[a-z0-9_]+)+$/i.test(t))   // looks like "some.i18n.key"
```

```js
// [A] Inject a minted session before navigating (see Option A: mint with JWT_SECRET).
//     The access_token must be a real HS256 JWT (aud:'mone-web') signed with JWT_SECRET.
() => {
  localStorage.setItem('access_token', '<minted-token>')
  localStorage.setItem('refresh_token', 'dev')
}
```

**[H][D][J] Assert the network call fired and succeeded** — use `browser_network_requests`
(optionally `filter: "/api/.*split"`) then `browser_network_request` on the row to inspect the
payload/status. Confirm `POST`/`PUT`/`DELETE` returned 2xx (or the expected 4xx/403 for negative
permission tests), not just that the UI looked right.

**[H] Catch JS errors during the flow** — `browser_console_messages` with `level: "error"`; a passing
UI with console errors is a fail.

**[N] Responsive** — `browser_resize` to e.g. `390×844` (mobile) then `browser_snapshot`; confirm the
nav collapses / layout adapts. Resize back to desktop afterward.

**[O] Persistence** — after a write, `browser_navigate` to the same URL (or reload) and re-read the
values; they must come back from the backend, not component state.

**[P] File upload** — `browser_file_upload` with an absolute path to a fixture image/CSV, then
`browser_wait_for` the preview/success text.

## Reporting results

There is no committed artifact. Report back to the user:

- What flow was exercised (steps + concrete inputs/amounts).
- Expected vs actual for each computed value (cite the `browser_evaluate` reads).
- Screenshots (`browser_take_screenshot`) only when a visual is worth showing the human.
- Any console errors / failed network calls observed.
- Any preconditions seeded via API/DB (and why the UI couldn't create them).
- Clear PASS/FAIL per scenario, including the contrast variants.

## Promoting to an automated spec

If a verification is worth guarding against regressions, port it into the automated suite:

- Add `e2e/mone-web/<feature>.spec.ts` using the `moneWebTest` fixture (`mock-auth.fixture.ts`).
- **Mock** the API with `page.route(...)` + fixtures under `e2e/fixtures/mock-data/` — the automated
  suite must be deterministic and backend-independent.
- Use stable selectors (`getByTestId` / `getByRole`), not the brittle class-substring checks that are
  acceptable in interactive mode.
- Run with `pnpm test:e2e` (project `mone-web`, served via `vite preview` on :4173).

## Checklist

- [ ] In the correct **worktree** (not `main`).
- [ ] **Both** servers up: API (`wrangler dev --remote`, :8787) reachable **and** web (`pnpm dev:web`, :5173).
- [ ] Port conflict? Did **not** kill another session's server — started on a free port instead, and
      wired the frontend (`VITE_API_URL` + vite proxy) to the new API port if it was moved.
- [ ] Moved the web port? Added the new origin to the API `cors` allow-list (`src/*/api/src/index.ts`)
      so requests aren't CORS-blocked.
- [ ] Parallel session? Browser isolated (`--isolated` / distinct `--user-data-dir`) so profiles and
      injected auth tokens don't collide with another session.
- [ ] Data created/edited **through the browser UI**, not via API/DB shortcuts (preconditions only,
      noted in the report).
- [ ] Authenticated session established (mint a JWT with `JWT_SECRET`, or real login).
- [ ] Loop discipline: **fresh `browser_snapshot` before every interaction**.
- [ ] Computed values verified via `browser_evaluate`, not eyeballed.
- [ ] Active/styling state verified via `className`, not the a11y tree.
- [ ] Persistence confirmed (network 2xx + re-open/reload).
- [ ] All behavior **variants** exercised (contrast case).
- [ ] Results reported with expected vs actual per scenario.
- [ ] **Ports + CORS restored to defaults** — `git status` / `git diff` show no port/CORS changes before commit/PR.
- [ ] Considered whether to promote into an automated `e2e/` spec.
