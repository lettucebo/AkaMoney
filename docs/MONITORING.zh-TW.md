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
| Issues / errors | `VITE_SENTRY_DSN` 非空時，`@sentry/vue` 會初始化。 | `@sentry/cloudflare` 會包裝 Worker handler。 | `@sentry/cloudflare/nodejs_compat` 會包裝 Worker handler。 | `src/frontend/src/utils/sentry.ts:21-34`；`src/backend/src/index.ts:731`；`src/redirect/src/index.ts:78-81`；[Sentry Vue 文件](https://docs.sentry.io/platforms/javascript/guides/vue/)；[Sentry Cloudflare 文件](https://docs.sentry.io/platforms/javascript/guides/cloudflare/) |
| Logs | SDK logs 已啟用，並捕捉 console `warn` / `error`。 | SDK logs 已啟用，並捕捉 console `log` / `warn` / `error`。 | SDK logs 已啟用，並捕捉 console `log` / `warn` / `error`。 | `src/frontend/src/utils/sentry.ts:39-42`；`src/backend/src/services/sentry.ts:105-117`；`src/redirect/src/sentry.ts:182-190`；[Sentry Logs 文件](https://docs.sentry.io/platforms/javascript/guides/vue/logs/) |
| 背景分析失敗回報 | N/A。 | N/A。 | `click_records` 寫入失敗時，會透過在 request scope 仍有效時擷取的 Sentry client 回報：剛好一次原生 `console.error`、一個標記 `background_operation=redirect.click_recording` 的 issue，以及一筆 Sentry log。回報不會讓 `waitUntil` 被 reject、不會在內部 flush，也不會改變 302。 | `src/redirect/src/index.ts:46-60`；`src/redirect/src/services.ts:12-47`；`src/redirect/src/sentry.ts:250-338`；`src/redirect/src/observability.ts:11-23` |
| Tracing sample rate | 正式環境建置採樣 20%；開發模式採樣 100% 供本地診斷。 | 20%。 | 1%。 | `src/frontend/src/utils/sentry.ts:43`；`src/backend/src/services/sentry.ts:109`；`src/redirect/src/sentry.ts:180` |
| Replay | Error-only Replay：一般 session 0%，error session 100%，除非 `VITE_SENTRY_REPLAY_ENABLED` 為 `false`（會先去除前後空白並忽略大小寫）。列表、成效分析與統計頁中呈現客戶 `original_url` 的元素都標記 `data-sentry-block`。 | N/A。 | N/A。 | `src/frontend/src/utils/sentry.ts:18-19`；`src/frontend/src/utils/sentry.ts:38`；`src/frontend/src/utils/sentry.ts:45-46`；`src/frontend/src/components/dashboard/UrlTable.vue:22`；`src/frontend/src/views/AnalyticsView.vue:32-40`；`src/frontend/src/views/OverallStatsView.vue:49`；[Sentry Replay 文件](https://docs.sentry.io/platforms/javascript/guides/vue/session-replay/) |
| Cloudflare Workers Logs | N/A。 | Wrangler observability 已啟用。 | Wrangler observability 已啟用。 | `src/backend/wrangler.toml:13-15`；`src/redirect/wrangler.toml:13-15`；[Cloudflare Workers Logs 文件](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) |
| Worker source maps 與 version metadata | 前端建置只有在具備 `GITHUB_ACTIONS` 或 `SENTRY_AUTH_TOKEN` 時才會產生 hidden source maps；單純在本機執行 `npm run build` 不會產生任何 map。發布流程會在受保護的部署工作上傳後刪除它們。 | 已設定 `upload_source_maps = true` 與 `CF_VERSION_METADATA` binding。 | 已設定 `upload_source_maps = true` 與 `CF_VERSION_METADATA` binding。 | `src/frontend/vite.config.ts:8-43`；`src/backend/wrangler.toml:8-11`；`src/redirect/wrangler.toml:8-11`；[Sentry source maps 文件](https://docs.sentry.io/platforms/javascript/sourcemaps/)；[Cloudflare Worker source maps 文件](https://developers.cloudflare.com/workers/observability/source-maps/)；[Cloudflare version metadata 文件](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/) |
| 部署環境名稱 | 由發布建置回報為 `production`（`VITE_SENTRY_ENVIRONMENT`）。 | 發布流程會在部署前寫死 `ENVIRONMENT = "production"`。 | 發布流程會在部署前寫死 `ENVIRONMENT = "production"`。 | `.github/workflows/release.yml:62`；`.github/workflows/release.yml:231-247`；`.github/workflows/release.yml:696-709` |

## 本地行為

- Sentry DSN 留空時，本地環境不會送出遙測資料：前端會在呼叫 `Sentry.init` 前返回；Workers 會把 `undefined` 傳給 SDK（`src/frontend/src/utils/sentry.ts:26-29`；`src/backend/src/services/sentry.ts:107`；`src/redirect/src/sentry.ts:178`）。正式發布必須具備三組 DSN，缺少或格式錯誤時會停止。
- 前端遙測使用者內容失敗不得影響驗證流程。`setSentryUser` 與 `clearSentryUser` 會捕捉 Sentry／雜湊失敗，且只寫入不含識別資訊的警告（`src/frontend/src/utils/sentry.ts:55-79`；`src/frontend/src/stores/auth.ts:47-74`）。
- 本地驗證可使用本機 `.env` / `wrangler.local.toml` 複本，但這些檔案必須維持 ignored，且不得提交。

## 隱私與資料處理

| 項目 | 目前行為 | 剩餘影響 |
| --- | --- | --- |
| PII 模式 | 三個 SDK 都選用 `sendDefaultPii: true`，保留 Sentry 預設的較完整內容（`src/frontend/src/utils/sentry.ts:35`；`src/backend/src/services/sentry.ts:111`；`src/redirect/src/sentry.ts:183`）。 | 必須把 Sentry 視為已授權的營運遙測目的地；不要把業務機密加到日誌或錯誤訊息。 |
| 使用者身分 | 前端會先以 SHA-256 雜湊 Microsoft Entra account ID，再呼叫 `Sentry.setUser({ id })`（`src/frontend/src/utils/sentry.ts:55-64`）。後端 route 與 service logs 不帶原始 Entra `oid`／`sub`、email 或 SSO ID，改用不具識別性的操作脈絡，例如驗證狀態、route ID、分頁、筆數、檔案大小與保留天數（`src/backend/src/index.ts`；`src/backend/src/services/url.ts`；`src/backend/src/services/user.ts`；`src/backend/src/middleware/auth.ts`）。 | 前端雜湊值是穩定且假名化的識別值；若其他地方可取得原始識別值，則不等同匿名。後端管理 API 失敗路由仍可能依已接受的寬鬆 PII 取捨捕捉 request body 與 query string。 |
| 憑證標頭 | 後端與重新導向 Sentry events/spans 會移除 `authorization`、`x-api-key`、`cookie` 標頭，以及任何已解析的 `request.cookies`（`src/backend/src/services/sentry.ts:5-103`；`src/redirect/src/sentry.ts:18`；`src/redirect/src/sentry.ts:56-174`）。 | 仍須避免把憑證放進自訂標籤、breadcrumbs 或日誌訊息。 |
| 重新導向背景回報 | 回報使用全新 current 與 isolation scope 來降低環境 request data 混入的機會，但真正的邊界是最終 payload 控制。`beforeSend` 以 `background_operation=redirect.click_recording` 辨識事件並用 allowlist 重建 exception event，保留例外及 `background_operation`、`short_code`、`url_id` 等操作標籤，同時丟棄環境使用者／帳號身分、request data 與 headers、cookies、目的地 URL、breadcrumbs、extras 和 contexts。Sentry Log 是手工建立的 v2 envelope，只含明確操作 attributes；它省略 `ingest_settings`，而 v2 預設不要求推論 IP 或 User-Agent（`src/redirect/src/sentry.ts`；`src/redirect/src/observability.ts`）。 | Sentry Relay 仍可能在缺少 `sdk.settings.infer_ip` 時套用 JavaScript legacy event normalization，依 envelope 送出端／egress 連線推論 IP 與 geo。本地驗證看到的是工作站 IP；正式環境預期代表 Worker／Cloudflare egress，不一定是重新導向訪客。請參閱 [event SDK inference](https://develop.sentry.dev/sdk/foundations/envelopes/event-payloads/sdk/)、[connection IP 與 derived geo](https://develop.sentry.dev/sdk/foundations/envelopes/event-payloads/user/)及 [v2 Log ingest defaults](https://develop.sentry.dev/sdk/foundations/envelopes/envelope-items/#ingest-settings)。若未來要求完全不儲存 IP 與 derived geo，應使用獨立 project／DSN、啟用 Prevent Storing IP Addresses，並在 server-side scrub `$user.geo.**`；只靠 client allowlist 不足。請參閱 [server-side scrubbing](https://docs.sentry.io/security-legal-pii/scrubbing/server-side-scrubbing/)。 |
| 目的地網址 | 前端不再記錄原始 error 物件：URL 相關的 store 失敗只記錄 error name、code 與 HTTP status（`src/frontend/src/utils/safeError.ts`；`src/frontend/src/stores/url.ts`）。連結列表、成效分析對象與熱門連結統計中呈現或以屬性帶出 `original_url` 的元素都標記 `data-sentry-block`；建立／編輯表單欄位則沿用 Sentry 預設的 input masking。後端 Sentry events 與 spans 會遮蔽 `uploads/{userId}/...` 路徑中的身分片段。 | `original_url` 可能夾帶簽章查詢字串憑證；新增 UI 或 console 輸出時也不得帶出。管理 API events 仍可能包含失敗路由的 request body 與 query，這是已接受的寬鬆 PII 取捨。 |
| Replay | 使用 Sentry Replay default masking；一般 session sampling 為 0%，error-session sampling 由 `VITE_SENTRY_REPLAY_ENABLED` 控制。列表、成效分析與統計頁中呈現的目的地網址以 `data-sentry-block` 阻擋錄製。 | 連到 Replay 或 event 的 console entries 仍可能包含使用者可見的供應商訊息。 |
| Tokens 與 DSNs | 不得記錄 auth tokens、Entra bearer tokens、SAS tokens、x-api-key 值、cookies 或實際 Sentry DSN 值。 | 使用 GitHub variables/secrets 與本機 ignored files；下方範例只使用環境變數名稱。 |

請參閱 [Sentry Replay 預設遮罩文件](https://docs.sentry.io/platforms/javascript/guides/vue/session-replay/)與 [Sentry 驗證權杖文件](https://docs.sentry.io/account/auth-tokens/)。

## GitHub 與執行環境配置

| 名稱 | GitHub 儲存位置 | 執行時目標 | 用途 | 注意事項 |
| --- | --- | --- | --- | --- |
| `VITE_SENTRY_DSN` | Repository variable | 前端建置環境 | `akamoney-web` 的公開 DSN。 | 正式發布時必填；本地留空會停用 SDK。不要把值貼到文件、日誌或 commits。 |
| `VITE_SENTRY_REPLAY_ENABLED` | Repository variable | 前端建置環境 | 除非設為 `false`，否則啟用 error-session Replay。 | 判斷時會去除前後空白並忽略大小寫，因此 `false`、`False` 或含空白的寫法都會停用。一般 Replay sessions 維持 0%；啟用時 error sessions 為 100%。 |
| `SENTRY_BACKEND_DSN` | Repository variable | 管理 API deploy workflow | 注入 Worker `SENTRY_DSN` var，供 `akamoney-api` 使用。 | 正式發布時必填；發布流程會先驗證 DSN，再執行部署變更。 |
| `SENTRY_REDIRECT_DSN` | Repository variable | 重新導向 deploy workflow | 注入 Worker `SENTRY_DSN` var，供 `akamoney-redirect` 使用。 | 正式發布時必填；發布流程會先驗證 DSN，再執行部署變更。 |
| `SENTRY_AUTH_TOKEN` | Production environment secret | 只給受保護的前端 deploy job | 驗證 `sentry-cli` source-map inject/upload。 | 不得提供給不受信任的 PR-head build job。 |

建議 guardrails：

1. 將 `SENTRY_AUTH_TOKEN` 放在受保護的 GitHub `production` environment，且 job 存取前至少需要一位 required reviewer 核准。
2. 使用 source map 上傳專用權杖。請參閱 [Sentry Vite source map 指南](https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite/)所列的 Organization Token，或具備 `Project: Read & Write` 與 `Release: Admin` 權限的 Personal Token。
3. 除非未來 workflow 有已記錄的需求，不要授予 source-map token issue write、member 或 admin 權限。
4. 若 token 曾出現在 log、本機 shell history 或被複製的設定檔，請立即輪替。

## 安全 source-map 流程

1. 發布流程的不受信任 PR head build 會收到公開 DSN variables，但不會收到 Sentry 上傳憑證（`.github/workflows/release.yml:61-67`）。
2. 只有能把 source maps 交給 Sentry 的建置才會產生 hidden source maps：Vite 設定在具備 `GITHUB_ACTIONS` 或 `SENTRY_AUTH_TOKEN` 時才啟用，其餘情況一律關閉，因此手動 `npm run build` 後再執行 `wrangler pages deploy` 不可能發布 map（`src/frontend/vite.config.ts:8-43`）。
3. 受保護的部署工作只會在 environment protection 通過後取得 `SENTRY_AUTH_TOKEN`（`.github/workflows/release.yml:881-907`）。
4. 受保護的工作會針對已建置好的前端 artifact 執行 `sentry-cli sourcemaps inject` 與 `sentry-cli sourcemaps upload`（`.github/workflows/release.yml:895-924`）。
5. Workflow 會刪除 `.map` 檔，並在 Cloudflare Pages 部署前檢查沒有任何 `.map` 檔殘留（`.github/workflows/release.yml:925-954`）。

在第一次正式環境 release 於 Sentry 確認 symbolication 前，不要宣稱 production source maps 已驗證。

## Uptime 與 alerts

| 項目 | 值 |
| --- | --- |
| Uptime detector | `9690376` |
| 檢查 URL | [https://aka.money/health](https://aka.money/health)，由已部署的 Cloudflare 網域設定導向重新導向 Worker |
| Interval / timeout | 60 秒 / 5 秒 |
| Down / recovery thresholds | 3 次失敗檢查後標記 down；1 次成功檢查後 recover |
| 首次 outage 通知 | Default high-priority email |
| Regression workflow | `3926857` |
| Email fallback | `ActiveMembers` |

請參閱 [Sentry Uptime Monitoring 文件](https://docs.sentry.io/product/monitors-and-alerts/monitors/uptime-monitoring/)與 [Sentry alerts 文件](https://docs.sentry.io/product/monitors-and-alerts/alerts/)。

## 唯讀營運範例

在 shell 設定這些變數，但不要 echo token 值：

```powershell
$env:SENTRY_BASE_URL = "https://sentry.io"
$env:SENTRY_ORG = "<org-slug>"
$env:SENTRY_AUTH_TOKEN = "<set-in-shell-or-secret-store>"
$env:SENTRY_UPTIME_DETECTOR_ID = "9690376"
```

使用 `sentry-cli` 列出 projects：

執行下列範例前，請先依照 [Sentry CLI 官方說明](https://docs.sentry.io/cli/)安裝 `sentry-cli`。

```powershell
sentry-cli projects list --org $env:SENTRY_ORG --auth-token $env:SENTRY_AUTH_TOKEN
```

查詢各 AkaMoney 專案尚未解決的 issues：

```powershell
sentry-cli issues list --org $env:SENTRY_ORG --project akamoney-web --query "is:unresolved" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
sentry-cli issues list --org $env:SENTRY_ORG --project akamoney-api --query "is:unresolved" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
sentry-cli issues list --org $env:SENTRY_ORG --project akamoney-redirect --query "is:unresolved" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
```

使用 `sentry-cli` 查詢 Logs：

```powershell
sentry-cli logs list --org $env:SENTRY_ORG --project akamoney-api --query "severity:error" --max-rows 25 --auth-token $env:SENTRY_AUTH_TOKEN
```

透過 Sentry API 查詢 organization usage stats：

```powershell
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/stats_v2/?statsPeriod=24h&interval=1h&groupBy=project&groupBy=category&field=sum(quantity)"
```

透過 Explore table APIs 查詢 errors、logs 與 spans：

```powershell
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/events/?dataset=errors&project=akamoney-web&query=is:unresolved&statsPeriod=24h&field=title&field=timestamp&per_page=25"
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/events/?dataset=logs&project=akamoney-api&query=severity:error&statsPeriod=24h&field=message&field=timestamp&per_page=25"
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/events/?dataset=spans&project=akamoney-redirect&statsPeriod=24h&field=span.op&field=timestamp&per_page=25"
```

透過詳細資料 API 查詢 uptime detector 與 regression workflow：

```powershell
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/detectors/$env:SENTRY_UPTIME_DETECTOR_ID/"
curl.exe --oauth2-bearer $env:SENTRY_AUTH_TOKEN "$env:SENTRY_BASE_URL/api/0/organizations/$env:SENTRY_ORG/workflows/3926857/"
```

`logs list` 目前在 Sentry CLI 中標示為 beta。請參閱 [Sentry CLI 文件](https://docs.sentry.io/cli/)、[Explore API 文件](https://docs.sentry.io/api/explore/query-explore-events-in-table-format/)與[價格文件](https://docs.sentry.io/pricing/)。

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
- 確認 uptime detector `9690376` 仍指向 [https://aka.money/health](https://aka.money/health)，且門檻與本文件一致。

### 疑難排解

| 症狀 | 檢查 |
| --- | --- |
| 沒有前端 events | 確認該次 build 的 `VITE_SENTRY_DSN` 非空、build 已重新部署，且瀏覽器網路阻擋沒有擋住 Sentry ingestion。 |
| 沒有 Worker events | 確認已部署 Worker 有非空 `SENTRY_DSN`、`ENVIRONMENT`（發布流程會設為 `production`）、observability enabled，且 release workflow DSN validation 沒有失敗。 |
| 沒有 logs | 確認 SDK `enableLogs` 為 true，且查詢正確的 Sentry project/dataset。 |
| Replay 缺漏 | 確認 `VITE_SENTRY_REPLAY_ENABLED` 不是 `false`（含大小寫變化或前後空白）；一般 sessions 依設計採樣 0%。 |
| 部署後缺少 source maps | 確認受保護 job 已執行 `sentry-cli sourcemaps inject/upload`；不要部署仍含有 `.map` 檔的 artifacts。本機 `npm run build` 在沒有 `GITHUB_ACTIONS` 或 `SENTRY_AUTH_TOKEN` 時依設計不會產生 map。 |
| 非預期 PII | 檢查 logs、自訂 breadcrumbs、exception messages 與供應商 console text；應從上游訊息 scrub，而不只仰賴 SDK defaults。 |
