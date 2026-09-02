[English](DEVELOPMENT.md) | 繁體中文

# 開發指南

本指南詳細說明 AkaMoney 網址縮短平台的本地開發工作流程、環境需求、服務協調運行、配置設定與架構邊界。

## 前置需求與環境

### Node.js 與套件管理器

- **Node.js**: `24.x` (LTS) 或更高版本（透過 `package.json` 中的 `"engines": { "node": ">=24.0.0" }` 強制規範）。
- **套件管理器**: `npm`（本儲存庫為 npm workspace，三個應用程式套件共用同一份根目錄 `package-lock.json`）。
- **Cloudflare Wrangler CLI**: 於各套件本地安裝或全域安裝（`npm install -g wrangler`）。

### 專案結構與依賴邊界

AkaMoney 是一個 **npm workspace**，`src/` 底下有三個應用程式套件：

```
.
├── package.json              # 根目錄：宣告 workspace 並協調腳本
├── package-lock.json         # 三個 workspace 共用的單一 lockfile
└── src/
    ├── frontend/             # Vue 3 單頁應用程式（管理後台 UI）
    │   └── package.json      # 前端依賴與腳本
    ├── backend/              # Cloudflare Workers 管理 API（Hono）
    │   └── package.json      # 後端依賴與腳本（Wrangler v4）
    └── redirect/             # Cloudflare Workers 重定向服務（Hono）
        └── package.json      # 重定向服務依賴與腳本（Wrangler v3）
```

`docs/design-mockups/validation` 是刻意獨立的 npm 套件，擁有自己的
`package.json` 與 lockfile，不屬於此 workspace。

由於這是 npm workspace，在根目錄執行一次 `npm install`（或 `npm ci`）即可
一併安裝 `src/frontend`、`src/backend` 與 `src/redirect` 的依賴，並依照
唯一的根目錄 `package-lock.json` 解析版本。

---

## 本地開發設定

### 1. 安裝依賴套件

從專案根目錄執行一次，即可為所有三個 workspace 套件安裝依賴：

```bash
# 安裝根目錄與所有 workspace 的依賴套件（npm run setup 是其別名）
npm install
```

### 2. 本地 Wrangler 設定

Cloudflare Workers 本地執行所需之設定檔會被 git 忽略（`.gitignore` 排除 `wrangler.local.toml` 與 `.dev.vars`）：

1. **後端管理 API**:
   ```bash
   cd src/backend
   cp wrangler.local.toml.example wrangler.local.toml
   ```
   - **Wrangler v4 與相容性標籤**：後端採用 Wrangler v4（精確版本 `4.90.0`），並配置 `compatibility_flags = ["nodejs_compat"]`。
   - 在 `wrangler.local.toml` 中，D1 binding 的資料庫名稱為 `akamoney-clicks`。請將 `database_id` 填入您的 D1 UUID，或於本地 Miniflare 模擬時使用任意虛擬字串。

2. **重定向服務**:
   ```bash
   cd src/redirect
   cp wrangler.local.toml.example wrangler.local.toml
   ```
   - **Wrangler 相容性旗標**：重新導向服務目前使用 Wrangler v3（精確版本 `3.114.17`）並設定 `compatibility_flags = ["nodejs_compat"]`。複製或更新本地 Wrangler 設定時，請勿重新加入舊版 `node_compat = true` key。

3. **前端環境變數**:
   ```bash
   cd src/frontend
   cp .env.example .env
   ```
   - 設定 `VITE_API_URL=http://localhost:8787`（管理 API）與 `VITE_SHORT_DOMAIN=http://localhost:8788`（重定向服務）。

### 3. 本地啟動服務

本地開發時需要在指定通訊埠上同時啟動三個獨立服務：

| 服務 | 目錄 | 本地連接埠 | 預設啟動指令 |
|------|------|------------|--------------|
| **前端 UI** | `src/frontend` | `5173` | `npm run dev` (`vite`) |
| **管理 API** | `src/backend` | `8787` | `npx wrangler dev --config wrangler.local.toml --port 8787` |
| **重定向服務** | `src/redirect` | `8788` | `npx wrangler dev --config wrangler.local.toml --port 8788` |

Vite 在 `src/frontend/vite.config.ts` 中已設定將 `/api` 請求反向代理至 `http://localhost:8787`。

### 4. Windows 開發工作流程

在 Windows（PowerShell / 命令提示字元）環境下，執行根目錄腳本 `npm run dev`（背後執行 `npm run dev:frontend & npm run dev:backend`）**無法穩定並行執行**，因為 Windows shell 中的 `&` 運算子行為與 Unix 不同（常導致循序執行或無輸出的背景作業）。

在 Windows 上開發時，強烈建議**開啟三個獨立的終端機分頁**：

```powershell
# 終端機 1 - 前端（連接埠 5173）
cd src\frontend
npm run dev

# 終端機 2 - 後端管理 API（連接埠 8787）
cd src\backend
npx wrangler dev --config wrangler.local.toml --port 8787

# 終端機 3 - 重定向服務（連接埠 8788）
cd src\redirect
npx wrangler dev --config wrangler.local.toml --port 8788
```

---

## 前端純 UI 開發模式 (VITE_SKIP_AUTH)

當僅需開發前端元件、調整樣式、圖表或自動產生畫面截圖時，前端可完全獨立運行，無需啟動後端 Worker 或 Microsoft Entra ID SSO。

在 `src/frontend/.env` 或 `src/frontend/.env.local` 中設定 `VITE_SKIP_AUTH=true`：

```ini
# 前端獨立 Mock 模式
VITE_SKIP_AUTH=true
```

### 記憶體 Mock 系統機制

當設定 `VITE_SKIP_AUTH=true` 且 Vite 處於開發模式（`import.meta.env.DEV`）時：
- **Mock 身份驗證**（`src/frontend/src/services/auth.ts`）：略過 MSAL 與 Entra ID 登入流程，自動注入測試使用者帳號（`Development User`, `dev@localhost`）。
- **記憶體資料庫**（`src/frontend/src/services/api.ts`）：攔截 API 呼叫，於記憶體中返回假資料（包含網址列表、點擊分析與 KPI 統計）。新增、編輯與刪除操作會即時修改記憶體陣列（重新整理頁面後重置）。
- **安全性**：`isAuthSkipped()` 在正式建置（Production）環境下必定回傳 `false`（依賴 `import.meta.env.DEV` 檢查），防止測試假資料外洩至正式環境。

---

## 原始碼邊界與 API 契約鏡像

AkaMoney 在前端與後端服務之間維持嚴格的架構邊界：

- **型別契約**：前端 TypeScript 介面於 `src/frontend/src/types/index.ts`（`UrlResponse`, `CreateUrlRequest`, `UpdateUrlRequest`, `AnalyticsResponse`, `OverallStatsResponse`）精確鏡像後端 `src/backend/src/types/index.ts` 所定義的資料契約。
- **後端隔離**：`src/backend` 專責處理具身分驗證的管理端點（`/api/urls`, `/api/analytics`, `/api/storage`）、Entra 權杖驗證及排程 Cron 清理任務。
- **重定向隔離**：`src/redirect` 為極度輕量、公開、唯讀的 Cloudflare Worker，專注於高速 HTTP 302 重定向（`/:shortCode`）與透過 `c.executionCtx.waitUntil()` 進行非同步點擊遙測記錄。

---

## 資料庫遷移

D1 資料庫遷移 SQL 檔案位於 `src/backend/migrations/`。

- **本地執行資料庫遷移**（Miniflare SQLite）：
  ```bash
  cd src/backend
  npx wrangler d1 migrations apply DB --local --config wrangler.local.toml
  ```

- **正式環境執行資料庫遷移**：
  ```bash
  cd src/backend
  npx wrangler d1 migrations apply DB --remote --config wrangler.toml
  ```

  手動執行遠端指令前，請先填入已追蹤設定中空白的 `database_id`。Release workflow 會自動注入此值。

目前套件的 `db:*` scripts 使用資料庫名稱 `akamoney`，但 Worker 綁定的是
`akamoney-clicks`。在 scripts 對齊之前，請使用上方以 `DB` binding 為目標的指令。

關於完整的資料庫架構圖、遷移歷程與 D1 binding 指南，請參閱 [資料庫文件](DATABASE.zh-TW.md)。

---

## 相關文件

- [資料庫文件](DATABASE.zh-TW.md)
- [測試指南](TESTING.zh-TW.md)
- [部署指南](DEPLOYMENT.zh-TW.md)
- [問題排解指南](TROUBLESHOOTING.zh-TW.md)
- [API 文件](API.zh-TW.md)
- [設定指南](SETUP.zh-TW.md)
- [專案 README](../README.zh-TW.md)
