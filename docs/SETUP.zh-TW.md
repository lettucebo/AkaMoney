[English](SETUP.md) | 繁體中文

# AkaMoney 設定指南

## 前置需求

- **Node.js >= 24** 和 **npm** — 確切版本請查看 `.node-version`
- **Wrangler CLI** — 本地後端開發所需（`npm install -g wrangler`）
- **Cloudflare 帳號** — 免費方案即可用於開發

## 快速開始 — 僅 UI 模式

最快的方式：前端使用**記憶體內 Stub API** 執行，無需任何後端基礎設施。適用於 UI 測試和示範。

```bash
git clone https://github.com/lettucebo/AkaMoney.git
cd AkaMoney
npm run setup
cp src/frontend/.env.example src/frontend/.env
```

開啟 `src/frontend/.env` 並設定：

```env
VITE_SKIP_AUTH=true
VITE_API_URL=http://localhost:8787
VITE_SHORT_DOMAIN=http://localhost:8788
```

啟動前端：

```bash
cd src/frontend && npm run dev
```

開啟 <http://localhost:5173>。設定 `VITE_SKIP_AUTH=true` 後，所有後端呼叫均替換為記憶體內模擬資料，並略過 Entra ID 驗證。**不會儲存或擷取真實資料。請勿用於正式環境。**

完整環境變數參考請查閱 [CONFIGURATION.zh-TW.md](CONFIGURATION.zh-TW.md)。

## 完整堆疊本地開發

### 1. 複製並安裝

```bash
git clone https://github.com/lettucebo/AkaMoney.git
cd AkaMoney
npm run setup
```

### 2. 向 Cloudflare 驗證

```bash
wrangler login
```

### 3. 建立 D1 資料庫

```bash
wrangler d1 create akamoney-clicks
```

從輸出中複製 `database_id` UUID — 接下來兩步驟會需要用到。

### 4. 配置管理 API

```bash
cp src/backend/wrangler.local.toml.example src/backend/wrangler.local.toml
```

編輯 `src/backend/wrangler.local.toml` 並設定您的 `database_id`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "akamoney-clicks"
database_id = "<貼上您的資料庫 ID>"
```

> 後端範例使用 Wrangler v4 的 `compatibility_flags = ["nodejs_compat"]`。重新導向服務仍固定使用 Wrangler v3，因此保留舊版 `node_compat = true`；請勿將該 key 複製到後端設定。

### 5. 配置重新導向服務

```bash
cp src/redirect/wrangler.local.toml.example src/redirect/wrangler.local.toml
```

編輯 `src/redirect/wrangler.local.toml` 並設定相同的 `database_id`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "akamoney-clicks"
database_id = "<貼上您的資料庫 ID>"
```

### 6. 套用資料庫遷移

```bash
cd src/backend
npx wrangler d1 migrations apply DB --local --config wrangler.local.toml
```

### 7. 配置前端

```bash
cp src/frontend/.env.example src/frontend/.env
```

編輯 `src/frontend/.env`：

```env
VITE_API_URL=http://localhost:8787
VITE_SHORT_DOMAIN=http://localhost:8788
VITE_ENTRA_ID_CLIENT_ID=<您的用戶端 ID>
VITE_ENTRA_ID_TENANT_ID=<您的租用戶 ID>
VITE_ENTRA_ID_REDIRECT_URI=http://localhost:5173
VITE_APP_NAME=AkaMoney
```

已追蹤的 `.env.example` 使用 `VITE_SHORT_DOMAIN=http://localhost:8788`，也就是重新導向服務的連接埠。

完整變數參考請查閱 [CONFIGURATION.zh-TW.md](CONFIGURATION.zh-TW.md)。

### 8. 啟動所有服務

開啟三個獨立終端：

**終端 1 — 管理 API（埠號 8787）**

```bash
cd src/backend
npx wrangler dev --config wrangler.local.toml --port 8787
```

**終端 2 — 重新導向服務（埠號 8788）**

```bash
cd src/redirect
npx wrangler dev --config wrangler.local.toml --port 8788
```

**終端 3 — 前端（埠號 5173）**

```bash
cd src/frontend
npm run dev
```

> **Windows 注意：** 根目錄的 `npm run dev` 腳本只使用 shell `&` 啟動前端和管理 API，**不會**啟動重新導向服務，且在各 shell 中行為可能不同。在 Windows 上建議使用上述三終端方式。

## 健康狀態檢查

三個服務都啟動後，進行驗證：

```bash
curl http://localhost:8787/health
curl http://localhost:8788/health
```

前端登入頁面位於 <http://localhost:5173/login>。

## 驗證注意事項

- **完整堆疊模式**需要有效的 **Microsoft Entra ID** Token 才能存取所有受保護的 API 端點（`/api/urls`、`/api/analytics/*` 等）。請完成下方的 [Entra ID 配置](#entra-id-配置)。
- **`VITE_SKIP_AUTH=true`** 用記憶體內 Stub 替換所有 API 呼叫並完全略過驗證。無需 Entra ID 應用程式註冊，但不會存取真實後端資料。

## Entra ID 配置

若要為管理儀表板啟用 Microsoft 驗證：

### 在 Azure 入口網站中註冊應用程式

1. 前往 [Azure 入口網站](https://portal.azure.com) > **Microsoft Entra ID** > **應用程式註冊** > **+ 新增註冊**。
2. 輸入名稱（例如 `AkaMoney`），選擇支援的帳戶類型，並將重新導向 URI 設定為**單頁應用程式 (SPA)**：`http://localhost:5173`。
3. 點擊**註冊**，記下**應用程式（用戶端）ID** 和**目錄（租用戶）ID**。

### 配置 API 權限

1. 在應用程式註冊中，前往 **API 權限**。
2. 確認 **Microsoft Graph** > **User.Read**（委派）已存在。若無則新增。

### 更新環境變數

加入至 `src/frontend/.env`：

```env
VITE_ENTRA_ID_CLIENT_ID=<應用程式用戶端 ID>
VITE_ENTRA_ID_TENANT_ID=<目錄租用戶 ID>
VITE_ENTRA_ID_REDIRECT_URI=http://localhost:5173
```

加入至 `src/backend/wrangler.local.toml` 的 `[vars]` 下方：

```toml
ENTRA_ID_TENANT_ID = "<目錄租用戶 ID>"
ENTRA_ID_CLIENT_ID = "<應用程式用戶端 ID>"
```

### 正式環境重新導向 URI

部署至正式環境時，請在應用程式註冊的**驗證** > **單頁應用程式** > **新增 URI** 中加入您的正式環境網域。

## 部署

```bash
npm run deploy
```

此命令依序執行 `deploy:frontend`、`deploy:backend` 和 `deploy:redirect`，但前提是每個套件設定都已包含有效的正式環境資源 ID 與變數。一般正式發布應優先使用 release workflow。CI/CD 詳細資訊、環境 Secret 注入、手動部署前置條件和自訂網域設定，請查閱 [DEPLOYMENT.zh-TW.md](DEPLOYMENT.zh-TW.md)。

---

📚 [文件目錄](README.zh-TW.md) · [配置](CONFIGURATION.zh-TW.md) · [API](API.zh-TW.md)