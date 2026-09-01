[English](CONFIGURATION.md) | 繁體中文

# AkaMoney 配置參考

此文件是 AkaMoney 環境變數、Worker bindings、observability 設定與 secrets 的規範來源。設定步驟請參閱 [SETUP.zh-TW.md](SETUP.zh-TW.md)。監控操作請參閱 [MONITORING.zh-TW.md](MONITORING.zh-TW.md)。

## 前端環境變數

### 由原始碼消費（`import.meta.env`）

| 變數 | 必填 | 本地預設值 | 說明 |
|------|------|-----------|------|
| `VITE_API_URL` | 是 | `http://localhost:8787` | 管理 API 基礎 URL |
| `VITE_ENTRA_ID_CLIENT_ID` | 是\* | — | Microsoft Entra ID 應用程式用戶端 ID |
| `VITE_ENTRA_ID_TENANT_ID` | 是\* | `common` | Microsoft Entra ID 租用戶 ID |
| `VITE_ENTRA_ID_REDIRECT_URI` | 否 | `window.location.origin` | OAuth 重新導向回呼 URI |
| `VITE_APP_NAME` | 否 | `AkaMoney` | 顯示在導覽列的應用程式名稱 |
| `VITE_SHORT_DOMAIN` | 否 | — | 用於建立短連結目標的重新導向服務基礎 URL |
| `VITE_SKIP_AUTH` | 僅開發 | `false` | 設為 `true` 以略過 Entra ID 並使用記憶體內 Stub API |
| `VITE_SENTRY_DSN` | 正式發布：是；本地：否 | 空值 | `akamoney-web` 專案的公開 Sentry DSN；空值會停用本地前端 Sentry 初始化，正式發布流程缺少此值時則會停止 |
| `VITE_SENTRY_ENVIRONMENT` | 否 | Vite mode | 前端 SDK 回報給 Sentry 的環境名稱 |
| `VITE_SENTRY_REPLAY_ENABLED` | 否 | `.env.example` 中為 `false` | 控制 error-session Replay；除非去除前後空白並轉小寫後的值為 `false`，否則原始碼會啟用 error-session Replay，而一般 Replay sessions 仍維持 0% 採樣 |

\* 進行真實 Entra ID 驗證時必填；當 `VITE_SKIP_AUTH=true` 時為選填。

> **`VITE_SKIP_AUTH` 僅限開發環境。** 此旗標與 `import.meta.env.DEV` 同時判斷，即使設定了此變數，在正式環境建置中也不會生效。

已追蹤的 `src/frontend/.env.example` 使用本地服務 URL 與空的 Sentry 值。不得提交實際 DSN 值。

### 建置流程變數（`process.env`，由 `vite.config.ts` 讀取）

以下變數在建置期間由 Vite 設定讀取，不屬於 `import.meta.env`：

| 變數 | 效果 |
|------|------|
| `GITHUB_ACTIONS` | 存在且非空白時，`build.sourcemap` 為 `'hidden'`；否則停用 source maps，避免手動建置把 map 發布出去 |
| `SENTRY_AUTH_TOKEN` | 存在且非空白時，會啟用 hidden source maps 並啟動 Sentry Vite plugin，由 plugin 上傳並自 `dist/` 刪除 map |
| `SENTRY_ORG` / `SENTRY_PROJECT` | 覆寫該 plugin 預設的 `money-5c` / `akamoney-web` 上傳目標 |

### 由發佈工作流程注入 — 原始碼未讀取

這些變數由 GitHub Actions 發佈工作流程寫入前端建置環境，但前端原始碼中沒有對應的 `import.meta.env` 存取器，且 `src/frontend/src/vite-env.d.ts` 中也不存在：

| 變數 | 工作流程來源 | 說明 |
|------|-------------|------|
| `VITE_ARCHIVED_REDIRECT_URL` | `vars.ARCHIVED_REDIRECT_URL` | 在建置時注入；目前前端原始碼中未使用 |

## 後端 Worker 配置

### Bindings

Bindings 在 `wrangler.toml` / `wrangler.local.toml` 中宣告，並作為 `c.env` 的屬性存取。

| Binding | 類型 | 必填 | 說明 |
|---------|------|------|------|
| `DB` | `D1Database` | 是 | 主要應用程式資料庫 |
| `BUCKET` | `R2Bucket` | 否 | R2 儲存桶；當 `STORAGE_PROVIDER=r2` 且執行儲存操作時需要 |
| `CF_VERSION_METADATA` | `WorkerVersionMetadata` | 否 | 透過 `[version_metadata]` 設定的 Cloudflare version metadata binding，用於 release/version observability |

### 環境變數（透過 `c.env` 存取）

| 變數 | 必填 | 說明 |
|------|------|------|
| `ENTRA_ID_TENANT_ID` | 是 | 用於 Token 驗證期間 JWKS 端點建構的 Entra ID 租用戶 ID |
| `ENTRA_ID_CLIENT_ID` | 是 | 用於 Token 受眾驗證的 Entra ID 應用程式用戶端 ID |
| `ENVIRONMENT` | 是 | 回報給 Sentry 並供執行時行為使用的部署環境。已追蹤設定為 `"development"`；release workflow 會在部署前取代為 `"production"`。 |
| `SENTRY_DSN` | 正式發布：是；本地：否 | 管理 API Worker 的公開 Sentry DSN。空值會讓本地 SDK 收到 `undefined`，等同停用傳輸。正式發布流程會要求並從 `SENTRY_BACKEND_DSN` repository variable 注入此值。 |
| `STORAGE_PROVIDER` | 否 — 預設 `r2` | 儲存後端：`r2`（預設）或 `azure` |
| `R2_PUBLIC_URL` | 否 | 可公開存取的 R2 內容基礎 URL |
| `AZURE_STORAGE_ACCOUNT` | 若使用 `azure` | Azure Blob Storage 帳戶名稱 |
| `AZURE_STORAGE_CONTAINER` | 若使用 `azure` | Azure Blob Storage 容器名稱 |
| `AZURE_STORAGE_SAS_TOKEN` | 若使用 `azure` | Azure SAS token；請設為 secret，不要設為一般變數 |
| `AZURE_PUBLIC_URL` | 否 | 可公開存取的 Azure 內容基礎 URL |
| `CDN_URL` | 否 | CDN 基礎 URL；設定後會覆蓋 `R2_PUBLIC_URL` 和 `AZURE_PUBLIC_URL` |

### Worker observability 與 source maps

| 設定 | 管理 API | 重新導向 | 說明 |
| --- | --- | --- | --- |
| `compatibility_flags = ["nodejs_compat"]` | 是 | 是 | 目前 Workers 使用的 Sentry Cloudflare SDK path 需要此相容性旗標。 |
| `upload_source_maps = true` | 是 | 是 | Wrangler 會在 `wrangler deploy` / `wrangler versions deploy` 期間上傳 Worker source maps。 |
| `[version_metadata] binding = "CF_VERSION_METADATA"` | 是 | 是 | 將 Worker version metadata 暴露給 runtime code 與 telemetry 系統。 |
| `[observability] enabled = true` | 是 | 是 | 啟用 Cloudflare Workers Logs。 |
| `[observability] head_sampling_rate = 1` | 是 | 是 | 將 Cloudflare Workers Logs head sampling 維持在 100%。 |

請參閱 [Cloudflare source map 文件](https://developers.cloudflare.com/workers/observability/source-maps/)、[Workers Logs 文件](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)與 [Version metadata 文件](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/)。

### Secrets（透過 `wrangler secret put` 或受保護的 CI secrets 設定）

Secrets 靜態加密，不會在 `wrangler.toml` 或 logs 中顯示。

| Secret | 必填 | 說明 |
|--------|------|------|
| `AZURE_STORAGE_SAS_TOKEN` | 若使用 `azure` storage | Azure Blob Storage SAS token |
| `ENTRA_ID_CLIENT_SECRET` | 否 | Entra ID 用戶端密碼 — 由發佈工作流程注入；執行時不消費 |
| `D1_ANALYTICS_API_TOKEN` | 否 | D1 分析的 Cloudflare API token — 由發佈工作流程注入 |
| `SENTRY_AUTH_TOKEN` | 僅前端 source-map upload | GitHub production environment secret，供受保護 deploy job 執行 `sentry-cli sourcemaps inject/upload`；絕不可放入 Wrangler config |

### 錯誤回應政策

後端與重新導向的 5xx responses 會被 sanitize，且不得包含 stack traces、raw exception details、tokens 或供應商診斷。4xx responses 可以保留安全的驗證細節，例如不會揭露 secrets 的 invalid input messages。

### 由發佈工作流程注入 — 原始碼未消費

這些值由 GitHub Actions 發佈管道寫入 `wrangler.toml`，但後端執行時原始碼中沒有對應的 `c.env` 存取器。它們不存在於 `src/backend/src/types/index.ts` 的 `Env` 介面中：

| 變數 | 注入方式 | 說明 |
|------|---------|------|
| `D1_ANALYTICS_ACCOUNT_ID` | Worker `[vars]` | 由 `deploy-admin-api` 任務寫入；目前無執行時消費者 |
| `D1_ANALYTICS_DATABASE_ID` | Worker `[vars]` | 由 `deploy-admin-api` 任務寫入；目前無執行時消費者 |

### 存在於類型或範例中 — 執行時未消費

這些變數出現在 `Env` 介面（`src/backend/src/types/index.ts`）或範例中，但在正式環境原始碼中未透過 `c.env` 存取。後端僅透過 Microsoft Entra JWKS 進行驗證；不使用本地 HMAC JWT secret。

| 變數 | 位置 | 說明 |
|------|------|------|
| `JWT_SECRET` | `Env` 類型 | 已宣告；執行時程式碼未存取 |
| `JWT_EXPIRES_IN` | `Env` 類型 + 範例（值：`"7d"`）| 已宣告；執行時程式碼未存取 |
| `SHORT_DOMAIN` | `Env` 類型 + 測試模擬 | 宣告為選填；在任何正式環境路由處理器中未透過 `c.env` 讀取 |
| `ENTRA_ID_CLIENT_SECRET` | `Env` 類型 + 發佈工作流程 secrets | 在類型中宣告並由 CI 注入；執行時原始碼未存取 |

## 重新導向 Worker 配置

| 變數 / Binding | 必填 | 說明 |
| --- | --- | --- |
| `DB` | 是 | 用於解析 active short codes 並記錄 clicks 的 D1 binding |
| `ENVIRONMENT` | 是 | 回報給 Sentry 的部署環境。已追蹤設定為 `"development"`；release workflow 會在部署前取代為 `"production"`。 |
| `SENTRY_DSN` | 正式發布：是；本地：否 | 重新導向 Worker 的公開 Sentry DSN。空值會讓本地 SDK 收到 `undefined`，等同停用傳輸。正式發布流程會要求並從 `SENTRY_REDIRECT_DSN` repository variable 注入此值。 |
| `CF_VERSION_METADATA` | 否 | 透過 `[version_metadata]` 設定的 version metadata binding |

## 範例檔案參考

| 服務 | 範例檔案 | 複製至 | 說明 |
|------|---------|--------|------|
| 前端 | `src/frontend/.env.example` | `src/frontend/.env` | 使用空 Sentry DSN 與本地服務 URLs |
| 管理 API | `src/backend/wrangler.local.toml.example` | `src/backend/wrangler.local.toml` | 使用 `compatibility_flags = ["nodejs_compat"]`、source maps、`CF_VERSION_METADATA`、observability 與空 `SENTRY_DSN` |
| 管理 API 舊版 env 範例 | `src/backend/.env.example` | 請勿複製 | 僅供 legacy/reference；Worker binding 與 runtime 變數應放在 `wrangler.local.toml` |
| 重新導向 | `src/redirect/wrangler.local.toml.example` | `src/redirect/wrangler.local.toml` | 使用 `compatibility_flags = ["nodejs_compat"]`、source maps、`CF_VERSION_METADATA`、observability 與空 `SENTRY_DSN` |

`wrangler.local.toml` 檔案列在 `.gitignore` 中以防止憑證洩漏。被追蹤的 `wrangler.toml` 包含 `database_id = ""`（空值）。本地開發時請在 `.local.toml` 複本中填入您的實際資料庫 ID；發佈工作流程會在 CI/CD 部署時自動填入。

---

📚 [文件目錄](README.zh-TW.md) · [設定](SETUP.zh-TW.md) · [API](API.zh-TW.md) · [監控](MONITORING.zh-TW.md)
