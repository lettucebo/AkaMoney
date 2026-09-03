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
| Issues / errors | `@sentry/vue` initializes when `VITE_SENTRY_DSN` is non-empty. | `@sentry/cloudflare` wraps the Worker handler. | `@sentry/cloudflare/nodejs_compat` wraps the Worker handler. | `src/frontend/src/utils/sentry.ts:21-34`; `src/backend/src/index.ts:731`; `src/redirect/src/index.ts:78-81`; [Sentry Vue docs](https://docs.sentry.io/platforms/javascript/guides/vue/); [Sentry Cloudflare docs](https://docs.sentry.io/platforms/javascript/guides/cloudflare/) |
| Logs | SDK logs are enabled, and console `warn`/`error` are captured. | SDK logs are enabled, and console `log`/`warn`/`error` are captured. | SDK logs are enabled, and console `log`/`warn`/`error` are captured. | `src/frontend/src/utils/sentry.ts:39-42`; `src/backend/src/services/sentry.ts:105-117`; `src/redirect/src/sentry.ts:182-190`; [Sentry Logs docs](https://docs.sentry.io/platforms/javascript/guides/vue/logs/) |
| Background analytics failures | N/A. | N/A. | A failed `click_records` write is reported through the Sentry client captured while the request scope was still active: exactly one native `console.error`, one issue tagged `background_operation=redirect.click_recording`, and one Sentry log. Reporting never rejects `waitUntil`, never flushes inline, and never changes the 302. | `src/redirect/src/index.ts:46-60`; `src/redirect/src/services.ts:12-47`; `src/redirect/src/sentry.ts:250-338`; `src/redirect/src/observability.ts:11-23` |
| Tracing sample rate | Production builds sample 20%; development samples 100% for local diagnostics. | 20%. | 1%. | `src/frontend/src/utils/sentry.ts:43`; `src/backend/src/services/sentry.ts:109`; `src/redirect/src/sentry.ts:180` |
| Replay | Error-only Replay: normal sessions 0%, error sessions 100% unless `VITE_SENTRY_REPLAY_ENABLED` is `false` (trimmed and case-insensitive). List, analytics, and stats elements that render a customer `original_url` carry `data-sentry-block`. | N/A. | N/A. | `src/frontend/src/utils/sentry.ts:18-19`; `src/frontend/src/utils/sentry.ts:38`; `src/frontend/src/utils/sentry.ts:45-46`; `src/frontend/src/components/dashboard/UrlTable.vue:22`; `src/frontend/src/views/AnalyticsView.vue:32-40`; `src/frontend/src/views/OverallStatsView.vue:49`; [Sentry Replay docs](https://docs.sentry.io/platforms/javascript/guides/vue/session-replay/) |
| Cloudflare Workers Logs | N/A. | Wrangler observability is enabled. | Wrangler observability is enabled. | `src/backend/wrangler.toml:13-15`; `src/redirect/wrangler.toml:13-15`; [Cloudflare Workers Logs docs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) |
| Worker source maps and version metadata | The frontend build emits hidden source maps only when `GITHUB_ACTIONS` or `SENTRY_AUTH_TOKEN` is present; a plain local `npm run build` emits none. The release workflow uploads and then deletes them in its protected deploy job. | `upload_source_maps = true` and `CF_VERSION_METADATA` binding are configured. | `upload_source_maps = true` and `CF_VERSION_METADATA` binding are configured. | `src/frontend/vite.config.ts:8-43`; `src/backend/wrangler.toml:8-11`; `src/redirect/wrangler.toml:8-11`; [Sentry source maps docs](https://docs.sentry.io/platforms/javascript/sourcemaps/); [Cloudflare Worker source maps docs](https://developers.cloudflare.com/workers/observability/source-maps/); [Cloudflare version metadata docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/) |
| Deployed environment name | Reported as `production` from the release build (`VITE_SENTRY_ENVIRONMENT`). | The release workflow hardcodes `ENVIRONMENT = "production"` before deploy. | The release workflow hardcodes `ENVIRONMENT = "production"` before deploy. | `.github/workflows/release.yml:155`; `.github/workflows/release.yml:350-361`; `.github/workflows/release.yml:836-847` |

## Local behavior

- Leaving a Sentry DSN empty is a local-development no-op: the frontend returns before `Sentry.init`, while Workers pass `undefined` to the SDK (`src/frontend/src/utils/sentry.ts:26-29`; `src/backend/src/services/sentry.ts:107`; `src/redirect/src/sentry.ts:178`). Production releases require all three DSNs and fail closed when one is missing or malformed.
- Frontend telemetry user-context failures must not affect authentication. `setSentryUser` and `clearSentryUser` catch Sentry/hash failures and only log a safe warning (`src/frontend/src/utils/sentry.ts:55-79`; `src/frontend/src/stores/auth.ts:47-74`).
- Local verification may use local `.env` / `wrangler.local.toml` copies, but those files must remain ignored and must not be committed.

## Privacy and data handling

| Area | Current behavior | Remaining implication |
| --- | --- | --- |
| PII mode | `sendDefaultPii: true` is selected for all three SDKs to keep Sentry's default/permissive context available (`src/frontend/src/utils/sentry.ts:35`; `src/backend/src/services/sentry.ts:111`; `src/redirect/src/sentry.ts:183`). | Treat Sentry as an authorized operational telemetry destination; do not add business secrets to logs or error messages. |
| User identity | The frontend hashes the Microsoft Entra account ID with SHA-256 before calling `Sentry.setUser({ id })` (`src/frontend/src/utils/sentry.ts:55-64`). Backend route and service logs omit raw Entra `oid` / `sub`, email, and SSO IDs, using non-identifying operation context such as authentication state, route IDs, pagination, counts, sizes, and retention days instead (`src/backend/src/index.ts`; `src/backend/src/services/url.ts`; `src/backend/src/services/user.ts`; `src/backend/src/middleware/auth.ts`). | The frontend hash is stable and pseudonymous, not anonymous if the original identifier is available elsewhere. Backend request bodies and query strings can still be captured for failed Admin API routes under the accepted permissive-PII trade-off. |
| Credential headers | `authorization`, `x-api-key`, and `cookie` headers, plus any parsed `request.cookies`, are scrubbed from backend and redirect Sentry events/spans (`src/backend/src/services/sentry.ts:5-103`; `src/redirect/src/sentry.ts:18`; `src/redirect/src/sentry.ts:56-174`). | Continue to avoid adding credentials to custom tags, breadcrumbs, or log messages. |
| Redirect background reports | Reporting uses fresh current and isolation scopes to reduce ambient request data, but the final payload controls are the actual boundary. `beforeSend` recognizes `background_operation=redirect.click_recording` and rebuilds exception events from an allowlist, retaining the exception plus the operational `background_operation`, `short_code`, and `url_id` tags while dropping ambient user/account identity, request data and headers, cookies, destination URL, breadcrumbs, extras, and contexts. The Sentry Log is a hand-built v2 envelope with only the explicit operational attributes; it omits `ingest_settings`, whose v2 defaults do not request IP or User-Agent inference (`src/redirect/src/sentry.ts`; `src/redirect/src/observability.ts`). | Sentry Relay may still apply JavaScript legacy event normalization and derive an envelope sender/egress IP and geo when `sdk.settings.infer_ip` is absent. In local verification this was the workstation IP; production is expected to reflect Worker/Cloudflare egress, not necessarily the redirect visitor. See [event SDK inference](https://develop.sentry.dev/sdk/foundations/envelopes/event-payloads/sdk/), [connection IP and derived geo](https://develop.sentry.dev/sdk/foundations/envelopes/event-payloads/user/), and [v2 Log ingest defaults](https://develop.sentry.dev/sdk/foundations/envelopes/envelope-items/#ingest-settings). If future requirements demand no stored IP and no derived geo, use a dedicated project/DSN, enable Prevent Storing IP Addresses, and scrub `$user.geo.**` server-side; client allowlists alone are insufficient. See [server-side scrubbing](https://docs.sentry.io/security-legal-pii/scrubbing/server-side-scrubbing/). |
| Destination URLs | The frontend never logs raw error objects for URL operations: store failures log only an error name, code, and HTTP status (`src/frontend/src/utils/safeError.ts`; `src/frontend/src/stores/url.ts`). The link list, analytics subject, and top-link stats elements that render or attribute `original_url` are marked `data-sentry-block`; create/edit form fields rely on Sentry's default input masking instead. Backend Sentry events and spans redact the identity segment in `uploads/{userId}/...` paths. | An `original_url` can carry signed query credentials; keep new UI and console output free of it. Admin API events can still carry the request body and query for the route that failed, which remains an accepted permissive-PII trade-off. |
| Replay | Sentry Replay default masking is used; normal session sampling is 0% and error-session sampling is controlled by `VITE_SENTRY_REPLAY_ENABLED`. Destination URLs rendered in the list, analytics, and stats views are blocked from recording with `data-sentry-block`. | Console entries attached to a Replay or event can still contain user-visible provider messages. |
| Tokens and DSNs | Never log auth tokens, Entra bearer tokens, SAS tokens, x-api-key values, cookies, or literal Sentry DSN values. | Use GitHub variables/secrets and local ignored files; examples below use environment variable names only. |

See [Sentry Replay default masking](https://docs.sentry.io/platforms/javascript/guides/vue/session-replay/) and [Sentry auth-token guidance](https://docs.sentry.io/account/auth-tokens/).

## GitHub and runtime configuration

| Name | GitHub storage | Runtime target | Purpose | Notes |
| --- | --- | --- | --- | --- |
| `VITE_SENTRY_DSN` | Repository variable | Frontend build env | Public DSN for `akamoney-web`. | Required for production release; empty locally disables the SDK. Do not paste the value into docs, logs, or commits. |
| `VITE_SENTRY_REPLAY_ENABLED` | Repository variable | Frontend build env | Enables error-session Replay unless set to `false`. | The value is trimmed and compared case-insensitively, so `false`, `False`, and padded variants all disable it. Normal Replay sessions stay at 0%; error sessions are 100% when enabled. |
| `SENTRY_BACKEND_DSN` | Repository variable | Admin API deploy workflow | Injected into the Worker `SENTRY_DSN` var for `akamoney-api`. | Required for production release; the workflow validates it before deployment changes. |
| `SENTRY_REDIRECT_DSN` | Repository variable | Redirect deploy workflow | Injected into the Worker `SENTRY_DSN` var for `akamoney-redirect`. | Required for production release; the workflow validates it before deployment changes. |
| `SENTRY_AUTH_TOKEN` | Production environment secret | Protected frontend deploy job only | Authenticates `sentry-cli` source-map inject/upload. | Must not be available to the `build` job, which executes the released commit's dependency and build scripts outside the protected environment. |

Recommended guardrails:

1. Keep `SENTRY_AUTH_TOKEN` in a protected GitHub `production` environment with at least one required reviewer before the job can access it.
2. Use a token dedicated to source-map upload. [Sentry's Vite source-map guide](https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite/) documents Organization Tokens, or Personal Tokens with `Project: Read & Write` and `Release: Admin` permissions.
3. Do not grant issue write, member, or admin privileges to the source-map token unless a future workflow has a documented need.
4. Rotate the token if it is ever exposed in a log, local shell history, or copied configuration file.

## Secure source-map flow

1. The release workflow's `build` job receives public DSN variables but no Sentry upload credential (`.github/workflows/release.yml:145-161`). It runs outside the protected environment and executes the released commit's build scripts, so it must hold no credential.
2. Hidden frontend source maps are generated only by builds that can hand them to Sentry: the Vite config emits them when `GITHUB_ACTIONS` or `SENTRY_AUTH_TOKEN` is present and disables them otherwise, so a manual `npm run build` plus `wrangler pages deploy` can never publish a map (`src/frontend/vite.config.ts:8-43`).
3. The protected deploy job receives `SENTRY_AUTH_TOKEN` only after environment protection passes, and only after the trusted mainline ancestry recheck that runs before the artifact is downloaded (`.github/workflows/release.yml:1021-1064`).
4. The protected job runs `sentry-cli sourcemaps inject` and `sentry-cli sourcemaps upload` against the already-built frontend artifact (`.github/workflows/release.yml:1079-1086`).
5. The workflow deletes `.map` files and checks that none remain before Cloudflare Pages deploy (`.github/workflows/release.yml:1087-1094`).

Production releases start only from a SemVer tag push or a confirmed manual dispatch — pull request events cannot start the workflow and no label deploys anything — and every deploy job re-proves, from a trusted `main`-only policy checkout, that it is deploying the immutable commit validated by `prepare-release`. See [Deployment](DEPLOYMENT.md) for the trust boundary, the applied `production` environment policy (branch `main` plus tag `*.*.*`, with the required reviewer preserved) and the documented limitations: reviewer self-review and admin bypass are possible, a tag on a historical commit still runs that commit's workflow, same-repo writers stay trusted, and `CLOUDFLARE_API_TOKEN`/`AZURE_STORAGE_SAS_TOKEN` remain repository secrets while only `SENTRY_AUTH_TOKEN` is environment-scoped.

Do not state that production source maps are verified until the first production release confirms symbolication in Sentry.

## Uptime and alerts

| Item | Value |
| --- | --- |
| Uptime detector | `9690376` |
| Checked URL | [https://aka.money/health](https://aka.money/health), routed to the redirect Worker by the deployed Cloudflare domain configuration |
| Interval / timeout | 60 seconds / 5 seconds |
| Down / recovery thresholds | 3 failed checks to mark down; 1 successful check to recover |
| First outage notification | Default high-priority email |
| Regression workflow | `3926857` |
| Email fallback | `ActiveMembers` |

See [Sentry Uptime Monitoring](https://docs.sentry.io/product/monitors-and-alerts/monitors/uptime-monitoring/) and [Sentry alerts](https://docs.sentry.io/product/monitors-and-alerts/alerts/).

## Read-only operational examples

Set these variables in your shell without echoing token values:

```powershell
$env:SENTRY_BASE_URL = "https://sentry.io"
$env:SENTRY_ORG = "<org-slug>"
$env:SENTRY_AUTH_TOKEN = "<set-in-shell-or-secret-store>"
$env:SENTRY_UPTIME_DETECTOR_ID = "9690376"
```

List projects with `sentry-cli`:

Install `sentry-cli` using the [official CLI instructions](https://docs.sentry.io/cli/) before running these examples.

```powershell
sentry-cli projects list --org $env:SENTRY_ORG --auth-token $env:SENTRY_AUTH_TOKEN
```

Query unresolved issues for each AkaMoney project:

```powershell
sentry-cli issues list --org $env:SENTRY_ORG --project akamoney-web --query "is:unresolved" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
sentry-cli issues list --org $env:SENTRY_ORG --project akamoney-api --query "is:unresolved" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
sentry-cli issues list --org $env:SENTRY_ORG --project akamoney-redirect --query "is:unresolved" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
```

Query Logs with `sentry-cli`:

```powershell
sentry-cli logs list --org $env:SENTRY_ORG --project akamoney-api --query "severity:error" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
```

Query organization usage stats through the Sentry API:

```powershell
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/stats_v2/?statsPeriod=24h&interval=1h&groupBy=project&groupBy=category&field=sum(quantity)"
```

Query errors, logs, and spans through Explore table APIs:

```powershell
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/events/?dataset=errors&project=akamoney-web&query=is:unresolved&statsPeriod=24h&field=title&field=timestamp&per_page=25"
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/events/?dataset=logs&project=akamoney-api&query=severity:error&statsPeriod=24h&field=message&field=timestamp&per_page=25"
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/events/?dataset=spans&project=akamoney-redirect&statsPeriod=24h&field=span.op&field=timestamp&per_page=25"
```

Query the uptime detector and regression workflow through their detail APIs:

```powershell
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/detectors/$env:SENTRY_UPTIME_DETECTOR_ID/"
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/workflows/3926857/"
```

The `logs list` command is currently marked beta by Sentry CLI. See the [Sentry CLI documentation](https://docs.sentry.io/cli/), [Explore API documentation](https://docs.sentry.io/api/explore/query-explore-events-in-table-format/), and [pricing documentation](https://docs.sentry.io/pricing/).

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
| No Worker events | Confirm the deployed Worker has non-empty `SENTRY_DSN`, `ENVIRONMENT` (the release workflow sets it to `production`), observability enabled, and no release workflow DSN validation failure. |
| No logs | Confirm SDK `enableLogs` is true and query the correct Sentry project/dataset. |
| Replay missing | Confirm `VITE_SENTRY_REPLAY_ENABLED` is not `false` in any case or with surrounding whitespace; remember normal sessions are intentionally sampled at 0%. |
| Source maps missing after deploy | Confirm the protected job ran `sentry-cli sourcemaps inject/upload`; do not deploy artifacts that still contain `.map` files. A local `npm run build` intentionally produces no maps unless `GITHUB_ACTIONS` or `SENTRY_AUTH_TOKEN` is set. |
| Unexpected PII | Check logs, custom breadcrumbs, exception messages, and provider console text; scrub upstream messages rather than relying only on SDK defaults. |
