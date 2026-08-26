[English](TROUBLESHOOTING.md) | 繁體中文

# 問題排解指南

本指南針對 AkaMoney 在本地開發、資料庫操作、身份驗證、發布部署與 UI 渲染過程中常見的錯誤提供診斷步驟與具體解決方案。

## 概覽

AkaMoney 由三個獨立的子系統所組成（前端、管理 API 與重定向服務）。在排查問題時，請先依據連接埠、日誌或 HTTP 狀態碼確認回報錯誤的所屬子系統。

---

## 本地開發與環境問題

### 1. 子專案遺漏依賴套件

- **現象**：執行 `npm install` 後出現 `Cannot find module '@azure/msal-browser'`、`hono not found` 或 TypeScript 編譯錯誤。
- **原因**：AkaMoney 在 `src/frontend`、`src/backend` 與 `src/redirect` 中分別維護獨立的 `package.json`。僅在根目錄執行 `npm install` 不會安裝子專案的依賴套件。
- **解決方案**：執行根目錄的 setup 腳本或分別進入各目錄安裝：
  ```bash
  # 安裝根目錄與所有子專案的依賴套件
  npm run setup
  ```

### 2. 服務連接埠衝突 (8787 與 8788)

- **現象**：啟動重定向 Worker 或管理 API 時出現 `Error: Port 8787 is already in use` 或 `EADDRINUSE`。
- **原因**：若未特別指定，Cloudflare Workers 預設皆會嘗試綁定 `8787` 連接埠。
- **解決方案**：啟動重定向服務時明確指定使用 `8788` 連接埠：
  ```bash
  cd src/redirect
  npx wrangler dev --config wrangler.local.toml --port 8788
  ```

### 3. Windows PowerShell 根目錄 dev 腳本並行問題

- **現象**：在 Windows PowerShell 中執行 `npm run dev` 發生 `&` 語法錯誤，或僅啟動了前端而後端從未被啟動。
- **原因**：根目錄腳本 `"dev": "npm run dev:frontend & npm run dev:backend"` 使用了 POSIX shell 的背景執行語法（`&`），在 Windows PowerShell 中不被支援。
- **解決方案**：開啟三個獨立的終端機視窗或分頁分別啟動服務：
  ```powershell
  # 終端機 1：前端（5173）
  cd src\frontend; npm run dev

  # 終端機 2：管理 API（8787）
  cd src\backend; npx wrangler dev --config wrangler.local.toml --port 8787

  # 終端機 3：重定向服務（8788）
  cd src\redirect; npx wrangler dev --config wrangler.local.toml --port 8788
  ```

### 4. 後端本地 Wrangler 設定殘留舊版 node_compat

- **現象**：Wrangler v4 顯示棄用警告或錯誤：`ExperimentalNodeCompatError: node_compat is deprecated`。
- **原因**：舊版 `wrangler.local.toml.example` 包含 `node_compat = true`。後端目前已採用 Wrangler v4（`^4.59.1`），需要使用現代相容性標籤。
- **解決方案**：更新本地 `src/backend/wrangler.local.toml`，將 `node_compat` 替換為：
  ```toml
  # 於 src/backend/wrangler.local.toml
  compatibility_date = "2024-12-17"
  compatibility_flags = ["nodejs_compat"]
  ```

---

## 資料庫與遷移常見陷阱

### 5. D1 資料庫 ID 為空錯誤

- **現象**：API 回傳 `500 Configuration Error: Database is not configured`，詳細資訊為 `DB binding is missing`。
- **原因**：`wrangler.local.toml` 中的 `database_id = ""` 或遺漏了 `[[d1_databases]]` 綁定。
- **解決方案**：在本地設定檔中填入真實或虛擬的 D1 UUID：
  ```toml
  [[d1_databases]]
  binding = "DB"
  database_name = "akamoney-clicks"
  database_id = "local-dev-db-id"
  ```

### 6. 資料庫名稱陷阱：akamoney 與 akamoney-clicks

- **現象**：資料庫遷移執行成功，但 API 查詢時卻拋出 `no such table: urls` 或 `no such table: click_records`。
- **原因**：`src/backend/package.json` 中的腳本預設使用 `wrangler d1 migrations apply akamoney`，但 `wrangler.toml` 與 CI 中配置的資料庫名稱為 `akamoney-clicks`。若遷移指令中的名稱與 Worker binding 中的名稱不一致，遷移將會套用至不同的資料庫實例。
- **解決方案**：使用本地 Wrangler 設定中的 `DB` binding，不要使用套件腳本或另一個資料庫名稱：
  ```bash
  cd src/backend
  npx wrangler d1 migrations apply DB --local --config wrangler.local.toml
  ```

### 7. 本地與雲端 D1 資料庫環境隔離

- **現象**：本地開發運作正常，但正式環境部署後呼叫 API 卻回傳 `D1_ERROR: no such table: urls`。
- **原因**：本地 Miniflare D1 狀態（`.wrangler/state/v3/d1`）與 Cloudflare 雲端 D1 資料庫完全隔離。本地執行的遷移不會套用至線上。
- **解決方案**：在部署前或部署時對線上 Cloudflare D1 執行遷移：
  ```bash
  cd src/backend
  npx wrangler d1 migrations apply DB --remote --config wrangler.toml
  ```
  已追蹤的 `wrangler.toml` 中 `database_id` 是空值；請先填入，或使用會注入正式環境 ID 的 release workflow。

---

## 路由、網域與身份驗證問題

### 8. VITE_SHORT_DOMAIN 指向錯誤連接埠

- **現象**：在本地測試時點擊前端產生的短網址會連至 `http://localhost:8787/xyz`（404 Not Found）而非進行重定向。
- **原因**：`src/frontend/.env`（或優先序更高的 `.env.local`）把 `VITE_SHORT_DOMAIN` 設為管理 API 的 `http://localhost:8787`，而非重新導向服務的 `8788`。
- **解決方案**：更新 `src/frontend/.env`；若 `.env.local` 存在，也要更新或移除其中的覆寫：
  ```ini
  # 於 src/frontend/.env
  VITE_API_URL=http://localhost:8787
  VITE_SHORT_DOMAIN=http://localhost:8788
  ```

### 9. 身份驗證 401 未授權與 Entra ID 500 內部伺服器錯誤

- **現象與區別**：
  - **401 Unauthorized**：`Authorization: Bearer <token>` 標頭中遺漏 JWT 權杖、權杖已過期或無效。
  - **500 Internal Server Error（SSO 流程中）**：後端因缺少 `ENTRA_ID_TENANT_ID` 或 `ENTRA_ID_CLIENT_ID` 而未完成驗證設定。
- **解決方案**：使用 `wrangler tail` 檢查即時日誌。若僅進行純前端 UI 測試，可在 `src/frontend/.env`（或優先序更高的 `.env.local`）設定 `VITE_SKIP_AUTH=true`：
  ```bash
  # 檢視線上 Worker 即時日誌
  npx wrangler tail akamoney-admin-api
  ```

### 10. CORS 跨來源資源共用錯誤

- **現象**：瀏覽器 Console 顯示：`Access to fetch at 'http://localhost:8787/api/...' has been blocked by CORS policy`。
- **原因**：API client 使用 `VITE_API_URL`（預設 `http://localhost:8787`），因此瀏覽器會直接請求 Admin API 並依賴其 CORS middleware。後端可能尚未啟動、URL 可能錯誤，或 preflight 回應缺少 CORS header。
- **解決方案**：確認 Admin API 在 `8787` 執行、前端設定一致，並檢查後端回應與 log。已提交的 API client 預設不使用相對 proxy URL：
  ```env
  VITE_API_URL=http://localhost:8787
  ```

---

## 儲存、多媒體與 UI 問題

### 11. 儲存上傳失敗與公開網址失效

- **現象**：圖片上傳失敗並回傳 `500 Storage is not configured`，或上傳後的預覽圖片無法載入（破圖）。
- **原因**：`[vars]` 中缺少 `STORAGE_PROVIDER` 設定，或 `wrangler.local.toml` 中未配置 `R2_PUBLIC_URL` / `BUCKET` 綁定。
- **解決方案**：確保 `wrangler.local.toml` 中已設定 R2 儲存貯體綁定與公開網址：
  ```toml
  [[r2_buckets]]
  binding = "BUCKET"
  bucket_name = "akamoney-storage"
  preview_bucket_name = "akamoney-storage-preview"

  [vars]
  STORAGE_PROVIDER = "r2"
  R2_PUBLIC_URL = "https://storage.aka.money"
  ```

### 12. Chart.js 圖表樣式與深色主題顯示異常

- **現象**：切換至深色主題時，統計圖表的文字或網格與深色背景融為一體，難以辨識。
- **原因**：只切換 `data-theme` 屬性時，Chart.js 的 Canvas 元素不會自動繼承更新後的 CSS token 色彩。
- **解決方案**：AkaMoney 提供 `useChartTheme` composable（`src/frontend/src/composables/useChartTheme.ts`），回傳 computed theme；`BaseChart.vue` 會監看其值並套用到 Chart.js：
  ```typescript
  import { useChartTheme } from '@/composables/useChartTheme';
  const chartTheme = useChartTheme();
  // chartTheme.value.text 與 chartTheme.value.grid
  ```

---

## 相關文件

- [開發指南](DEVELOPMENT.zh-TW.md)
- [測試指南](TESTING.zh-TW.md)
- [部署指南](DEPLOYMENT.zh-TW.md)
- [資料庫文件](DATABASE.zh-TW.md)
- [主題樣式文件](THEME.zh-TW.md)
- [API 文件](API.zh-TW.md)
- [專案 README](../README.zh-TW.md)
