---
name: release
description: |
  Prepare and publish a new version release for the AkaMoney repository.
  Handles version bumping across the npm workspaces, bilingual CHANGELOG
  generation, GitHub Release creation, production deployment monitoring,
  and cleanup.
  USE FOR: preparing a release, bumping version numbers, updating changelog,
  publishing a GitHub Release, version bump, tagging,
  "release X.Y.Z", "準備 release", "發佈新版本".
  DO NOT USE FOR: hotfix patches to a single package, general git operations,
  or re-deploying an already released version (use the manual workflow_dispatch
  path documented in docs/DEPLOYMENT.md).
argument-hint: 'Specify the target version, e.g. "1.5.0"'
---

# Release Workflow

End-to-end procedure for preparing and publishing an AkaMoney release. This updates version numbers across the npm workspaces, moves the changelog entry into a new version section in both languages, creates a GitHub Release with a tag, and then monitors the production deployment that the tag triggers.

## Repository shape

AkaMoney is an **npm workspaces** monorepo — not pnpm — with three separately deployed applications backed by one Cloudflare D1 schema:

| Workspace | Package | Deploys to |
|-----------|---------|-----------|
| `src/frontend` | `akamoney-frontend` | Cloudflare Pages (`akamoney-admin`) |
| `src/backend` | `akamoney-backend` | Admin API Cloudflare Worker |
| `src/redirect` | `akamoney-redirect` | Redirect Cloudflare Worker (serves real `aka.money` traffic) |

There is no mobile app, no Xcode project, no landing page and no user-facing `release-notes.json`. The **bilingual CHANGELOG is the user-visible release artifact**.

## Prerequisites

- On `main` with the latest changes pulled, and a clean working tree
- All features for this release already merged to `main`
- `gh` CLI authenticated
- **Node 24.x** — the repository declares `"node": ">=24.0.0"` and `.nvmrc` / `.node-version` both pin `24`. Confirm with `node -v` before installing; a different major will produce untrustworthy test results.
- These must be configured or the release **fails closed** partway through:
  - Variables `VITE_SENTRY_DSN`, `SENTRY_BACKEND_DSN`, `SENTRY_REDIRECT_DSN` — each is validated before its build or deploy step
  - `production` environment secret `SENTRY_AUTH_TOKEN` — the frontend deploy refuses to publish without uploading source maps
  - Secrets `CLOUDFLARE_API_TOKEN`, and `AZURE_STORAGE_SAS_TOKEN` when `STORAGE_PROVIDER` is Azure

> **Merging a pull request deploys nothing.** Only a SemVer tag push or a confirmed manual dispatch deploys production. Creating the GitHub Release in Step 10 is the point of no return.

## Procedure

### Step 0: Create a Worktree

Use the `git-worktree` skill to create a dedicated worktree for the release:

```bash
cd <main-repo-path>
git checkout main && git pull origin main
git worktree add ../worktree/release-<version> -b chore/release-<version> main
cd ../worktree/release-<version>
npm ci
```

`npm ci` is run **once at the repository root**; it installs all three workspaces from the single shared lockfile.

### Step 1: Identify Changes Since Last Release

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

Review the commits and sort them into the changelog categories used by this repository. Note that a commit may have shipped code without ever updating the changelog, so check the diff rather than trusting the existing `[Unreleased]` section to be complete:

```bash
git diff --stat $(git describe --tags --abbrev=0)..HEAD -- CHANGELOG.md CHANGELOG.zh-TW.md
```

### Step 2: Update ALL Version Numbers

Every version location listed in [references/version-files.md](./references/version-files.md) MUST be updated: four `package.json` files plus the five generated fields in `package-lock.json`.

Never hand-edit `package-lock.json`; regenerate it with `npm install --package-lock-only`, then verify the five project fields explicitly. **Do not grep the lockfile for the old version** — third-party packages legitimately share version numbers and editing them breaks `npm ci`.

Run the straggler scan from the reference. It is **not** expected to be empty: changelog history, the tag-format examples in `docs/DEPLOYMENT.md`, and the redirect Sentry test fixture are intentional exceptions documented in that file. Anything else is a real straggler.

### Step 3: Update BOTH CHANGELOG files

AkaMoney maintains a bilingual changelog. **Both files must be updated together** or the Traditional Chinese version silently falls behind:

- `CHANGELOG.md` (English)
- `CHANGELOG.zh-TW.md` (繁體中文)

Move the `[Unreleased]` / `[未發布]` content into a new version section following [Keep a Changelog](https://keepachangelog.com/):

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Security
- ...

### Documentation
- ...
```

Categories actually used by this repository: `Added`, `Changed`, `Fixed`, `Removed`, `Security`, `Documentation`, `Improved`, `Infrastructure`, `Configuration`, `Dependencies`. Use `Documentation`, **not** `Docs`. The Traditional Chinese headings are `新增`、`變更`、`修正`、`移除`、`安全性`、`文件`、`改進`、`基礎設施`、`配置`、`依賴項目`.

> **Layout warning.** In this repository the released versions are listed newest-first at the **top** of the file, but the `[Unreleased]` / `[未發布]` heading sits at the **bottom**, below `[1.0.0]`, and carries the `### Planned Features` / `### 計畫功能` roadmap. When releasing:
> 1. Insert the new `## [X.Y.Z] - YYYY-MM-DD` section at the **top**, immediately above the previous version.
> 2. Remove only the released subsections from the bottom `[Unreleased]` block.
> 3. **Keep** the `[Unreleased]` heading and its `Planned Features` roadmap in place — that roadmap is not part of any release.

### Step 4: Build and Test Verification

Run from the repository root on Node 24:

```bash
npm test          # frontend, backend and redirect Vitest suites
npm run build     # Vite production build + Wrangler dry-runs for both Workers
```

Type checks:

```bash
cd src/frontend && npx --no-install vue-tsc --noEmit
cd ../redirect  && npx --no-install tsc --noEmit
```

Coverage thresholds are 80% for frontend and backend. Use `npm run test:coverage` if a change could affect coverage.

> **`src/backend` typecheck is deliberately not part of this gate.** Its `tsconfig.json` sets `types: ["@cloudflare/workers-types"]` without `"node"`, while `include` covers `src/**/*` and the security tests use `process` and `node:` imports. `ci.yml` has never run a typecheck for any workspace, so this is a pre-existing gap tracked separately. **Never edit `tsconfig.json` or a test just to make a release gate pass** — that is an unrelated change smuggled into a release PR.

### Step 5: Commit and Push

```bash
git add -A
git commit -m "chore(release): bump version to X.Y.Z

- Update the four workspace package.json files to X.Y.Z
- Regenerate package-lock.json
- Add CHANGELOG.md and CHANGELOG.zh-TW.md entries for X.Y.Z

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
Copilot-Session: <session-id>"

git push origin chore/release-<version>
```

### Step 6: Create PR

Create a PR targeting `main` with title `chore(release): bump version to X.Y.Z`. The body should include the version updates summary, release highlights, and a link to the CHANGELOG section.

Do **not** apply any label: labels do not trigger deployment in this repository, and the PR merge itself deploys nothing.

### Step 7: Merge PR

> ⛔ **STOP — 合併前強制 Gate**：執行 merge 前，先把 release 內容回寫到 PR body（版本號、變更摘要、影響模組；有關聯 Issue 才同步、`Closes #N` 寫在 **PR body**），**測試 / 建構狀態等驗證產物用 comment 追加（append，不寫進 body）**，並**輸出「Pre-Merge Gate 確認」區塊**。**更新與 merge 分開執行**，任一項無法驗證即 STOP。詳見 `git-worktree` skill 的 Workflow 4.5。
>
> ```bash
> # 先讀現有 body，保留再更新（勿整段覆蓋）
> gh pr view <PR_NUMBER> --json body,url,closingIssuesReferences
> gh pr edit <PR_NUMBER> --body "<preserved body + release 摘要>"
> ```

Wait for CI, CodeQL and GitGuardian to pass, then merge with `--merge` (no-ff) and delete the branch:

```bash
gh pr merge <PR_NUMBER> --merge --delete-branch
```

### Step 8: Check D1 Migration Status

**Before creating the GitHub Release**, confirm the production D1 state. The release workflow **never** applies migrations — `release.yml` only ensures the database exists and injects its id.

Start with the credential-free pre-screen, which shows whether this release adds any migration:

```bash
git diff --name-status $(git describe --tags --abbrev=0)..HEAD -- src/backend/migrations
```

> This is only a **pre-screen**. An empty result proves this release adds nothing new; it cannot detect an older migration that was never applied to production. When in doubt, run the authoritative check below.

The authoritative check queries the remote database:

```bash
cd src/backend
npx --no-install wrangler d1 migrations list DB --remote
```

- Address the D1 binding as `DB`, **not** a database name.
- There is **no** `--env production`: neither `wrangler.toml` defines any `[env.*]` section.
- The tracked `wrangler.toml` ships `database_id = ""`, so a remote command needs the id supplied first — use a local `wrangler.local.toml` (`--config wrangler.local.toml`) or inject `CLOUDFLARE_D1_DATABASE_ID`.

> **Do not use the `db:*` scripts in `src/backend/package.json`.** They pass the database *name* `akamoney`, but `wrangler.toml` declares `database_name = "akamoney-clicks"` with binding `DB`. All three fail closed with `Couldn't find a D1 DB with the name or binding 'akamoney'` — `db:migrate:prod` and `db:shell` immediately, and `db:migrate` slightly later when it initialises the migrations table. They are simply broken, not a silent wrong-database risk, but they cannot be used for release verification.

**If migrations are pending**, applying them to production is a **destructive, irreversible operation**. Show the user exactly what would run and **obtain explicit confirmation first**. Never drop or delete a database.

### Step 9: Create the GitHub Release

This is the **point of no return**: creating the release pushes the tag, which triggers production deployment.

```bash
cd <main-repo-path>
git pull origin main
git rev-parse HEAD          # capture the exact merge commit SHA
```

Write the changelog section for this version to a file, then:

```bash
gh release create X.Y.Z \
  --title "X.Y.Z" \
  --notes-file <notes-file> \
  --target <exact-merge-commit-SHA>
```

- `--notes` or `--notes-file` is **required**: without it `gh` opens an editor and fails in a non-interactive shell. Prefer `--notes-file` to avoid PowerShell quoting problems.
- Use the **exact merge commit SHA**, not `--target main`. GitHub creates the tag from the target's state at call time, so if `main` advances in between (for example a Dependabot merge) the tag lands on an unintended commit — and the release resolver only checks mainline ancestry, so it would still deploy.
- The tag must be an exact `MAJOR.MINOR.PATCH`: **no `v` prefix and no suffix**. `prepare-release` rejects anything else, and the `production` environment only admits `main` and `*.*.*`.

### Step 10: Monitor the Deployment Until Success

⚠️ **The release is NOT complete until the workflow finishes successfully.** Do not proceed to cleanup, and do not report the release as done, while the run is in progress or has failed.

```bash
gh run list --limit 10
gh run watch <RUN_ID> --exit-status
```

> **Expect exactly one run: `Release`.** A tag push does **not** trigger CI or CodeQL — `ci.yml` only listens to `push` on `main`/`master` and to `pull_request`, and CodeQL runs on a weekly schedule. Their absence on a tag is normal; **do not wait for runs that will never appear.**

The three deploy jobs (`deploy-admin-api`, `deploy-redirect`, `deploy-frontend`) all declare `environment: production`, which has a **required reviewer**. They will pause in a `waiting` state until a human approves the deployment in the GitHub UI. **`waiting` is expected, not a failure.**

If the run fails:

```bash
gh run view <RUN_ID> --log-failed
gh run rerun <RUN_ID> --failed
gh run watch <RUN_ID> --exit-status
```

**Partial deployment is possible**: the three deploy jobs share one approval but can fail individually, leaving production on mixed versions. To roll back or re-push a specific commit, use the manual path — `workflow_dispatch` from `main` with the exact prior SHA and `confirm_production` typed as `DEPLOY_PRODUCTION`.

**Do not advance to cleanup until the run is green.** If a failure cannot be resolved, stop and report it rather than marking the release complete.

### Step 11: Post-Deployment Verification

Only after the run is confirmed green:

1. **Admin API**: hit the health endpoint and confirm a 200.
2. **Redirect**: confirm an active short code still returns 302, a missing one 404, and an expired one 410.
3. **Admin frontend**: confirm the Pages deployment loads.
4. **Sentry**: confirm the three projects receive events tagged with the `production` environment.
5. **Source-map symbolication**: trigger a benign error in the deployed Admin UI and confirm the Sentry stack trace resolves to original filenames and line numbers. If there is no benign error path available, instead verify that the release's uploaded artifact bundle / debug ids match the deployed assets. **Never deploy fake-error code just to test this.**

### Step 12: Cleanup

```bash
cd <main-repo-path>
git worktree remove ../worktree/release-<version>
git branch -d chore/release-<version>
git worktree prune
```

## CI/CD Deployment Map

| Workflow | Trigger | Deploys | Migration |
|----------|---------|---------|-----------|
| `release.yml` → `prepare-release` | SemVer tag push, or `workflow_dispatch` from `main` with typed confirmation | Nothing — validates and pins the immutable mainline SHA | N/A |
| `release.yml` → `build` | After validation | Nothing — builds the frontend and dry-runs both Workers | N/A |
| `release.yml` → `deploy-admin-api` | After build, `environment: production` | Admin API Worker | **Manual** |
| `release.yml` → `deploy-redirect` | After build, `environment: production` | Redirect Worker | **Manual** |
| `release.yml` → `deploy-frontend` | After build, `environment: production` | Cloudflare Pages + Sentry source maps | N/A |
| `ci.yml` | Push to `main`/`master`, and pull requests | Nothing — tests and builds only. **Not triggered by tags.** | N/A |

⚠️ **D1 migrations are NEVER applied by CI/CD.** They must be run manually, and only after explicit user confirmation.

## Related Files

| File | Purpose |
|------|---------|
| `CHANGELOG.md` / `CHANGELOG.zh-TW.md` | Bilingual changelog — the user-visible release artifact |
| `.github/workflows/release.yml` | The production release pipeline |
| `.github/scripts/resolve-release-ref.mjs` | Trusted resolver that validates the release ref against mainline |
| `src/backend/migrations/*.sql` | D1 database migrations |
| `docs/DEPLOYMENT.md` / `.zh-TW.md` | Trust boundary, environment policy, manual fallback procedures |
| `docs/MONITORING.md` / `.zh-TW.md` | Sentry monitoring, source-map flow, privacy boundaries |
| [Version files reference](./references/version-files.md) | Complete list of version locations |
