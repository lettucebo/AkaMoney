[English](README.md) | 繁體中文

# AkaMoney - 網址縮短服務

一個使用 Vue 3、TypeScript 和 Cloudflare Workers 建構的現代化網址縮短服務。

## 功能特色

- 🔗 支援自訂短代碼的網址縮短
- 📊 分析和點擊追蹤
- 🧹 自動清理舊點擊記錄（365 天保留）
- 🔐 管理儀表板的 Microsoft Entra ID 驗證
- 👤 Entra ID 整合與自動使用者建立
- 💾 資料儲存的 D1 資料庫
- 📦 檔案管理的 R2 儲存
- 🎨 Tailwind CSS v4 響應式設計，支援深色/淺色主題
- ⚡ 使用 Cloudflare Workers 的快速重定向

## 架構

AkaMoney 使用**分離式服務架構**以提供更好的安全性和可擴展性：

| 服務 | 用途 | 驗證 | 域名範例 |
|------|------|------|----------|
| **重定向服務** (`akamoney-redirect`) | 公開網址重定向 | ❌ 無需驗證 | `go.aka.money` |
| **管理 API** (`akamoney-admin-api`) | 網址管理、分析 | ✅ 需要 Microsoft Entra 存取權杖 | `api.aka.money` |
| **前端** | 管理儀表板 | ✅ Entra ID | `admin.aka.money` |

### 服務分離的優點

- **安全性**：管理 API 驗證 Microsoft Entra 存取權杖，重定向服務為公開存取
- **可擴展性**：服務可以獨立擴展
- **可靠性**：管理 API 問題不會影響重定向功能
- **效能**：重定向服務針對速度進行優化

## 技術堆疊

### 前端
- Vue 3
- Vite
- TypeScript
- Tailwind CSS v4
- Chart.js

### 後端
- Cloudflare Workers
- D1 資料庫
- R2 儲存
- Microsoft Entra ID 身份驗證

### 需求
- Node.js 24.x（LTS）
- 啟用 Workers 和 Pages 的 Cloudflare 帳號

## 專案結構

```
.
├── package.json            # 根目錄：npm workspaces（src/frontend、src/backend、src/redirect）
├── package-lock.json       # 三個 workspace 共用的單一 lockfile
├── src/
│   ├── frontend/          # Vue 3 應用程式（管理儀表板）
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── views/
│   │   │   ├── router/
│   │   │   ├── stores/
│   │   │   └── services/
│   │   └── package.json
│   ├── backend/           # 管理 API（Cloudflare Workers）- Entra 保護
│   │   ├── src/
│   │   │   ├── middleware/
│   │   │   ├── services/
│   │   │   └── types/
│   │   ├── wrangler.toml
│   │   └── package.json
│   ├── redirect/          # 重定向服務（Cloudflare Workers）- 公開存取
│   │   ├── src/
│   │   ├── wrangler.toml
│   │   └── package.json
│   └── shared/            # 尚未接線的型別宣告（服務目前未匯入）
│       └── types/
└── docs/                  # 完整雙語文件；請參閱 docs/README.zh-TW.md
    └── design-mockups/    # 凍結的設計評選樹；請參閱 docs/PROJECT_STRUCTURE.zh-TW.md
```

根目錄 `package.json` 針對 `src/frontend`、`src/backend` 與 `src/redirect` 宣告了
npm workspace，並擁有唯一的根目錄 `package-lock.json`。它的存在純粹是為了協調共用的
`dev` / `build` / `test` / `deploy` 腳本與依賴安裝——本身並非應用程式碼的來源；
可部署的產品原始碼仍位於各 workspace 自己的 `src/` 之下。

## 快速開始

### 前置需求

1. 安裝 Node.js 24.x
2. 建立 Cloudflare 帳號
3. 安裝 Wrangler CLI：`npm install -g wrangler`
4. 登入 Cloudflare：`wrangler login`

### 安裝

1. 複製儲存庫：
```bash
git clone https://github.com/lettucebo/AkaMoney.git
cd AkaMoney
```

2. 安裝相依套件（此為 npm workspace，於根目錄執行一次即可安裝 `src/` 下所有三個應用程式；
   `npm run setup` 是 `npm install` 的別名）：
```bash
npm run setup
```

3. 配置環境變數：
```bash
cp src/frontend/.env.example src/frontend/.env
```

4. 使用您的 Cloudflare 憑證更新配置檔案

### 開發

請在三個獨立終端機啟動服務；此方式在 Windows 最可靠，也能避免通訊埠衝突：
```bash
# 前端（http://localhost:5173）
npm run dev:frontend

# 管理 API（http://localhost:8787）
cd src/backend
npx wrangler dev --config wrangler.local.toml --port 8787

# 重定向服務（http://localhost:8788）
cd src/redirect
npx wrangler dev --config wrangler.local.toml --port 8788
```

完整本機設定與健康檢查請參閱[設定指南](docs/SETUP.zh-TW.md)。

### 建置

建置所有服務：
```bash
npm run build
```

### 部署

部署所有服務到 Cloudflare：
```bash
npm run deploy
```

## 配置

### 前端配置

編輯 `src/frontend/.env`：
```env
VITE_API_URL=https://your-admin-api.workers.dev
VITE_ENTRA_ID_CLIENT_ID=your-client-id
VITE_ENTRA_ID_TENANT_ID=your-tenant-id
```

### 管理 API 配置

對於本地開發，複製範本並填入您的值：
```bash
cp src/backend/wrangler.local.toml.example src/backend/wrangler.local.toml
```

編輯 `src/backend/wrangler.local.toml` 並填入您的 D1 資料庫 ID：
```toml
name = "akamoney-api"
main = "src/index.ts"
compatibility_date = "2024-12-17"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "akamoney-clicks"
database_id = "your-database-id"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "akamoney-storage"
```

使用以下命令在本地開發模式下執行管理 API：
```bash
cd src/backend && wrangler dev --config wrangler.local.toml
```

### 重定向服務配置

對於本地開發：
```bash
cp src/redirect/wrangler.local.toml.example src/redirect/wrangler.local.toml
```

編輯 `src/redirect/wrangler.local.toml` 並填入您的 D1 資料庫 ID：
```toml
name = "akamoney-redirect"
main = "src/index.ts"
compatibility_date = "2024-12-17"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "akamoney-clicks"
database_id = "your-database-id"
```

> **注意**：兩個 `wrangler.local.toml` 檔案都已被 git 忽略，以防止敏感資訊洩漏。對於 CI/CD 部署，敏感值如 `database_id` 會從 GitHub Secrets 注入。

## API 端點

### 重定向服務（公開 - 無需驗證）

基礎 URL：`https://go.aka.money`（或您的重定向 worker URL）

| 端點 | 說明 |
|------|------|
| `GET /health` | 健康檢查 |
| `GET /:shortCode` | 重定向到原始網址 |

### 管理 API（需要 Microsoft Entra 存取權杖）

基礎 URL：`https://api.aka.money`（或您的管理 API worker URL）

| 端點 | 驗證 | 說明 |
|------|------|------|
| `GET /health` | ❌ | 健康檢查 |
| `POST /api/shorten` | 選用 | 建立短網址 |
| `GET /api/urls` | ✅ Entra | 列出所有網址 |
| `GET /api/urls/:id` | ✅ Entra | 取得網址詳細資訊 |
| `PUT /api/urls/:id` | ✅ Entra | 更新網址 |
| `DELETE /api/urls/:id` | ✅ Entra | 刪除網址 |
| `GET /api/analytics/:shortCode` | ✅ Entra | 取得分析 |
| `GET /api/public/analytics/:shortCode` | ❌ | 取得公開分析（有限） |
| `GET /api/stats/overall` | ✅ Entra | 取得儀表板總覽統計 |
| `POST /api/storage/upload` | ✅ Entra | 上傳圖片 |
| `GET /api/storage/config` | ✅ Entra | 取得目前儲存設定 |
| `GET /api/storage/files` | ✅ Entra | 列出已上傳檔案 |
| `GET /api/storage/files/:key` | ✅ Entra | 取得上傳檔案 metadata |
| `DELETE /api/storage/files/:key` | ✅ Entra | 刪除上傳檔案 |
| `POST /api/admin/cleanup` | ✅ Entra | 手動清理舊點擊記錄 |

### 驗證

前端透過 MSAL 取得 Microsoft Entra 存取權杖，並以 bearer token 傳送。
詳見[身份驗證指南](docs/AUTHENTICATION.zh-TW.md)。

### 自動資料清理

系統會自動清理舊的點擊記錄以維持資料庫效率：

- **排程**：每天 UTC 02:00（台灣時間 10:00）
- **保留期**：365 天（1 年的歷史資料）
- **方法**：Cloudflare Cron Triggers
- **資料庫影響**：維持資料庫大小在 D1 免費方案限制內

手動觸發清理以進行測試：

請將範例中的 `TOKEN_VALUE` 替換為 Microsoft Entra 存取權杖。

```bash
curl -X POST "https://your-api.workers.dev/api/admin/cleanup" \
  -H "Authorization: Bearer TOKEN_VALUE"
```

您可以指定自訂保留期（天數）：

```bash
curl -X POST "https://your-api.workers.dev/api/admin/cleanup?days=180" \
  -H "Authorization: Bearer TOKEN_VALUE"
```

**本地測試：**

```bash
cd src/backend && npx wrangler dev --config wrangler.local.toml --port 8787
# 在另一個終端：
curl -X POST "http://localhost:8787/api/admin/cleanup" \
  -H "Authorization: Bearer TOKEN_VALUE"
```

## 資料庫結構

Schema 會透過 D1 migration 持續演進。現行資料表、欄位、索引、migration 順序與本地／遠端指令請參閱[資料庫指南](docs/DATABASE.zh-TW.md)。

## 功能路線圖

- [x] 基本網址縮短
- [x] Microsoft Entra ID 身份驗證
- [x] 管理儀表板
- [x] 點擊分析
- [ ] 自訂域名
- [ ] QR 碼生成
- [x] 連結過期
- [ ] 密碼保護連結
- [ ] 批量網址匯入
- [ ] API 速率限制

## 歷史螢幕截圖

以下圖片是 Proposal F 之前的介面，僅保留作歷史參考，不能視為現行 runtime UI 的證明。Monē 現行 UI 導覽，以及設計 reference 與 runtime capture 的差異，請參閱[現行 UI 導覽](docs/SCREENSHOTS.zh-TW.md)。

### 首頁 - 網址縮短介面
![首頁](https://github.com/user-attachments/assets/fb6c649e-b8f3-4cb4-9817-a49de28f8cd5)
*簡潔易用的介面，可建立短網址並使用自訂短代碼*

### 登入頁面 - Microsoft Entra ID 整合
![登入頁面](https://github.com/user-attachments/assets/b9768508-a03f-4cb6-b220-10376fe3e18d)
*使用 Microsoft Entra ID（Azure AD）進行安全身份驗證*

### 首頁 - 建立短網址
![建立網址](https://github.com/user-attachments/assets/4c28b480-dd1a-4812-9aab-b26091826840)
*表單驗證和使用者友善的網址縮短輸入介面*

### 儀表板 - 網址管理
![儀表板](https://github.com/user-attachments/assets/7904a993-13d8-4709-b099-3d245058b4a8)
*管理所有縮短的網址，包含點擊統計和快速操作*

### 分析儀表板 - 完整統計資訊
![分析](https://github.com/user-attachments/assets/a314ccfd-8b6a-44dc-8eaa-014df795327c)
*詳細的分析資料，包括地理分布、裝置類型、瀏覽器和點擊歷史記錄*

## 文件

完整文件提供 [English](docs/README.md) 和 [繁體中文](docs/README.zh-TW.md) 版本。快速連結：

- [文件目錄（繁體中文）](docs/README.zh-TW.md) | [Documentation Index (English)](docs/README.md)
- [設定指南（繁體中文）](docs/SETUP.zh-TW.md) | [Setup Guide (English)](docs/SETUP.md)
- [API 文件（繁體中文）](docs/API.zh-TW.md) | [API Documentation (English)](docs/API.md)
- [配置參考（繁體中文）](docs/CONFIGURATION.zh-TW.md) | [Configuration Reference (English)](docs/CONFIGURATION.md)
- [貢獻指南](CONTRIBUTING.md)（English）
- [更新日誌（繁體中文）](CHANGELOG.zh-TW.md) | [Changelog (English)](CHANGELOG.md)
- [截圖與介面指南（繁體中文）](docs/SCREENSHOTS.zh-TW.md) | [Screenshots & UI Guide (English)](docs/SCREENSHOTS.md)

## 貢獻

歡迎貢獻！請隨時提交 Pull Request。

詳細資訊請參閱 [CONTRIBUTING.md](CONTRIBUTING.md)（英文）。

## 授權條款

本專案採用 MIT 授權條款 - 詳見 LICENSE 檔案。

## 支援

如有問題或需要協助：
- 查看[設定指南](docs/SETUP.zh-TW.md)
- 閱讀 [API 文件](docs/API.zh-TW.md)
- 在 GitHub 上提出 Issue
- 查看 [Cloudflare Workers 文件](https://developers.cloudflare.com/workers/)

## 致謝

感謝以下專案和資源：

- [Vue 3](https://vuejs.org/) - 漸進式 JavaScript 框架
- [Cloudflare Workers](https://workers.cloudflare.com/) - 無伺服器平台
- [Hono](https://hono.dev/) - 輕量級 Web 框架
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架
- [TypeScript](https://www.typescriptlang.org/) - JavaScript 的型別超集

## 作者

由 [@lettucebo](https://github.com/lettucebo) 使用 ❤️ 建立
