# Version Files Reference

All files that contain the AkaMoney version number and must be updated during a release. This is the single source of truth — if a file is missing from this list, it will be missed during releases.

AkaMoney is an **npm workspaces** monorepo with three applications. There is no pnpm, no mobile app and no Xcode project.

## Package JSON Files (4 total)

All use `"version": "X.Y.Z"` format and must all be updated together.

| File | Package Name | Role |
|------|-------------|------|
| `package.json` (root) | `akamoney` | Workspace root |
| `src/frontend/package.json` | `akamoney-frontend` | Vue 3 management SPA |
| `src/backend/package.json` | `akamoney-backend` | Admin API Worker |
| `src/redirect/package.json` | `akamoney-redirect` | Public redirect Worker |

### Update command

Run from the repository root. This preserves key order and the trailing newline:

```bash
node -e "
const fs=require('fs');
const files=['package.json','src/frontend/package.json','src/backend/package.json','src/redirect/package.json'];
for(const f of files){
  const raw=fs.readFileSync(f,'utf8');
  const nl=raw.endsWith('\n');
  const p=JSON.parse(raw);
  const before=p.version;
  p.version='<VERSION>';
  fs.writeFileSync(f, JSON.stringify(p,null,2)+(nl?'\n':''));
  console.log(f+': '+before+' -> '+p.version);
}
"
```

## Lockfile (generated — never hand-edit)

`package-lock.json` is a **single root lockfile** shared by all three workspaces. It contains the version in **five** places:

| Location | Meaning |
|----------|---------|
| top-level `.version` | Root project version |
| `packages[""].version` | Root workspace |
| `packages["src/frontend"].version` | Frontend workspace |
| `packages["src/backend"].version` | Backend workspace |
| `packages["src/redirect"].version` | Redirect workspace |

Regenerate it with npm — do not edit it by hand:

```bash
npm install --package-lock-only
```

Verify exactly those five fields, rather than grepping the whole file:

```bash
node -e "
const l=require('./package-lock.json');
console.log('top-level =', l.version);
for (const k of ['','src/frontend','src/backend','src/redirect']) console.log(JSON.stringify(k)+' =', l.packages[k].version);
"
```

> **Do not grep the lockfile for the old version string.** Third-party packages legitimately carry the same version number. At 1.3.0 the lockfile contained eight `"version": "1.3.0"` lines, and three of them belonged to `es-errors`, `get-intrinsic` and `tinyexec`. Editing those breaks integrity and makes `npm ci` fail in CI and in the release workflow.

## Files That Do NOT Need Manual Updates

| File | Reason |
|------|--------|
| `src/backend/wrangler.toml`, `src/redirect/wrangler.toml` | No version field. |
| `src/redirect/src/__tests__/sentry.test.ts` | The `release:` values are a **self-consistent test fixture** (the input event and the expected output both carry the same literal). It verifies that the Sentry allowlist preserves the `release` field and never reads `package.json`, so a version bump neither breaks it nor requires changing it. The straggler scan below will match it — that is expected. |
| `CHANGELOG.md`, `CHANGELOG.zh-TW.md` | Older version headings are history and must be preserved. |
| `docs/DEPLOYMENT.md`, `docs/DEPLOYMENT.zh-TW.md` | The `git tag 1.3.0` occurrences are worked examples of the tag *format*, not version declarations. |
| `.github/workflows/release.yml` | The version in the header comment is a format example. |
| Sentry `release` tags at runtime | Both Workers get their Sentry release from the `CF_VERSION_METADATA` binding (a Cloudflare Worker version id), and frontend source maps are correlated by debug id. Neither reads `package.json`. |

## Verification scan

Run from the repository root after updating. AkaMoney has no `pnpm-lock.yaml`, no `.pbxproj` and no `ai-benchmark` directory, so those exclusions are unnecessary here.

```powershell
$old = '<OLD_VERSION>'
Get-ChildItem -Recurse -File |
  Where-Object {
    $_.FullName -notlike '*node_modules*' -and
    $_.FullName -notlike '*\dist\*' -and
    $_.FullName -notlike '*\.git\*' -and
    $_.FullName -notlike '*\.wrangler\*' -and
    $_.Name -ne 'package-lock.json' -and
    $_.Extension -match '\.(json|toml|ts|tsx|js|mjs|vue|md|yml|yaml)$'
  } |
  ForEach-Object { Select-String -Path $_.FullName -Pattern ([regex]::Escape($old)) -ErrorAction SilentlyContinue } |
  ForEach-Object { "$($_.Path):$($_.LineNumber)" }
```

The scan is **not** expected to be empty. Every remaining hit must be one of the intentional exceptions in the table above — changelog history, the tag-format examples, and the redirect Sentry test fixture. Anything else is a real straggler and must be updated.
