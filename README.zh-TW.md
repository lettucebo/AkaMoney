# AkaMoney - 網址縮短服務

一個使用 Vue 3、TypeScript 和 Cloudflare Workers 建構的現代化網址縮短服務。

[English](README.md) | 繁體中文

## 功能特色

- 🔗 支援自訂短代碼的網址縮短
- 📊 分析和點擊追蹤
- 🔐 API 的 JWT 身份驗證
- 👤 管理儀表板的 Entra ID 整合
- 💾 資料儲存的 D1 資料庫
- 📦 檔案管理的 R2 儲存
- 🎨 Bootstrap 5 響應式設計
- ⚡ 使用 Cloudflare Workers 的快速重定向

## 架構

AkaMoney 使用**分離式服務架構**以提供更好的安全性和可擴展性：

| 服務 | 用途 | 驗證 | 域名範例 |
|------|------|------|----------|
| **重定向服務** (`akamoney-redirect`) | 公開網址重定向 | ❌ 無需驗證 | `go.aka.money` |
| **管理 API** (`akamoney-admin-api`) | 網址管理、分析 | ✅ 需要 JWT | `api.aka.money` |
| **前端** | 管理儀表板 | ✅ Entra ID | `admin.aka.money` |

### 服務分離的優點

- **安全性**：管理 API 受 JWT 保護，重定向服務為公開存取
- **可擴展性**：服務可以獨立擴展
- **可靠性**：管理 API 問題不會影響重定向功能
- **效能**：重定向服務針對速度進行優化

## 技術堆疊

### 前端
- Vue 3
- Vite
- TypeScript
- Bootstrap 5

### 後端
- Cloudflare Workers
- D1 資料庫
- R2 儲存
- JWT 身份驗證

### 需求
- Node.js 24.x（LTS）
- 啟用 Workers 和 Pages 的 Cloudflare 帳號

## 專案結構

```
.
├── src/
│   ├── frontend/          # Vue 3 應用程式（管理儀表板）
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── views/
│   │   │   ├── router/
│   │   │   ├── stores/
│   │   │   └── services/
│   │   └── package.json
│   ├── backend/           # 管理 API（Cloudflare Workers）- JWT 保護
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
│   └── shared/            # 共享型別和工具
│       └── types/
└── docs/              # 文件
    ├── API.md
    ├── SETUP.md
    └── SCREENSHOTS.md
```

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

2. 安裝相依套件：
```bash
npm run setup
```

3. 配置環境變數：
```bash
cp src/frontend/.env.example src/frontend/.env
cp src/backend/.env.example src/backend/.env
```

4. 使用您的 Cloudflare 憑證更新配置檔案

### 開發

同時啟動前端和後端的開發模式：
```bash
npm run dev
```

或分別啟動：
```bash
# 前端（http://localhost:5173）
npm run dev:frontend

# 管理 API（http://localhost:8787）
npm run dev:backend

# 重定向服務（http://localhost:8788）
npm run dev:redirect
```

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
name = "akamoney-admin-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

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
compatibility_date = "2024-01-01"

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

### 管理 API（需要 JWT 驗證）

基礎 URL：`https://api.aka.money`（或您的管理 API worker URL）

| 端點 | 驗證 | 說明 |
|------|------|------|
| `GET /health` | ❌ | 健康檢查 |
| `POST /api/shorten` | 選用 | 建立短網址 |
| `GET /api/urls` | ✅ JWT | 列出所有網址 |
| `GET /api/urls/:id` | ✅ JWT | 取得網址詳細資訊 |
| `PUT /api/urls/:id` | ✅ JWT | 更新網址 |
| `DELETE /api/urls/:id` | ✅ JWT | 刪除網址 |
| `GET /api/analytics/:shortCode` | ✅ JWT | 取得分析 |
| `GET /api/public/analytics/:shortCode` | ❌ | 取得公開分析（有限） |

### 驗證
- `POST /api/auth/login` - 取得 JWT 權杖

## 資料庫結構

### URLs 表
```sql
CREATE TABLE urls (
  id TEXT PRIMARY KEY,
  short_code TEXT UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER,
  is_active INTEGER DEFAULT 1
);
```

### Click Records 表
```sql
CREATE TABLE click_records (
  id TEXT PRIMARY KEY,
  url_id TEXT NOT NULL,
  clicked_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  referer TEXT,
  country TEXT,
  FOREIGN KEY (url_id) REFERENCES urls(id)
);
```

## 功能路線圖

- [x] 基本網址縮短
- [x] JWT 身份驗證
- [x] 管理儀表板
- [x] 點擊分析
- [ ] 自訂域名
- [ ] QR 碼生成
- [ ] 連結過期
- [ ] 密碼保護連結
- [ ] 批量網址匯入
- [ ] API 速率限制

## 螢幕截圖

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

完整文件請參閱：

- [設定指南（繁體中文）](docs/SETUP.zh-TW.md) - 詳細的設定和部署說明
- [設定指南（英文）](docs/SETUP.md)
- [API 文件（繁體中文）](docs/API.zh-TW.md) - 完整的 API 參考
- [API 文件（英文）](docs/API.md)
- [貢獻指南（繁體中文）](CONTRIBUTING.zh-TW.md) - 如何為專案做出貢獻
- [貢獻指南（英文）](CONTRIBUTING.md)
- [更新日誌（繁體中文）](CHANGELOG.zh-TW.md) - 版本歷史和更改
- [更新日誌（英文）](CHANGELOG.md)
- [截圖與介面指南（繁體中文）](docs/SCREENSHOTS.zh-TW.md) - 管理後台詳細截圖
- [截圖與介面指南（英文）](docs/SCREENSHOTS.md)

## 貢獻

歡迎貢獻！請隨時提交 Pull Request。

詳細資訊請參閱 [CONTRIBUTING.zh-TW.md](CONTRIBUTING.zh-TW.md)。

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
- [Bootstrap](https://getbootstrap.com/) - CSS 框架
- [TypeScript](https://www.typescriptlang.org/) - JavaScript 的型別超集

## 作者

由 [@lettucebo](https://github.com/lettucebo) 使用 ❤️ 建立
