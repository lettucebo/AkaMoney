[English](MONITORING.md) | 繁體中文

# AkaMoney Sentry 監控

本指南記錄 AkaMoney 的 Sentry 監控設定。本文刻意不包含任何 DSN 值、auth token 或正式環境 secrets。

## 範圍與目前驗證狀態

| 服務 | Sentry 專案 | 執行環境 | 目前已驗證狀態 |
| --- | --- | --- | --- |
| 前端管理 SPA | `akamoney-web` | Vue 3 on Vite / Cloudflare Pages | 本地 SDK 驗證已在專案內產生 Issues、Logs 與 Traces。Error-only Replay 已配置，但由 `VITE_SENTRY_REPLAY_ENABLED` 控制。 |
| 管理 API Worker | `akamoney-api` | Hono on Cloudflare Workers | 本地 SDK 驗證已在專案內產生 Issues、Logs 與 Traces。 |
| 重新導向 Worker | `akamoney-redirect` | Hono on Cloudflare Workers | 本地 SDK 驗證已在專案內產生 Issues、Logs 與 Traces。 |

本文不宣稱已完成正式環境部署或正式環境 source-map symbolication 驗證。第一次正式環境 release 後，仍必須確認前端 minified stack frame 能透過已上傳的 source maps 對應回原始碼。

## 功能矩陣

| 能力 | 前端 `akamoney-web` | 管理 API `akamoney-api` | 重新導向 `akamoney-redirect` | 依據 |
| --- | --- | --- | --- | --- |
| Issues / errors | `VITE_SENTRY_DSN` 非空時，`@sentry/vue` 會初始化。 | `@sentry/cloudflare` 會包裝 Worker handler。 | `@sentry/cloudflare/nodejs_compat` 會包裝 Worker handler。 | `src\frontend\src\utils\sentry.ts:18-31`; `src\backend\src\index.ts:731`; `src\redirect\src\index.ts:73-78`; Sentry Vue 文件：https://docs.sentry.io/platforms/javascript/guides/vue/；Sentry Cloudflare 文件：https://docs.sentry.io/platforms/javascript/guides/cloudflare/ |
| Logs | SDK logs 已啟用，並捕捉 console `warn` / `error`。 | SDK logs 已啟用，並捕捉 console `log` / `warn` / `error`。 | SDK logs 已啟用，並捕捉 console `log` / `warn` / `error`。 | `src\frontend\src\utils\sentry.ts:36-39`; `src\backend\src\services\sentry.ts:106-112`; `src\redirect\src\sentry.ts:116-123`; Sentry Logs 文件：https://docs.sentry.io/platforms/javascript/guides/vue/logs/ |
| Tracing sample rate | 正式環境建置採樣 20%；開發模式採樣 100% 供本地診斷。 | 20%。 | 1%。 | `src\frontend\src\utils\sentry.ts:40`; `src\backend\src\services\sentry.ts:105`; `src\redirect\src\sentry.ts:114` |
| Replay | Error-only Replay：一般 session 0%，error session 100%，除非 `VITE_SENTRY_REPLAY_ENABLED=false`。 | N/A。 | N/A。 | `src\frontend\src\utils\sentry.ts:35`; `src\frontend\src\utils\sentry.ts:42-43`; Sentry Replay 文件：https://docs.sentry.io/platforms/javascript/guides/vue/session-replay/ |
| Cloudflare Workers Logs | N/A。 | Wrangler observability 已啟用。 | Wrangler observability 已啟用。 | `src\backend\wrangler.toml:13-15`; `src\redirect\wrangler.toml:13-15`; Cloudflare Workers Logs 文件：https://developers.cloudflare.com/workers/observability/logs/workers-logs/ |
| Worker source maps 與 version metadata | 前端 hidden source maps 只會在受保護的 deploy flow 上傳。 | 已設定 `upload_source_maps = true` 與 `CF_VERSION_METADATA` binding。 | 已設定 `upload_source_maps = true` 與 `CF_VERSION_METADATA` binding。 | `src\frontend\vite.config.ts:9-25`; `src\backend\wrangler.toml:8-11`; `src\redirect\wrangler.toml:8-11`; Sentry source maps 文件：https://docs.sentry.io/platforms/javascript/sourcemaps/；Cloudflare Worker source maps 文件：https://developers.cloudflare.com/workers/observability/source-maps/；Cloudflare version metadata 文件：https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/ |

## 本地行為

- Sentry DSN 留空時不會送出 telemetry：前端會在呼叫 `Sentry.init` 前返回；Workers 在 `SENTRY_DSN` 為空時會把 `undefined` 傳給 SDK（`src\frontend\src\utils\sentry.ts:23-26`；`src\backend\src\services\sentry.ts:102`；`src\redirect\src\sentry.ts:111`）。
- 前端 telemetry 使用者 context 失敗不得影響驗證流程。`setSentryUser` 與 `clearSentryUser` 會捕捉 Sentry/hash 失敗，且只寫入安全的 warning（`src\frontend\src\utils\sentry.ts:52-75`；`src\frontend\src\stores\auth.ts:47-74`）。
- 本地驗證可使用本機 `.env` / `wrangler.local.toml` 複本，但這些檔案必須維持 ignored，且不得提交。

## 隱私與資料處理

| 項目 | 目前行為 | 剩餘影響 |
| --- | --- | --- |
| PII 模式 | 三個 SDK 都選用 `sendDefaultPii: true`，保留 Sentry default/permissive context（`src\frontend\src\utils\sentry.ts:32`；`src\backend\src\services\sentry.ts:107`；`src\redirect\src\sentry.ts:117`）。 | 必須把 Sentry 視為已授權的營運 telemetry 目的地；不要把業務 secrets 加到 logs 或錯誤訊息。 |
| 使用者身分 | 前端會先以 SHA-256 雜湊 Microsoft Entra account ID，再呼叫 `Sentry.setUser({ id })`（`src\frontend\src\utils\sentry.ts:52-61`）。 | 此 hash 是穩定且假名化的識別值；若其他地方可取得原始識別值，則不等同匿名。 |
| 憑證 headers | 後端與重新導向 Sentry events/spans 會 scrub `authorization`、`x-api-key`、`cookie` headers（`src\backend\src\services\sentry.ts:4-80`；`src\redirect\src\sentry.ts:8-104`）。 | 仍須避免把憑證放進自訂 tags、breadcrumbs 或 log messages。 |
| Replay | 使用 Sentry Replay default masking；一般 session sampling 為 0%，error-session sampling 由 `VITE_SENTRY_REPLAY_ENABLED` 控制。 | 連到 Replay 或 event 的 console entries 仍可能包含使用者可見的供應商訊息。 |
| Tokens 與 DSNs | 不得記錄 auth tokens、Entra bearer tokens、SAS tokens、x-api-key 值、cookies 或實際 Sentry DSN 值。 | 使用 GitHub variables/secrets 與本機 ignored files；下方範例只使用環境變數名稱。 |

Sentry Replay 的 default masking 行為文件：https://docs.sentry.io/platforms/javascript/guides/vue/session-replay/。Sentry auth-token 處理建議文件：https://docs.sentry.io/account/auth-tokens/。

## GitHub 與執行環境配置

| 名稱 | GitHub 儲存位置 | 執行時目標 | 用途 | 注意事項 |
| --- | --- | --- | --- | --- |
| `VITE_SENTRY_DSN` | Repository variable | 前端建置環境 | `akamoney-web` 的 public DSN。 | 本地留空會停用 SDK。不要把值貼到文件、logs 或 commits。 |
| `VITE_SENTRY_REPLAY_ENABLED` | Repository variable | 前端建置環境 | 除非設為 `false`，否則啟用 error-session Replay。 | 一般 Replay sessions 維持 0%；啟用時 error sessions 為 100%。 |
| `SENTRY_BACKEND_DSN` | Repository variable | 管理 API deploy workflow | 注入 Worker `SENTRY_DSN` var，供 `akamoney-api` 使用。 | Release workflow 會先驗證 DSN，再執行部署變更。 |
| `SENTRY_REDIRECT_DSN` | Repository variable | 重新導向 deploy workflow | 注入 Worker `SENTRY_DSN` var，供 `akamoney-redirect` 使用。 | Release workflow 會先驗證 DSN，再執行部署變更。 |
| `SENTRY_AUTH_TOKEN` | Production environment secret | 只給受保護的前端 deploy job | 驗證 `sentry-cli` source-map inject/upload。 | 不得提供給不受信任的 PR-head build job。 |

建議 guardrails：

1. 將 `SENTRY_AUTH_TOKEN` 放在受保護的 GitHub `production` environment，且 job 存取前至少需要一位 required reviewer 核准。
2. 使用 source-map upload 專用 token。Sentry Vite source-map 指南記錄 Organization Tokens，或具備 `Project: Read & Write` 與 `Release: Admin` 權限的 Personal Tokens：https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite/。
3. 除非未來 workflow 有已記錄的需求，不要授予 source-map token issue write、member 或 admin 權限。
4. 若 token 曾出現在 log、本機 shell history 或被複製的設定檔，請立即輪替。

## 安全 source-map 流程

1. Release workflow 的不受信任 PR-head build 會收到 public DSN variables，但刻意不會收到 `SENTRY_AUTH_TOKEN`（`.github\workflows\release.yml:61-66`）。
2. Vite 正式環境建置會產生 hidden frontend source maps（`src\frontend\vite.config.ts:10-12`）。
3. 受保護的 deploy job 只會在 environment protection 通過後取得 `SENTRY_AUTH_TOKEN`（`.github\workflows\release.yml:862-874`）。
4. 受保護 job 會針對已建置好的前端 artifact 執行 `sentry-cli sourcemaps inject` 與 `sentry-cli sourcemaps upload`（`.github\workflows\release.yml:883-891`）。
5. Workflow 會刪除 `.map` 檔，並在 Cloudflare Pages deploy 前檢查沒有任何 `.map` 檔殘留（`.github\workflows\release.yml:892-921`）。

在第一次正式環境 release 於 Sentry 確認 symbolication 前，不要宣稱 production source maps 已驗證。

## Uptime 與 alerts

| 項目 | 值 |
| --- | --- |
| Uptime detector | `9690376` |
| 檢查 URL | https://aka.money/health |
| Interval / timeout | 60 秒 / 5 秒 |
| Down / recovery thresholds | 3 次失敗檢查後標記 down；1 次成功檢查後 recover |
| 首次 outage 通知 | Default high-priority email |
| Regression workflow | `3926857` |
| Email fallback | `ActiveMembers` |

Sentry Uptime Monitoring 文件：https://docs.sentry.io/product/monitors-and-alerts/monitors/uptime-monitoring/。Sentry alert 文件：https://docs.sentry.io/product/monitors-and-alerts/alerts/。

## 唯讀營運範例

在 shell 設定這些變數，但不要 echo token 值：

```powershell
$env:SENTRY_BASE_URL = "https://sentry.io"
$env:SENTRY_ORG = "<org-slug>"
$env:SENTRY_AUTH_TOKEN = "<set-in-shell-or-secret-store>"
$env:SENTRY_UPTIME_DETECTOR_ID = "9690376"
```

使用 `sentry-cli` 列出 projects：

```powershell
node_modules\.bin\sentry-cli.cmd projects list --org $env:SENTRY_ORG --auth-token $env:SENTRY_AUTH_TOKEN
```

查詢各 AkaMoney 專案尚未解決的 issues：

```powershell
node_modules\.bin\sentry-cli.cmd issues list --org $env:SENTRY_ORG --project akamoney-web --query "is:unresolved" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
node_modules\.bin\sentry-cli.cmd issues list --org $env:SENTRY_ORG --project akamoney-api --query "is:unresolved" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
node_modules\.bin\sentry-cli.cmd issues list --org $env:SENTRY_ORG --project akamoney-redirect --query "is:unresolved" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
```

使用 `sentry-cli` 查詢 Logs：

```powershell
node_modules\.bin\sentry-cli.cmd logs list --org $env:SENTRY_ORG --project akamoney-api --query "level:error" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
```

透過 Sentry API 查詢 organization usage stats：

```powershell
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/stats_v2/?statsPeriod=24h&interval=1h&groupBy=project&groupBy=category&field=sum(quantity)"
```

透過 Explore table APIs 查詢 errors、logs、spans 或 uptime checks：

```powershell
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/events/?dataset=errors&project=akamoney-web&query=is:unresolved&statsPeriod=24h&field=title&field=timestamp&per_page=25"
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/events/?dataset=logs&project=akamoney-api&query=level:error&statsPeriod=24h&field=message&field=timestamp&per_page=25"
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/events/?dataset=spans&project=akamoney-redirect&statsPeriod=24h&field=span.op&field=timestamp&per_page=25"
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/events/?dataset=uptime_results&query=detector_id:$env:SENTRY_UPTIME_DETECTOR_ID&statsPeriod=24h&field=timestamp&field=uptime.status&per_page=25"
```

Sentry CLI 文件：https://docs.sentry.io/cli/。Explore API datasets 文件：https://docs.sentry.io/api/explore/query-explore-events-in-table-format/。Pricing 與 quota 分類文件：https://docs.sentry.io/pricing/。

## 驗證與疑難排解清單

### 部署前

- 確認 `VITE_SENTRY_DSN`、`SENTRY_BACKEND_DSN` 與 `SENTRY_REDIRECT_DSN` 已設定為 repository variables，且不包含 whitespace。
- 確認 `VITE_SENTRY_REPLAY_ENABLED` 是刻意設定；若要不移除 integration 但停用 error Replay，請設為 `false`。
- 確認 `SENTRY_AUTH_TOKEN` 只存在於受保護的 production environment，且需要 reviewer approval。
- 確認本地範例使用空 DSN 預設值或 ignored local files；不得提交實際 DSNs 或 tokens。
- 確認 release workflow logs 不會印出 DSN 或 token 值。

### 本地 SDK 驗證後

- 三個 Sentry 專案都已透過本地 SDK 驗證產生 Issues、Logs 與 Traces。
- 不要從本地 SDK 驗證推論正式環境健康狀態。

### 第一次正式環境 release 後

- 開啟第一個前端正式環境 error，確認 source-map symbolication。這是本文件中唯一仍待完成的 post-release check。
- 確認 Cloudflare Workers Logs 如預期顯示管理 API 與重新導向 Worker invocations/errors。
- 確認 uptime detector `9690376` 仍指向 https://aka.money/health，且 thresholds 與本文件一致。

### 疑難排解

| 症狀 | 檢查 |
| --- | --- |
| 沒有前端 events | 確認該次 build 的 `VITE_SENTRY_DSN` 非空、build 已重新部署，且瀏覽器網路阻擋沒有擋住 Sentry ingestion。 |
| 沒有 Worker events | 確認已部署 Worker 有非空 `SENTRY_DSN`、`ENVIRONMENT`、observability enabled，且 release workflow DSN validation 沒有失敗。 |
| 沒有 logs | 確認 SDK `enableLogs` 為 true，且查詢正確的 Sentry project/dataset。 |
| Replay 缺漏 | 確認 `VITE_SENTRY_REPLAY_ENABLED` 不是 `false`；一般 sessions 依設計採樣 0%。 |
| 部署後缺少 source maps | 確認受保護 job 已執行 `sentry-cli sourcemaps inject/upload`；不要部署仍含有 `.map` 檔的 artifacts。 |
| 非預期 PII | 檢查 logs、自訂 breadcrumbs、exception messages 與供應商 console text；應從上游訊息 scrub，而不只仰賴 SDK defaults。 |
