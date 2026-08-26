---
name: release
description: |
  Prepare and publish a new version release for the Monē monorepo.
  Handles version bumping across all packages, CHANGELOG generation,
  user-facing release notes, GitHub Release creation, and cleanup.
  USE FOR: preparing a release, bumping version numbers, updating changelog,
  creating release notes, publishing a GitHub Release, version bump, tagging,
  "release X.Y.Z", "準備 release", "發佈新版本".
  DO NOT USE FOR: hotfix patches to a single package, general git operations,
  or deployment to Cloudflare/App Store (see deployment docs).
argument-hint: 'Specify the target version, e.g. "0.9.28"'
---

# Release Workflow

End-to-end procedure for preparing and publishing a Monē release. This is a multi-step workflow that updates version numbers across the entire monorepo, generates changelogs and user-facing release notes, and creates a GitHub Release with a tag.

## Prerequisites

- Must be on `main` branch with latest changes pulled
- All features for this release must already be merged to `main`
- `gh` CLI must be authenticated

## Procedure

### Step 0: Create a Worktree

Use the `git-worktree` skill to create a dedicated worktree for the release:

```bash
cd <main-repo-path>
git checkout main && git pull origin main
git worktree add ../worktree/release-<version> -b chore/release-<version> main
cd ../worktree/release-<version>
pnpm install
```

### Step 1: Identify Changes Since Last Release

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

Review the commits identify what goes into `Added`, `Changed`, `Fixed`, `Removed`, `Docs` categories.

### Step 2: Update ALL Version Numbers

This is the most error-prone step. Every version file listed in [references/version-files.md](./references/version-files.md) MUST be updated.

**Scan for stragglers after updating:**

```powershell
# Replace X.Y.Z with the OLD version(s) to search for
$files = Get-ChildItem -Recurse -File |
  Where-Object { $_.FullName -notlike "*node_modules*" -and $_.FullName -notlike "*dist*" -and $_.FullName -notlike "*.git*" -and $_.FullName -notlike "*pnpm-lock*" -and $_.FullName -notlike "*package-lock*" -and $_.FullName -notlike "*release-notes*" -and $_.FullName -notlike "*CHANGELOG*" -and $_.FullName -notlike "*ai-benchmark*" -and $_.Extension -match "\.(json|toml|ts|tsx|js|pbxproj)$" }
$files | ForEach-Object {
  Select-String -Path $_.FullName -Pattern '"<OLD_VERSION>"|= <OLD_VERSION>' -ErrorAction SilentlyContinue
} | Format-Table Path, LineNumber, Line -AutoSize
```

If this scan returns any results, those files still need updating. Repeat until clean.

### Step 3: Update CHANGELOG.md

Move `[Unreleased]` content into a new version section following [Keep a Changelog](https://keepachangelog.com/):

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Docs
- ...
```

Categories: `Added`, `Changed`, `Fixed`, `Removed`, `Docs`

### Step 4: Generate User-Facing Release Notes

The user-facing release notes are bilingual (zh-TW / en), simplified for general users. They live in `release-notes.json`.

#### Content Rules

- **Audience**: General users, not developers
- **Tone**: Friendly, concise, positive
- **Forbidden terms**: API, DB, schema, middleware, refactor, endpoint, cache, Worker, D1, R2, migration, deploy, CI/CD, PR, Issue, commit, build
- **Categories**: `new` (新功能), `improved` (改進), `fixed` (修正)

#### Process

1. Write a draft JSON matching this schema and save to `scripts/draft-release-note.json`:

```json
{
  "version": "X.Y.Z",
  "date": "YYYY-MM-DD",
  "highlight": {
    "zh-TW": "主要亮點摘要 emoji",
    "en": "Main highlight summary emoji"
  },
  "changes": [
    {
      "type": "new|improved|fixed",
      "zh-TW": "使用者友善的中文描述",
      "en": "User-friendly English description"
    }
  ]
}
```

2. Apply the draft:

```bash
npm run release-notes:apply
```

3. Sync to landing page:

```bash
cp src/mone-web/web/public/release-notes.json src/landing/public/release-notes.json
```

4. Review the output in `src/mone-web/web/public/release-notes.json` before committing.

### Step 5: Build Verification

Run build to ensure nothing is broken:

```bash
pnpm --filter @mone/web build
```

### Step 6: Commit and Push

```bash
git add -A
git commit -m "chore(release): bump version to X.Y.Z

- Update all package.json files to X.Y.Z
- Update iOS MARKETING_VERSION in project.pbxproj
- Update mobile version.ts constants
- Add CHANGELOG.md entry for X.Y.Z
- Generate user-facing release notes (zh-TW / en)"

git push origin chore/release-<version>
```

### Step 7: Create PR

Create a PR targeting `main` with title `chore(release): bump version to X.Y.Z`.

The PR body should include:
- Version updates summary (which files were updated)
- Release highlights
- Link to CHANGELOG section

### Step 8: Merge PR

> ⛔ **STOP — 合併前強制 Gate**：執行 merge 前，先把 release 內容回寫到 PR body（版本號、變更摘要、影響模組；有關聯 Issue 才同步、`Closes #N` 寫在 **PR body**），**測試 / 建構狀態等驗證產物用 comment 追加（append，不寫進 body）**，並**輸出「Pre-Merge Gate 確認」區塊**。**更新與 merge 分開執行**，任一項無法驗證即 STOP。詳見 `general.instructions.md` 的「🚦 合併前強制 Gate」與 `git-worktree` Workflow 4.5。
>
> ```bash
> # 先讀現有 body，保留再更新（勿整段覆蓋）
> gh pr view <PR_NUMBER> --json body,url,closingIssuesReferences
> gh pr edit <PR_NUMBER> --body "<preserved body + release 摘要>"
> ```

通過上方 Gate 後，merge with `--merge` (no-ff) and delete the branch:

```bash
gh pr merge <PR_NUMBER> --merge --delete-branch
```

### Step 9: Check D1 Migration Status

**Before creating the GitHub Release**, compare the Production D1 migration state against local migration files. The CI/CD pipeline does NOT auto-run migrations — they must be applied manually.

```bash
cd src/mone-web/api

# 1. List remote PROD migration status
npx wrangler d1 migrations list mone-db --env production --remote

# 2. List local migration files
ls migrations/*.sql

# 3. If there are pending migrations, query the full history for comparison
npx wrangler d1 execute mone-db --env production --remote \
  --command "SELECT * FROM d1_migrations ORDER BY id"
```

**If migrations are pending** (wrangler shows "Migrations to be applied"):

```bash
# Apply to PROD — requires confirmation from user before executing
npx wrangler d1 migrations apply mone-db --env production --remote
```

⚠️ **Always ask the user for confirmation before applying migrations to production.**

**If no migrations are pending**: Proceed directly to the next step.

### Step 10: Create GitHub Release

Pull the merged main, then create the release. This triggers CI/CD:

- **`release-prod.yml`**: Deploys mone-web (API Worker + Web frontend) and scheduler to production (triggered by tag push)
- **`landing-release.yml`**: Deploys landing page to production (triggered by tag push)
- **`admin-portal-release.yml`**: Admin portal (manual trigger only via `workflow_dispatch`)

```bash
cd <main-repo-path>
git pull origin main

gh release create X.Y.Z \
  --title "X.Y.Z" \
  --notes "<CHANGELOG content for this version>" \
  --target main
```

### Step 11: Monitor CI/CD Until Success

⚠️ **The release is NOT complete until every triggered workflow finishes successfully.** Creating the GitHub Release only *triggers* deployment — you must actively monitor the runs to completion and confirm they all pass. Do not proceed to cleanup, and do not report the release as done, while any run is still in progress or has failed.

1. **Identify the runs triggered by the tag.** Give Actions a few seconds to register the runs, then list them:

   ```bash
   gh run list --limit 10
   ```

   The tag push triggers `release-prod.yml` and `landing-release.yml`. Identify their run IDs (status `in_progress` or `queued`, matching the new tag/commit).

2. **Watch each triggered run until it completes.** Use `gh run watch`, which blocks until the run finishes and exits non-zero if the run fails:

   ```bash
   # Repeat for every run ID triggered by the release tag
   gh run watch <RUN_ID> --exit-status
   ```

   `--exit-status` makes the command fail when the run concludes in failure, so a non-zero exit is an unambiguous signal that the release deployment broke.

3. **Confirm final conclusions are all `success`:**

   ```bash
   gh run list --limit 10
   ```

   Every release-triggered workflow must show `completed` / `success`.

4. **If any run fails:**
   - Inspect the failing job logs to diagnose the cause:

     ```bash
     gh run view <RUN_ID> --log-failed
     ```

   - Fix the underlying issue (re-deploy, apply a missing migration, patch config, etc.).
   - Re-run the failed jobs and continue monitoring until they pass:

     ```bash
     gh run rerun <RUN_ID> --failed
     gh run watch <RUN_ID> --exit-status
     ```

   - **Do not advance to cleanup until all runs are green.** If a failure cannot be resolved automatically, stop and report the failing run to the user instead of marking the release complete.

### Step 12: Post-Deployment Verification

Only after **all** CI/CD runs are confirmed green:

1. **Check deployment status**: Re-confirm every release workflow shows `success` (`gh run list`).
2. **Smoke test**: Hit the production API to confirm it's responding.
3. **Verify migration state** (if migrations were applied): Confirm the new schema is active.

### Step 13: Cleanup

```bash
cd <main-repo-path>
git worktree remove ../worktree/release-<version>
git branch -d chore/release-<version>
git worktree prune
```

## CI/CD Deployment Map

Understanding what gets deployed and how:

| Workflow | Trigger | Deploys | Migration |
|----------|---------|---------|-----------|
| `release-prod.yml` | Tag push (e.g. `0.9.27`) | mone-api Worker, mone-web Pages, scheduler Worker | **Manual** |
| `landing-release.yml` | Tag push | Landing page (Cloudflare Pages) | N/A |
| `admin-portal-release.yml` | `workflow_dispatch` only | Admin Portal API + Web | **Manual** |
| `release-test.yml` | Push to `test` branch | Test environment | **Manual** |

⚠️ **D1 migrations are NEVER auto-applied by CI/CD.** They must be run manually via `wrangler d1 migrations apply` before or after deployment.

## Related Files

| File | Purpose |
|------|---------|
| `CHANGELOG.md` | Developer changelog (Keep a Changelog format) |
| `src/mone-web/web/public/release-notes.json` | User-facing bilingual release notes |
| `src/landing/public/release-notes.json` | Landing page copy of release notes |
| `scripts/generate-release-notes.mjs` | Script to generate prompt / apply draft |
| `scripts/draft-release-note.json` | AI-generated draft (not committed) |
| `src/mone-web/api/migrations/*.sql` | D1 database migrations |
| [Version files reference](./references/version-files.md) | Complete list of files containing version numbers |
