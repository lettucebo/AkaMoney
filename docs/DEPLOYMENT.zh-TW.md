[English](DEPLOYMENT.md) | 繁體中文

# 部署指南

本文件說明 AkaMoney 的正式環境部署架構、GitHub Actions CI/CD 發布工作流程（`.github/workflows/release.yml`）、雲端資源自動佈建、密鑰配置、資料庫遷移及手動部署替代程序。

## 架構與發布概覽

AkaMoney 部署於 Cloudflare 開發者平台，由三個獨立服務所組成：

| 元件 | 目標平台 | 正式環境專案/服務名稱 | 路由/網域 |
|------|----------|----------------------|-----------|
| **前端 UI** | Cloudflare Pages | `akamoney-admin` | `admin.aka.money`（或 `*.pages.dev`） |
| **管理 API** | Cloudflare Workers | `akamoney-admin-api` | `api.aka.money`（或 `*.workers.dev`） |
| **重定向服務** | Cloudflare Workers | `akamoney-redirect` | `go.aka.money`（或 `*.workers.dev`） |

---

## 自動化 CI/CD 發布管線 (.github/workflows/release.yml)

正式環境發布透過 `.github/workflows/release.yml` 的 GitHub Actions 進行自動化。

### 工作流程觸發條件

發布管線支援三種經驗證的觸發條件：

```yaml
on:
  push:
    tags:
      - '*'
  pull_request_target:
    types: [labeled]
  workflow_dispatch:
```

1. **Tag Push (`push: tags: ['*']`)**：標準正式環境發布推薦方式（例如 `git tag 1.2.0 && git push origin 1.2.0`）。
2. **手動觸發 (`workflow_dispatch`)**：專案維護者可從 GitHub Actions 介面直接手動觸發。
3. **PR 標籤發布 (`pull_request_target`)**：當 Pull Request 被加上 `run-release` 標籤時觸發。

### 安全性模型 (pull_request_target)

- **執行權限背景**：與一般 `pull_request` 不同，`pull_request_target` 是在基礎分支（`main`）的安全性背景下執行，因此擁有存取專案 Secrets（如 `CLOUDFLARE_API_TOKEN`）的權限。
- **存取控制**：只有具備專案寫入/分派權限（Write Access）的維護者才能為 PR 套用 `run-release` 標籤，確保不受信任的外部貢獻者無法擅自觸發包含密鑰的發布流程。
- **預發布風險注意**：此工作流程會檢出 PR 的最新 Commit SHA（`github.event.pull_request.head.sha`）。維護者在貼上標籤前必須審慎審查 PR 程式碼，避免未驗證程式碼被部署至正式環境。

### 管線執行順序與資源佈建

工作流程包含四個互相協調的 Job：

1. **`build` Job**：
   - 檢出對應之 Git Ref。
   - 於根目錄、後端、前端與重定向目錄安裝依賴。
   - 注入前端建置期環境變數（`VITE_ENTRA_ID_CLIENT_ID`、`VITE_ENTRA_ID_TENANT_ID`、`VITE_ENTRA_ID_REDIRECT_URI`、`VITE_API_URL`、`VITE_APP_NAME`、`VITE_SHORT_DOMAIN`、`VITE_ARCHIVED_REDIRECT_URL`）。
   - 建置前端靜態資源（`src/frontend/dist/`）並上傳 `frontend-dist` artifact。
   - 針對後端與重定向服務執行部署乾跑檢查（`wrangler deploy --dry-run`）。

2. **`deploy-admin-api` Job**（目標環境：`production`）：
   - 自動檢查 D1 資料庫 `akamoney-clicks` 是否存在；若不存在則透過 `wrangler d1 create` 自動建立。
   - 透過 `wrangler d1 list --json` 動態取得 D1 UUID 並注入至 `src/backend/wrangler.toml`：
     ```bash
     sed -i 's/^[[:space:]]*database_id[[:space:]]*=[[:space:]]*""/database_id = "'"${CLOUDFLARE_D1_DATABASE_ID}"'"/' src/backend/wrangler.toml
     ```
   - 檢查 R2 儲存貯體 `akamoney-storage` 是否存在；若不存在則透過 `wrangler r2 bucket create` 自動建立。
   - 注入 Worker 環境變數（`[vars]`）與 Worker Secrets（`wrangler secret put`）。
   - 透過 `cloudflare/wrangler-action@v3` 部署 Worker。

3. **`deploy-redirect` Job**（目標環境：`production`）：
   - 取得 `akamoney-clicks` 的 D1 資料庫 ID 並注入至 `src/redirect/wrangler.toml`。
   - 透過 `cloudflare/wrangler-action@v3` 部署重定向服務 Worker。

4. **`deploy-frontend` Job**（目標環境：`production`）：
   - 下載 `frontend-dist` 建置產物。
   - 確保 Pages 專案 `akamoney-admin` 存在（若無則透過 `wrangler pages project create` 建立）。
   - 透過 `wrangler pages deploy dist --project-name=akamoney-admin` 部署至 Cloudflare Pages。

---

## 環境設定：GitHub Secrets 與 Variables

請於 GitHub 存放庫的 **Settings > Secrets and variables > Actions** 中進行設定：

### Workflow Secrets

- `CLOUDFLARE_API_TOKEN`：具備 Workers、Pages、D1 與 R2 權限之 Cloudflare API Token（需包含 `Edit Cloudflare Workers`、`D1:Edit`、`R2:Edit`、`Pages:Edit` 權限）。
- `ENTRA_ID_CLIENT_SECRET`：*（選填）* Release workflow 只會在此值存在時注入；runtime backend 不會讀取此值，也不會執行 SSO 權杖交換。
- `AZURE_STORAGE_SAS_TOKEN`：*（選填）* Azure Blob Storage SAS 權杖（僅在 `STORAGE_PROVIDER=azure` 時需要）。

### 必要與選填 Variables

- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 帳號 ID。
- `CLOUDFLARE_D1_DATABASE_ID`：*（選填）* 若需手動覆寫 D1 UUID 時填寫。
- `ENTRA_ID_TENANT_ID`：Microsoft Entra ID 租用戶識別碼（Tenant ID）。
- `ENTRA_ID_CLIENT_ID`：Microsoft Entra ID 應用程式（用戶端）識別碼（Client ID）。
- `ENTRA_ID_REDIRECT_URI`：前端重定向網址（例如 `https://admin.aka.money`）。
- `VITE_API_URL`：後端管理 API 基礎網址（例如 `https://api.aka.money`）。
- `SHORT_DOMAIN`：產生之縮短網址網域（例如 `https://aka.money` 或 `https://go.aka.money`）。
- `STORAGE_PROVIDER`：`"r2"`（預設）或 `"azure"`。
- `AZURE_STORAGE_ACCOUNT` 與 `AZURE_STORAGE_CONTAINER`：*（選填）* Azure 儲存帳戶與容器名稱。
- `ENVIRONMENT`：正式 Worker 應設為 `"production"`。已追蹤設定預設為 `"development"`，目前 release workflow 不會覆寫此值。

### 廢棄/未接入變數說明

發布工作流程中包含部分早期鷹架殘留的變數注入步驟：
- `D1_ANALYTICS_ACCOUNT_ID`、`D1_ANALYTICS_DATABASE_ID`、`D1_ANALYTICS_API_TOKEN`
- `VITE_ARCHIVED_REDIRECT_URL` / `ARCHIVED_REDIRECT_URL`

> **維護者注意事項**：上述變數在 `src/frontend`、`src/backend` 與 `src/redirect` 原始碼中**並未被使用**。請勿因工作流程中存在該變數而假設系統已實作 Analytics API 或已歸檔網址重定向等功能。

---

## 排程任務：點擊紀錄自動清理 Cron

管理 API Worker（`src/backend`）內建定時清理排程，定義於 `src/backend/wrangler.toml`：

```toml
[triggers]
crons = ["0 2 * * *"]  # 每日 UTC 02:00（台灣時間 10:00）執行
```

- **執行邏輯**：`src/backend/src/index.ts` 導出 `scheduled` 處理常式，呼叫 `cleanupOldClickRecords(env.DB, 365)`。
- **保留期限**：自動清除 `click_records` 資料表中超過 365 天的歷史點擊紀錄，防止資料庫空間無限膨脹。

---

## 部署中的資料庫遷移

資料庫遷移 SQL 檔案位於 `src/backend/migrations/`。若要在部署時更新正式環境結構：

```bash
cd src/backend
npx wrangler d1 migrations apply DB --remote --config wrangler.toml
```

*（注意：請確認 D1 資料庫名稱 `akamoney-clicks` 與線上 D1 實例名稱一致）。*

---

## 手動部署替代方案

若需要使用 Wrangler CLI 進行手動部署：

### 1. 手動部署管理 API

以下指令會修改已追蹤的 `wrangler.toml` 設定。請勿提交環境專用修改；建議優先使用會注入正式資料庫 ID 的 release workflow。

```bash
cd src/backend

# 先在 wrangler.toml 填入空白的 database_id 與正式環境變數。
# 透過設定好的 binding 執行遠端資料庫遷移。
npx wrangler d1 migrations apply DB --remote --config wrangler.toml

# 僅在 STORAGE_PROVIDER=azure 時設定 Azure 儲存憑證
npx wrangler secret put AZURE_STORAGE_SAS_TOKEN

# 部署 Worker
npx wrangler deploy
```

### 2. 手動部署重定向服務

```bash
cd src/redirect

# 部署重定向 Worker
npx wrangler deploy
```

### 3. 手動部署前端

```bash
cd src/frontend

# 帶入環境變數建置前端資產
VITE_API_URL="https://api.aka.money" \
VITE_SHORT_DOMAIN="https://go.aka.money" \
VITE_ENTRA_ID_CLIENT_ID="<your-client-id>" \
VITE_ENTRA_ID_TENANT_ID="<your-tenant-id>" \
VITE_ENTRA_ID_REDIRECT_URI="https://admin.aka.money" \
npm run build

# 部署至 Cloudflare Pages
npx wrangler pages deploy dist --project-name=akamoney-admin
```

---

## 驗證、可觀測性與版本回退

### 部署後冒煙測試

使用 `curl` 驗證各端點健康狀態：

```bash
# 1. 驗證管理 API 健康檢查
curl -s https://api.aka.money/health

# 2. 驗證重定向服務健康檢查
curl -s https://go.aka.money/health

# 3. 測試網址重定向（預期回應 HTTP 302）
curl -I https://go.aka.money/demo1
```

### 即時日誌追蹤

使用 `wrangler tail` 串流即時 Worker 運行日誌：

```bash
# 追蹤管理 API 日誌
npx wrangler tail akamoney-admin-api

# 追蹤重定向服務日誌
npx wrangler tail akamoney-redirect
```

### 版本回退策略

若發布版本發生異常：

```bash
# 回退 Cloudflare Pages（前端）
npx wrangler pages deployment list --project-name=akamoney-admin
npx wrangler pages deployment rollback <DEPLOYMENT_ID> --project-name=akamoney-admin

# 回退 Cloudflare Workers（後端 / 重定向）
npx wrangler deployments list --name akamoney-admin-api
npx wrangler rollback <DEPLOYMENT_ID> --name akamoney-admin-api
```

或者，亦可直接登入 Cloudflare 控制台，在 **Workers & Pages > Deployments** 介面中執行一鍵回退。

---

## 相關文件

- [開發指南](DEVELOPMENT.zh-TW.md)
- [測試指南](TESTING.zh-TW.md)
- [問題排解指南](TROUBLESHOOTING.zh-TW.md)
- [資料庫文件](DATABASE.zh-TW.md)
- [API 文件](API.zh-TW.md)
- [專案 README](../README.zh-TW.md)
