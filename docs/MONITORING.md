English | [繁體中文](MONITORING.zh-TW.md)

# AkaMoney Monitoring with Sentry

This guide documents the AkaMoney Sentry monitoring setup. It intentionally contains no DSN values, auth tokens, or production secrets.

## Scope and current verification status

| Service | Sentry project | Runtime | Current verified status |
| --- | --- | --- | --- |
| Frontend management SPA | `akamoney-web` | Vue 3 on Vite / Cloudflare Pages | Local SDK verification produced Issues, Logs, and Traces. Error-only Replay is configured but controlled by `VITE_SENTRY_REPLAY_ENABLED`. |
| Admin API Worker | `akamoney-api` | Hono on Cloudflare Workers | Local SDK verification produced Issues, Logs, and Traces. |
| Redirect Worker | `akamoney-redirect` | Hono on Cloudflare Workers | Local SDK verification produced Issues, Logs, and Traces. |

Production deployment and production source-map symbolication are not claimed here. The first production release still must verify that a minified frontend stack frame resolves back to source after source-map upload.

## Feature matrix

| Capability | Frontend `akamoney-web` | Admin API `akamoney-api` | Redirect `akamoney-redirect` | Evidence |
| --- | --- | --- | --- | --- |
| Issues / errors | `@sentry/vue` initializes when `VITE_SENTRY_DSN` is non-empty. | `@sentry/cloudflare` wraps the Worker handler. | `@sentry/cloudflare/nodejs_compat` wraps the Worker handler. | `src\frontend\src\utils\sentry.ts:18-31`; `src\backend\src\index.ts:731`; `src\redirect\src\index.ts:73-78`; Sentry Vue docs: https://docs.sentry.io/platforms/javascript/guides/vue/; Sentry Cloudflare docs: https://docs.sentry.io/platforms/javascript/guides/cloudflare/ |
| Logs | SDK logs are enabled, and console `warn`/`error` are captured. | SDK logs are enabled, and console `log`/`warn`/`error` are captured. | SDK logs are enabled, and console `log`/`warn`/`error` are captured. | `src\frontend\src\utils\sentry.ts:36-39`; `src\backend\src\services\sentry.ts:106-112`; `src\redirect\src\sentry.ts:116-123`; Sentry Logs docs: https://docs.sentry.io/platforms/javascript/guides/vue/logs/ |
| Tracing sample rate | Production builds sample 20%; development samples 100% for local diagnostics. | 20%. | 1%. | `src\frontend\src\utils\sentry.ts:40`; `src\backend\src\services\sentry.ts:105`; `src\redirect\src\sentry.ts:114` |
| Replay | Error-only Replay: normal sessions 0%, error sessions 100% unless `VITE_SENTRY_REPLAY_ENABLED=false`. | N/A. | N/A. | `src\frontend\src\utils\sentry.ts:35`; `src\frontend\src\utils\sentry.ts:42-43`; Sentry Replay docs: https://docs.sentry.io/platforms/javascript/guides/vue/session-replay/ |
| Cloudflare Workers Logs | N/A. | Wrangler observability is enabled. | Wrangler observability is enabled. | `src\backend\wrangler.toml:13-15`; `src\redirect\wrangler.toml:13-15`; Cloudflare Workers Logs docs: https://developers.cloudflare.com/workers/observability/logs/workers-logs/ |
| Worker source maps and version metadata | Frontend hidden source maps are uploaded by the protected deploy flow only. | `upload_source_maps = true` and `CF_VERSION_METADATA` binding are configured. | `upload_source_maps = true` and `CF_VERSION_METADATA` binding are configured. | `src\frontend\vite.config.ts:9-25`; `src\backend\wrangler.toml:8-11`; `src\redirect\wrangler.toml:8-11`; Sentry source maps docs: https://docs.sentry.io/platforms/javascript/sourcemaps/; Cloudflare Worker source maps docs: https://developers.cloudflare.com/workers/observability/source-maps/; Cloudflare version metadata docs: https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/ |

## Local behavior

- Leaving a Sentry DSN empty is a no-op: the frontend returns before `Sentry.init`, while Workers pass `undefined` to the SDK when `SENTRY_DSN` is empty (`src\frontend\src\utils\sentry.ts:23-26`; `src\backend\src\services\sentry.ts:102`; `src\redirect\src\sentry.ts:111`).
- Frontend telemetry user-context failures must not affect authentication. `setSentryUser` and `clearSentryUser` catch Sentry/hash failures and only log a safe warning (`src\frontend\src\utils\sentry.ts:52-75`; `src\frontend\src\stores\auth.ts:47-74`).
- Local verification may use local `.env` / `wrangler.local.toml` copies, but those files must remain ignored and must not be committed.

## Privacy and data handling

| Area | Current behavior | Remaining implication |
| --- | --- | --- |
| PII mode | `sendDefaultPii: true` is selected for all three SDKs to keep Sentry's default/permissive context available (`src\frontend\src\utils\sentry.ts:32`; `src\backend\src\services\sentry.ts:107`; `src\redirect\src\sentry.ts:117`). | Treat Sentry as an authorized operational telemetry destination; do not add business secrets to logs or error messages. |
| User identity | The frontend hashes the Microsoft Entra account ID with SHA-256 before calling `Sentry.setUser({ id })` (`src\frontend\src\utils\sentry.ts:52-61`). | The hash is stable and pseudonymous, not anonymous if the original identifier is available elsewhere. |
| Credential headers | `authorization`, `x-api-key`, and `cookie` headers are scrubbed from backend and redirect Sentry events/spans (`src\backend\src\services\sentry.ts:4-80`; `src\redirect\src\sentry.ts:8-104`). | Continue to avoid adding credentials to custom tags, breadcrumbs, or log messages. |
| Replay | Sentry Replay default masking is used; normal session sampling is 0% and error-session sampling is controlled by `VITE_SENTRY_REPLAY_ENABLED`. | Console entries attached to a Replay or event can still contain user-visible provider messages. |
| Tokens and DSNs | Never log auth tokens, Entra bearer tokens, SAS tokens, x-api-key values, cookies, or literal Sentry DSN values. | Use GitHub variables/secrets and local ignored files; examples below use environment variable names only. |

Sentry Replay's default masking behavior is documented at https://docs.sentry.io/platforms/javascript/guides/vue/session-replay/. Sentry auth-token handling guidance is documented at https://docs.sentry.io/account/auth-tokens/.

## GitHub and runtime configuration

| Name | GitHub storage | Runtime target | Purpose | Notes |
| --- | --- | --- | --- | --- |
| `VITE_SENTRY_DSN` | Repository variable | Frontend build env | Public DSN for `akamoney-web`. | Empty locally disables the SDK. Do not paste the value into docs, logs, or commits. |
| `VITE_SENTRY_REPLAY_ENABLED` | Repository variable | Frontend build env | Enables error-session Replay unless set to `false`. | Normal Replay sessions stay at 0%; error sessions are 100% when enabled. |
| `SENTRY_BACKEND_DSN` | Repository variable | Admin API deploy workflow | Injected into the Worker `SENTRY_DSN` var for `akamoney-api`. | Release workflow validates the DSN before deployment changes. |
| `SENTRY_REDIRECT_DSN` | Repository variable | Redirect deploy workflow | Injected into the Worker `SENTRY_DSN` var for `akamoney-redirect`. | Release workflow validates the DSN before deployment changes. |
| `SENTRY_AUTH_TOKEN` | Production environment secret | Protected frontend deploy job only | Authenticates `sentry-cli` source-map inject/upload. | Must not be available to the untrusted PR-head build job. |

Recommended guardrails:

1. Keep `SENTRY_AUTH_TOKEN` in a protected GitHub `production` environment with at least one required reviewer before the job can access it.
2. Use a token dedicated to source-map upload. Sentry's Vite source-map guide documents Organization Tokens, or Personal Tokens with `Project: Read & Write` and `Release: Admin` permissions: https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite/.
3. Do not grant issue write, member, or admin privileges to the source-map token unless a future workflow has a documented need.
4. Rotate the token if it is ever exposed in a log, local shell history, or copied configuration file.

## Secure source-map flow

1. The release workflow's untrusted PR-head build receives public DSN variables but deliberately does not receive `SENTRY_AUTH_TOKEN` (`.github\workflows\release.yml:61-66`).
2. Hidden frontend source maps are generated by the Vite production build (`src\frontend\vite.config.ts:10-12`).
3. The protected deploy job receives `SENTRY_AUTH_TOKEN` only after environment protection passes (`.github\workflows\release.yml:862-874`).
4. The protected job runs `sentry-cli sourcemaps inject` and `sentry-cli sourcemaps upload` against the already-built frontend artifact (`.github\workflows\release.yml:883-891`).
5. The workflow deletes `.map` files and checks that none remain before Cloudflare Pages deploy (`.github\workflows\release.yml:892-921`).

Do not state that production source maps are verified until the first production release confirms symbolication in Sentry.

## Uptime and alerts

| Item | Value |
| --- | --- |
| Uptime detector | `9690376` |
| Checked URL | https://aka.money/health |
| Interval / timeout | 60 seconds / 5 seconds |
| Down / recovery thresholds | 3 failed checks to mark down; 1 successful check to recover |
| First outage notification | Default high-priority email |
| Regression workflow | `3926857` |
| Email fallback | `ActiveMembers` |

Sentry Uptime Monitoring documentation: https://docs.sentry.io/product/monitors-and-alerts/monitors/uptime-monitoring/. Sentry alert documentation: https://docs.sentry.io/product/monitors-and-alerts/alerts/.

## Read-only operational examples

Set these variables in your shell without echoing token values:

```powershell
$env:SENTRY_BASE_URL = "https://sentry.io"
$env:SENTRY_ORG = "<org-slug>"
$env:SENTRY_AUTH_TOKEN = "<set-in-shell-or-secret-store>"
$env:SENTRY_UPTIME_DETECTOR_ID = "9690376"
```

List projects with `sentry-cli`:

```powershell
node_modules\.bin\sentry-cli.cmd projects list --org $env:SENTRY_ORG --auth-token $env:SENTRY_AUTH_TOKEN
```

Query unresolved issues for each AkaMoney project:

```powershell
node_modules\.bin\sentry-cli.cmd issues list --org $env:SENTRY_ORG --project akamoney-web --query "is:unresolved" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
node_modules\.bin\sentry-cli.cmd issues list --org $env:SENTRY_ORG --project akamoney-api --query "is:unresolved" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
node_modules\.bin\sentry-cli.cmd issues list --org $env:SENTRY_ORG --project akamoney-redirect --query "is:unresolved" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
```

Query Logs with `sentry-cli`:

```powershell
node_modules\.bin\sentry-cli.cmd logs list --org $env:SENTRY_ORG --project akamoney-api --query "level:error" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
```

Query organization usage stats through the Sentry API:

```powershell
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/stats_v2/?statsPeriod=24h&interval=1h&groupBy=project&groupBy=category&field=sum(quantity)"
```

Query errors, logs, spans, or uptime checks through Explore table APIs:

```powershell
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/events/?dataset=errors&project=akamoney-web&query=is:unresolved&statsPeriod=24h&field=title&field=timestamp&per_page=25"
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/events/?dataset=logs&project=akamoney-api&query=level:error&statsPeriod=24h&field=message&field=timestamp&per_page=25"
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/events/?dataset=spans&project=akamoney-redirect&statsPeriod=24h&field=span.op&field=timestamp&per_page=25"
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/events/?dataset=uptime_results&query=detector_id:$env:SENTRY_UPTIME_DETECTOR_ID&statsPeriod=24h&field=timestamp&field=uptime.status&per_page=25"
```

The Sentry CLI is documented at https://docs.sentry.io/cli/. The Explore API datasets are documented at https://docs.sentry.io/api/explore/query-explore-events-in-table-format/. Pricing and quota categories are documented at https://docs.sentry.io/pricing/.

## Verification and troubleshooting checklist

### Before deployment

- Confirm `VITE_SENTRY_DSN`, `SENTRY_BACKEND_DSN`, and `SENTRY_REDIRECT_DSN` are configured as repository variables and contain no whitespace.
- Confirm `VITE_SENTRY_REPLAY_ENABLED` is set intentionally; use `false` to disable error Replay without removing the integration.
- Confirm `SENTRY_AUTH_TOKEN` exists only in the protected production environment and requires reviewer approval.
- Confirm local examples use empty DSN defaults or ignored local files; never commit concrete DSNs or tokens.
- Confirm release workflow logs do not print DSN or token values.

### After local SDK verification

- Issues, Logs, and Traces have been produced locally in all three Sentry projects.
- Do not infer production health from local SDK verification.

### After first production release

- Open the first frontend production error and verify source-map symbolication. This is the only post-release check still pending in this documentation.
- Confirm Cloudflare Workers Logs show admin and redirect Worker invocations/errors as expected.
- Confirm uptime detector `9690376` still targets https://aka.money/health and its thresholds match this document.

### Troubleshooting

| Symptom | Checks |
| --- | --- |
| No frontend events | Confirm `VITE_SENTRY_DSN` is non-empty for the build, the build was redeployed, and browser network blocking is not preventing Sentry ingestion. |
| No Worker events | Confirm the deployed Worker has non-empty `SENTRY_DSN`, `ENVIRONMENT`, observability enabled, and no release workflow DSN validation failure. |
| No logs | Confirm SDK `enableLogs` is true and query the correct Sentry project/dataset. |
| Replay missing | Confirm `VITE_SENTRY_REPLAY_ENABLED` is not `false`; remember normal sessions are intentionally sampled at 0%. |
| Source maps missing after deploy | Confirm the protected job ran `sentry-cli sourcemaps inject/upload`; do not deploy artifacts that still contain `.map` files. |
| Unexpected PII | Check logs, custom breadcrumbs, exception messages, and provider console text; scrub upstream messages rather than relying only on SDK defaults. |
