[English](CONFIGURATION.md) | 繁體中文

# AkaMoney 配置參考

此文件是 AkaMoney 所有環境變數、Worker Bindings 和 Secrets 的規範來源。設定步驟請參閱 [SETUP.zh-TW.md](SETUP.zh-TW.md)。

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

\* 進行真實 Entra ID 驗證時必填；當 `VITE_SKIP_AUTH=true` 時為選填。

> **`VITE_SKIP_AUTH` 僅限開發環境。** 此旗標與 `import.meta.env.DEV` 同時判斷，即使設定了此變數，在正式環境建置中也不會生效。

已追蹤的 `src/frontend/.env.example` 使用 `VITE_SHORT_DOMAIN=http://localhost:8788`，也就是本地重新導向服務的連接埠。

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
| `BUCKET` | `R2Bucket` | 否 | R2 儲存桶（當 `STORAGE_PROVIDER=r2` 時必填） |

### 環境變數（透過 `c.env` 存取）

| 變數 | 必填 | 說明 |
|------|------|------|
| `ENTRA_ID_TENANT_ID` | 是 | 用於 Token 驗證期間 JWKS 端點建構的 Entra ID 租用戶 ID |
| `ENTRA_ID_CLIENT_ID` | 是 | 用於 Token 受眾驗證的 Entra ID 應用程式用戶端 ID |
| `ENVIRONMENT` | 是 | 部署環境；`production` 只會抑制 auth middleware 的 500 回應堆疊。其他 route 與全域錯誤回應目前仍可能包含 `stack`；請參閱 [API 錯誤處理](API.zh-TW.md#目前錯誤封包說明)。 |
| `STORAGE_PROVIDER` | 否 — 預設 `r2` | 儲存後端：`r2`（預設）或 `azure` |
| `R2_PUBLIC_URL` | 否 | 可公開存取的 R2 內容基礎 URL |
| `AZURE_STORAGE_ACCOUNT` | 若使用 `azure` | Azure Blob Storage 帳戶名稱 |
| `AZURE_STORAGE_CONTAINER` | 若使用 `azure` | Azure Blob Storage 容器名稱 |
| `AZURE_STORAGE_SAS_TOKEN` | 若使用 `azure` | Azure SAS Token（設為 Secret，而非一般變數） |
| `AZURE_PUBLIC_URL` | 否 | 可公開存取的 Azure 內容基礎 URL |
| `CDN_URL` | 否 | CDN 基礎 URL；設定後會覆蓋 `R2_PUBLIC_URL` 和 `AZURE_PUBLIC_URL` |

### Secrets（透過 `wrangler secret put` 設定）

Secrets 靜態加密，不會在 `wrangler.toml` 或日誌中顯示。

| Secret | 必填 | 說明 |
|--------|------|------|
| `AZURE_STORAGE_SAS_TOKEN` | 若使用 `azure` | Azure Blob Storage SAS Token |
| `ENTRA_ID_CLIENT_SECRET` | 否 | Entra ID 用戶端密碼 — 由發佈工作流程注入；執行時不消費 |
| `D1_ANALYTICS_API_TOKEN` | 否 | D1 分析的 Cloudflare API Token — 由發佈工作流程注入 |

### 由發佈工作流程注入 — 原始碼未消費

這些值由 GitHub Actions 發佈管道寫入 `wrangler.toml`，但後端執行時原始碼中沒有對應的 `c.env` 存取器。它們不存在於 `src/backend/src/types/index.ts` 的 `Env` 介面中：

| 變數 | 注入方式 | 說明 |
|------|---------|------|
| `D1_ANALYTICS_ACCOUNT_ID` | Worker `[vars]` | 由 `deploy-admin-api` 任務寫入；目前無執行時消費者 |
| `D1_ANALYTICS_DATABASE_ID` | Worker `[vars]` | 由 `deploy-admin-api` 任務寫入；目前無執行時消費者 |

### 存在於類型或範例中 — 執行時未消費

這些變數出現在 `Env` 介面（`src/backend/src/types/index.ts`）或 `wrangler.local.toml.example` 中，但在正式環境原始碼中**未**透過 `c.env` 存取。後端僅透過 Microsoft Entra JWKS 進行驗證；不使用本地 HMAC JWT Secret。

| 變數 | 位置 | 說明 |
|------|------|------|
| `JWT_SECRET` | `Env` 類型 | 已宣告；執行時程式碼未存取 |
| `JWT_EXPIRES_IN` | `Env` 類型 + 範例（值：`"7d"`）| 已宣告；執行時程式碼未存取 |
| `SHORT_DOMAIN` | `Env` 類型 + 測試模擬 | 宣告為選填；在任何正式環境路由處理器中未透過 `c.env` 讀取 |
| `ENTRA_ID_CLIENT_SECRET` | `Env` 類型 + 發佈工作流程 Secrets | 在類型中宣告並由 CI 注入；執行時原始碼未存取 |

## 範例檔案參考

| 服務 | 範例檔案 | 複製至 | 說明 |
|------|---------|--------|------|
| 前端 | `src/frontend/.env.example` | `src/frontend/.env` | — |
| 管理 API | `src/backend/wrangler.local.toml.example` | `src/backend/wrangler.local.toml` | 使用 `compatibility_flags = ["nodejs_compat"]` |
| 管理 API 舊版 env 範例 | `src/backend/.env.example` | 請勿複製 | 僅供 legacy/reference；Worker binding 與 runtime 變數應放在 `wrangler.local.toml` |
| 重新導向 | `src/redirect/wrangler.local.toml.example` | `src/redirect/wrangler.local.toml` | 使用舊版 `node_compat = true` 語法 |

`wrangler.local.toml` 檔案列在 `.gitignore` 中以防止憑證洩漏。被追蹤的 `wrangler.toml` 包含 `database_id = ""`（空值）。本地開發時請在 `.local.toml` 複本中填入您的實際資料庫 ID；發佈工作流程會在 CI/CD 部署時自動填入。

---

📚 [文件目錄](README.zh-TW.md) · [設定](SETUP.zh-TW.md) · [API](API.zh-TW.md)
