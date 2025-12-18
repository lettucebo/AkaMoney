# AkaMoney 設定指南

本指南將協助您在本地設定和執行 AkaMoney 網址縮短服務，並將其部署到 Cloudflare。

## 前置需求

- Node.js 24.x（LTS）
- npm 或 yarn
- Cloudflare 帳號（免費方案即可）
- Wrangler CLI（`npm install -g wrangler`）

## 初始設定

### 1. 複製專案並安裝相依套件

```bash
# 複製儲存庫
git clone https://github.com/lettucebo/AkaMoney.git
cd AkaMoney

# 安裝所有專案的相依套件
npm run setup
```

### 2. 配置 Cloudflare

#### 登入 Cloudflare
```bash
wrangler login
```

#### 建立 D1 資料庫
```bash
cd src/backend
wrangler d1 create akamoney-clicks
```

此命令會輸出資料庫 ID。複製它並建立您的本地配置：
```bash
cp src/backend/wrangler.local.toml.example src/backend/wrangler.local.toml
```

編輯 `src/backend/wrangler.local.toml` 並設定您的 database_id：
```toml
[[d1_databases]]
binding = "DB"
database_name = "akamoney-clicks"
database_id = "YOUR_DATABASE_ID_HERE"
```

> **注意**：`wrangler.local.toml` 檔案已被 git 忽略，以防止敏感資訊洩漏。主要的 `wrangler.toml` 保留為範本，其中 `database_id` 為空，供 CD 部署時自動從 Secrets 注入。

#### 執行資料庫遷移
```bash
# 用於本地開發
wrangler d1 migrations apply akamoney-clicks --local

# 用於生產環境
wrangler d1 migrations apply akamoney-clicks --remote
```

#### 建立 R2 Bucket
```bash
wrangler r2 bucket create akamoney-storage
wrangler r2 bucket create akamoney-storage-preview
```

#### 設定密鑰
```bash
# 設定 JWT 密鑰
wrangler secret put JWT_SECRET
# 提示時輸入一個強隨機字串

# 如果使用 Entra ID，設定這些密鑰：
wrangler secret put ENTRA_ID_CLIENT_SECRET
```

### 3. 配置環境變數

#### 後端環境
建立 `src/backend/.env`：
```bash
cp src/backend/.env.example src/backend/.env
```

編輯 `src/backend/.env` 並填入您的值。

#### 前端環境
建立 `src/frontend/.env`：
```bash
cp src/frontend/.env.example src/frontend/.env
```

編輯 `src/frontend/.env`：
```env
VITE_API_URL=http://localhost:8787
VITE_ENTRA_ID_CLIENT_ID=your_client_id
VITE_ENTRA_ID_TENANT_ID=your_tenant_id
VITE_ENTRA_ID_REDIRECT_URI=http://localhost:5173
VITE_APP_NAME=AkaMoney
VITE_SHORT_DOMAIN=http://localhost:8787
```

## 開發

### 本地執行

> **重要**：對於使用 D1 資料庫的本地開發，請確保您已按照上述「建立 D1 資料庫」章節建立包含資料庫 ID 的 `wrangler.local.toml`。

#### 選項 1：同時執行前端和後端
```bash
npm run dev
```

這將啟動：
- 前端於 http://localhost:5173
- 後端於 http://localhost:8787

#### 選項 2：分別執行
```bash
# 終端機 1 - 後端（使用本地配置）
cd src/backend
wrangler dev --config wrangler.local.toml

# 終端機 2 - 前端
cd src/frontend
npm run dev
```

### 測試 API

您可以使用 curl 測試後端 API：

```bash
# 健康檢查
curl http://localhost:8787/health

# 建立短網址（無需驗證）
curl -X POST http://localhost:8787/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"original_url": "https://example.com"}'

# 測試重定向
curl -L http://localhost:8787/YOUR_SHORT_CODE
```

## 部署

### 部署後端到 Cloudflare Workers

```bash
cd backend
npm run deploy
```

這將把您的 worker 部署到 Cloudflare。記下 URL（例如：`https://akamoney-api.YOUR_SUBDOMAIN.workers.dev`）。

### 部署前端到 Cloudflare Pages

```bash
cd frontend

# 建置前端
npm run build

# 部署到 Cloudflare Pages
wrangler pages deploy dist
```

或使用 Cloudflare 儀表板：
1. 前往 Pages 在您的 Cloudflare 儀表板
2. 建立新專案
3. 連接您的 GitHub 儲存庫
4. 設定建置命令：`cd src/frontend && npm install && npm run build`
5. 設定建置輸出目錄：`src/frontend/dist`
6. 從 `src/frontend/.env.example` 新增環境變數

### 更新前端配置

部署後端後，更新 `src/frontend/.env`（或 Cloudflare Pages 環境變數）：

```env
VITE_API_URL=https://akamoney-api.YOUR_SUBDOMAIN.workers.dev
VITE_SHORT_DOMAIN=https://akamoney-api.YOUR_SUBDOMAIN.workers.dev
```

然後重新部署前端。

## Entra ID 設定（Microsoft Entra ID / Azure AD 驗證）

若要為管理儀表板啟用 Microsoft 驗證，請遵循以下詳細步驟：

### 步驟 1：存取 Azure 入口網站

1. 前往 [Azure 入口網站](https://portal.azure.com)
2. 使用您的 Microsoft 帳號登入
3. 導覽至 **Microsoft Entra ID**（前身為 Azure Active Directory）

### 步驟 2：註冊新應用程式

1. 在左側邊欄中，點擊 **應用程式註冊**
2. 點擊頂部的 **+ 新增註冊**
3. 填寫註冊表單：
   - **名稱**：`AkaMoney`（或您偏好的名稱）
   - **支援的帳戶類型**：根據您的需求選擇：
     - **單一租用戶**：僅限您組織中的帳戶
     - **多租用戶**：任何組織目錄中的帳戶
     - **個人 Microsoft 帳戶**：包含個人帳戶（建議使用以獲得更廣泛的存取權）
   - **重新導向 URI**：選擇 **單頁應用程式 (SPA)** 並輸入：
     - 開發環境：`http://localhost:5173`
     - 點擊 **新增 URI** 以新增生產環境 URL：`https://your-domain.pages.dev`
4. 點擊 **註冊**

### 步驟 3：配置驗證

1. 註冊後，前往左側邊欄的 **驗證**
2. 在 **平台組態** 下，確認您的重新導向 URI 已列出
3. 如有需要，新增額外的重新導向 URI：
   - 點擊單頁應用程式下的 **新增 URI**
   - 新增您的生產域名
4. 在 **隱含授權和混合流程** 下：
   - ✅ 勾選 **ID 權杖**（用於使用者登入）
5. 在 **允許公用用戶端流程** 下：保持為 **否**
6. 點擊頂部的 **儲存**

### 步驟 4：配置 API 權限

1. 點擊左側邊欄的 **API 權限**
2. 預設權限應包含：
   - **Microsoft Graph** > **User.Read**（讀取使用者設定檔）
3. 如果不存在，請新增：
   - 點擊 **+ 新增權限**
   - 選擇 **Microsoft Graph**
   - 選擇 **委派權限**
   - 找到並勾選 **User.Read**
   - 點擊 **新增權限**
4. 選用：如果您有管理員權限，點擊 **授與管理員同意**（這會為所有使用者預先核准權限）

### 步驟 5：取得應用程式 ID

1. 前往左側邊欄的 **概觀**
2. 複製以下值（配置時需要）：
   - **應用程式（用戶端）ID**：這是您的 `VITE_ENTRA_ID_CLIENT_ID`
   - **目錄（租用戶）ID**：這是您的 `VITE_ENTRA_ID_TENANT_ID`

### 步驟 6：產生用戶端密碼（用於後端 API - 選用）

> **注意**：只有當您計劃使用伺服器端驗證流程時才需要用戶端密碼。對於目前使用 MSAL 的 SPA 實作，這是選用的。

1. 點擊左側邊欄的 **憑證和密碼**
2. 點擊 **+ 新增用戶端密碼**
3. 輸入描述：`AkaMoney Backend Secret`
4. 選擇到期期間：
   - **180 天（6 個月）** - 更安全，需要定期輪換
   - **730 天（24 個月）** - 較少維護
   - **自訂** - 設定您自己的到期時間
5. 點擊 **新增**
6. **重要**：立即複製 **值**（不會再次顯示）
7. 安全儲存它 - 您將需要它用於 `ENTRA_ID_CLIENT_SECRET`

### 步驟 7：配置應用程式設定（選用）

1. 前往左側邊欄的 **商標和屬性**
2. 自訂您的應用程式：
   - **標誌**：上傳您的應用程式標誌（256x256 像素 PNG）
   - **首頁 URL**：`https://your-domain.pages.dev`
   - **服務條款 URL**：您的服務條款頁面
   - **隱私權聲明 URL**：您的隱私政策頁面
3. 點擊 **儲存**

### 步驟 8：更新環境變數

#### 前端配置（`src/frontend/.env`）：
```env
VITE_ENTRA_ID_CLIENT_ID=<您的應用程式用戶端ID>
VITE_ENTRA_ID_TENANT_ID=<您的目錄租用戶ID>
VITE_ENTRA_ID_REDIRECT_URI=http://localhost:5173
```

#### 後端配置（Wrangler 密碼）：
```bash
# 如果對後端驗證使用用戶端密碼
wrangler secret put ENTRA_ID_CLIENT_SECRET
# 提示時，貼上您先前複製的密碼值
```

#### 後端配置（`src/backend/.env`）：
```env
ENTRA_ID_TENANT_ID=<您的目錄租用戶ID>
ENTRA_ID_CLIENT_ID=<您的應用程式用戶端ID>
```

### 步驟 9：生產環境配置

對於生產部署：

1. 將您的生產域名新增到重新導向 URI：
   - 前往 **驗證** > **平台組態**
   - 在 **單頁應用程式** 下，點擊 **新增 URI**
   - 新增：`https://your-actual-domain.pages.dev` 或 `https://aka.money`
   - 點擊 **儲存**

2. 更新 Cloudflare Pages 環境變數：
   - 前往 Cloudflare 儀表板 > Pages > 您的專案 > 設定 > 環境變數
   - 新增：
     - `VITE_ENTRA_ID_CLIENT_ID`：您的用戶端 ID
     - `VITE_ENTRA_ID_TENANT_ID`：您的租用戶 ID
     - `VITE_ENTRA_ID_REDIRECT_URI`：`https://your-actual-domain.pages.dev`

### 步驟 10：測試驗證

1. 啟動您的開發伺服器：
   ```bash
   npm run dev
   ```

2. 導覽至 `http://localhost:5173/login`

3. 點擊「使用 Microsoft 登入」

4. 您應該會被重新導向到 Microsoft 登入頁面

5. 成功登入後，您應該會被重新導向回您的儀表板

### Entra ID 疑難排解

#### 錯誤：「AADSTS50011：請求中指定的回覆 URL 不符合」
- **解決方案**：確認 Azure 入口網站中的重新導向 URI 完全符合（包括 http/https 和尾隨斜線）

#### 錯誤：「AADSTS700016：找不到應用程式」
- **解決方案**：檢查 `.env` 檔案中的用戶端 ID 是否與 Azure 入口網站中的應用程式 ID 相符

#### 錯誤：「AADSTS65001：使用者或管理員尚未同意」
- **解決方案**：在 Azure 入口網站的 API 權限下授與管理員同意，或讓使用者在首次登入時同意

#### 錯誤：「使用者取消驗證」
- **解決方案**：當使用者關閉彈出視窗時，這是預期的。在錯誤處理中妥善處理

#### 彈出視窗被封鎖
- **解決方案**：改用重新導向流程，在 `auth.service.ts` 中呼叫 `loginRedirect()`

### 多租用戶考量

如果您在註冊期間選擇了多租用戶：

1. 來自任何 Azure AD 組織的使用者都可以登入
2. 個人 Microsoft 帳戶也可以登入（如果您選擇了該選項）
3. 考慮在後端進行額外驗證以限制對特定域名的存取
4. 根據使用者電子郵件域名或其他屬性實施適當的授權檢查

### 安全最佳實踐

1. **定期輪換密碼**：設定提醒以在到期前輪換用戶端密碼
2. **為開發/生產使用單獨的應用程式**：為開發和生產建立單獨的應用程式註冊
3. **監控登入**：定期檢查 Azure 入口網站中的登入日誌
4. **實施適當的登出**：確保使用者可以正確登出並清除權杖
5. **處理權杖到期**：為長時間的會話實施權杖重新整理邏輯

## 自訂域名設定

### 後端（Workers）

1. 在 Cloudflare 儀表板中，前往 Workers & Pages
2. 選擇您的 worker
3. 前往設定 > 觸發器
4. 新增自訂域名（例如：`api.aka.money`）

### 前端（Pages）

1. 在 Cloudflare 儀表板中，前往 Pages
2. 選擇您的專案
3. 前往自訂域名
4. 新增您的域名（例如：`aka.money`）

### DNS 配置

在 Cloudflare 中新增以下 DNS 記錄：
- `aka.money` → CNAME 到您的 Pages 部署
- `api.aka.money` → CNAME 到您的 Workers 部署

## 監控和日誌

### 查看 Worker 日誌
```bash
cd backend
wrangler tail
```

### 查看分析
- 前往 Cloudflare 儀表板 > Workers & Pages > 您的 Worker > 分析
- 查看請求指標、錯誤和效能資料

## 疑難排解

### 資料庫問題

如果遷移失敗：
```bash
# 檢查資料庫狀態
wrangler d1 info akamoney-clicks

# 列出現有遷移
wrangler d1 migrations list akamoney-clicks --local

# 直接執行 SQL
wrangler d1 execute akamoney-clicks --local --command "SELECT * FROM urls LIMIT 10"
```

### CORS 問題

如果遇到 CORS 錯誤：
1. 檢查 `src/backend/src/middleware/cors.ts` 是否包含您的前端 URL
2. 確認環境變數設定正確
3. 清除瀏覽器快取

### JWT 問題

如果驗證失敗：
1. 確認已設定 JWT_SECRET：`wrangler secret list`
2. 檢查權杖到期時間
3. 確保 Authorization 標頭格式：`******`

## 開發提示

1. **使用 DevContainer**：在 VS Code 中使用 DevContainer 開啟以獲得一致的環境
2. **熱重載**：前端和後端在開發期間都支援熱重載
3. **資料庫控制台**：使用 `wrangler d1 execute` 快速進行資料庫查詢
4. **日誌**：在單獨的終端機中保持執行 `wrangler tail` 以查看後端日誌

## 安全最佳實踐

1. **切勿將密碼提交**到版本控制
2. **使用強 JWT 密碼**（至少 32 個字元）
3. **在生產環境中啟用 HTTPS**
4. **定期更新相依套件**
5. **監控錯誤日誌**以發現安全問題
6. **實施速率限制**（新增到中介軟體）

## 下一步

- [ ] 新增自訂品牌
- [ ] 實施 QR 碼生成
- [ ] 新增連結過期通知
- [ ] 設定監控警報
- [ ] 實施 API 速率限制
- [ ] 新增更多分析功能

## 支援

如有問題或疑問：
- 查看主要的 [README.md](../README.zh-TW.md)
- 檢閱 Cloudflare Workers 文件
- 查看 Vue 3 和 Vite 文件
