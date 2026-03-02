# AkaMoney – Copilot 指引

## 架構概覽

三個可獨立部署的 Cloudflare Workers 服務，加上一個 Vue 3 SPA：

| 目錄                | Worker 名稱          | 驗證              | 用途                            |
| ------------------- | -------------------- | ----------------- | ------------------------------- |
| `src/redirect/`     | `akamoney-redirect`  | 無                | 公開的 `/:shortCode` → 302 轉址 |
| `src/backend/`      | `akamoney-admin-api` | JWT / Entra ID    | CRUD、分析統計、檔案儲存        |
| `src/frontend/`     | Cloudflare Pages     | 瀏覽器端 Entra ID | 管理儀表板                      |
| `src/shared/types/` | —                    | —                 | 跨套件共用型別                  |

兩個 Workers 皆使用 **Hono** 作為 HTTP 框架（測試中以 `app.request()` 取代真實伺服器）。

## 驗證模式

後端支援兩種 token 驗證路徑，驗證邏輯位於 `src/backend/src/middleware/auth.ts`：

- **Entra ID token** – 透過 `jose` + 快取的 JWKS（來自 `login.microsoftonline.com`）驗證。供前端 SPA 使用。
- **自訂 HS256 JWT** – 由 `src/backend/src/services/jwt.ts` 產生與驗證（手刻，不依賴函式庫）。供程式化 API 存取使用。

端點從 `auth.ts` 匯入三種 middleware 之一：

- `authMiddleware` – 拒絕未驗證的請求
- `optionalAuthMiddleware` – 若有 token 則附加使用者資訊，否則允許匿名
- `getAuthUser(c)` – 在 middleware 執行後取得帶有型別的使用者資訊

## 資料流：點擊記錄

轉址服務透過 `c.executionCtx.waitUntil(recordClick(...))` **非阻塞**地記錄點擊，確保 302 立即回應。請參閱 `src/redirect/src/index.ts`。

## 儲存提供者模式

`src/backend/src/services/storage/` 是基於工廠設計模式的抽象層。透過 `STORAGE_PROVIDER` 環境變數（`"r2"` | `"azure"`）切換 R2 與 Azure Blob Storage。新增提供者時，實作 `StorageProvider` 介面並在 `factory.ts` 中註冊即可。

## 開發工作流程

```bash
# 安裝所有工作區套件
npm run setup

# 本機開發（前端與後端同時啟動）
npm run dev

# 個別服務
npm run dev:frontend   # Vite 開發伺服器
npm run dev:backend    # wrangler dev（需要 wrangler.local.toml）
npm run dev:redirect   # wrangler dev

# 測試（可從根目錄或個別套件執行）
npm test               # 所有套件
npm run test:backend   # 在 src/backend/ 執行 vitest run
npm run test:coverage

# 資料庫 migration（本機 D1）
cd src/backend && npm run db:migrate
# 正式環境
cd src/backend && npm run db:migrate:prod
```

**本機 Cloudflare 開發：** 將 `wrangler.local.toml.example` 複製為 `wrangler.local.toml`（`src/backend/` 與 `src/redirect/` 各一份），並填入 `database_id`。主要的 `wrangler.toml` 刻意留空 `database_id`（CI 從 `CLOUDFLARE_D1_DATABASE_ID` Secret 注入）。

**前端 Mock 模式：** 設定 `VITE_SKIP_AUTH=true` 可繞過 Entra ID 並使用記憶體中的假資料（請參閱 `src/frontend/src/services/api.ts` 中的 `getInitialMockUrls()`）。狀態在頁面重新整理後會重置。

## 專案慣例

- **ID 使用 `nanoid`**（`import { nanoid } from 'nanoid'`）— 禁止使用 `crypto.randomUUID()`。
- **時間戳記為 Unix 毫秒**（`Date.now()`），以整數型態儲存於 D1。
- **`is_active` 在 DB 中為 `0|1`**，但在 API 回應中為 `boolean` — 讀取時必須轉型。
- **共用型別放在 `src/shared/types/`** — 不得在前端或後端內部重複定義型別。
- **測試直接對 Hono app 實例呼叫 `app.request(path, init)`** — 不需要網路連線。範例請參閱 `src/backend/src/__tests__/`。
- **Cron 觸發器**設定在 `wrangler.toml`，每日 UTC 02:00 執行；`src/backend/src/index.ts` 中的排程處理器會呼叫 `cleanupOldClickRecords`（保留 365 天）。
- 所有 `package.json` 均要求 **Node.js 24+**。

## 關鍵檔案

- `src/backend/src/index.ts` – 所有 Admin API 路由
- `src/backend/src/types/index.ts` – `Env` 介面（所有 Worker 綁定與 Secret）
- `src/backend/migrations/` – 透過 `wrangler d1` 依序套用的 SQL migration
- `src/redirect/src/services.ts` – `getUrlByShortCode` + `recordClick`
- `src/frontend/src/stores/` – Pinia stores（auth、url、theme）
