[English](PROJECT_STRUCTURE.md) | 繁體中文

# 專案結構

AkaMoney 由三個可獨立部署的服務，加上鏡像契約、D1 migrations、設計比稿、文件與 GitHub workflows 組成。這是責任地圖，不是完整目錄樹。

## 三個可部署單元

| 部署單元 | 路徑 | 執行環境 | 職責 |
|----------|------|----------|------|
| 管理後台 | `src/frontend/` | Vue 3 + Vite → Cloudflare Pages（`akamoney-admin`） | Entra ID 登入、短網址管理 UI |
| 管理 API | `src/backend/` | Cloudflare Worker `akamoney-admin-api` | 需 Entra 權杖的管理與分析 |
| 轉址 | `src/redirect/` | Cloudflare Worker `akamoney-redirect` | 公開 `GET /:shortCode` → 302，並記錄點擊 |

根目錄 `package.json` 協調各套件的 `dev` / `build` / `test` / `deploy`。每個套件有自己的 `package.json` 與 lockfile。前端在 Vite 開發時把 `/api` 代理到 `http://localhost:8787`。

**前端邊界**（`src/frontend/src/`）：

- `views/` — 一條路由一個畫面（`LoginView`、`DashboardView`、`OverallStatsView`、`AnalyticsView`、`NotFoundView`）
- `components/layout/` — `AppShell`、`AppSidebar`、`AppTopbar`
- `components/dashboard/` — KPI、按需建立彈窗、表格、工具列、分頁、編輯／確認／toast
- `components/common/` — `BaseButton`、`BaseBadge`、`BaseModal`、`BaseChart`、`EmptyState`、`StateBlock`
- `stores/` — `auth`、`theme`、`url`
- `services/` — `api.ts`（Admin API 用戶端）、`auth.ts`（MSAL）
- `types/` — 管理台 TypeScript 契約
- `assets/css/main.css` — Tailwind v4 代幣與元件 CSS（見 [主題系統](THEME.zh-TW.md)）

**管理 API 邊界**（`src/backend/src/`）：

- `index.ts` — Hono 路由（`/health`、`/api/shorten`、`/api/urls`、`/api/analytics/:shortCode`、`/api/stats/overall`、`/api/storage/*`、`/api/admin/cleanup`）
- `middleware/` — CORS、錯誤、Entra bearer token 驗證
- `services/url.ts`、`analytics.ts`、`cleanup.ts`、`jwt.ts`、`user.ts`
- `services/storage/` — factory + R2 / Azure
- `types/` — `Env`、D1 列形狀、請求／回應型別
- `wrangler.toml` — Worker 名稱、D1 `akamoney-clicks`、R2 `akamoney-storage`、每日 cron `0 2 * * *`

**轉址邊界**（`src/redirect/src/`）：

- `index.ts` — `/health`、`GET /:shortCode`（404／過期 410／302）
- `services.ts` — 查詢 + 非同步寫入點擊
- `types.ts` — 轉址專用型別
- 與管理 API 綁定同一顆 D1；不需要身份驗證

## 共用契約

`src/shared/types/index.ts` 存在，但**儲存庫內沒有任何檔案 import 它**。前端、後端、轉址各自維護複本。

欄位變更時（例如 URL 的 `image_url`），必須同步每個實際會編譯的消費者：

- `src/frontend/src/types/index.ts`
- `src/backend/src/types/index.ts`
- 轉址 Worker 若需要該欄位，還有 `src/redirect/src/types.ts`
- `src/shared/types/index.ts` 僅在你準備未來的共用套件時更新 — 目前尚未接線

在真正的 workspace package 出現之前，不要 `import` `src/shared`。

```
src/shared/types/index.ts     — not imported
src/frontend/src/types/       — Vue app contracts
src/backend/src/types/        — Worker + D1 contracts
src/redirect/src/types.ts     — redirect-only contracts
```

## 資料與 migrations

D1 schema 只放在 `src/backend/migrations/`：

| 檔案 | 職責 |
|------|------|
| `0001_initial_schema.sql` | `urls`、`click_records`、`users` |
| `0002_add_sso_provider.sql` | 通用 `sso_provider` / `sso_id` |
| `0003_fix_sso_unique_constraint.sql` | 重建 `users` 以支援 `UNIQUE(sso_provider, sso_id)` |
| `0004_add_image_url.sql` | `urls.image_url` |

透過 Wrangler／管理 API Worker 套用 migrations。轉址 Worker 是同一顆 `akamoney-clicks` 的讀取端。

## 前端邊界

路由表在 `src/frontend/src/router/index.ts`。需登入的畫面包在 `AppShell`；`/login` 獨立渲染（`App.vue`）。清單的搜尋／篩選／排序**只作用於目前頁面**，因為 `GET /api/urls` 目前只接受 `page` / `limit`。

主題、代幣與 Chart.js 規則見 [主題系統](THEME.zh-TW.md)。已上線畫面與設計截圖見 [畫面截圖](SCREENSHOTS.zh-TW.md)。

## 設計比稿

`design-mockups/` 是凍結的設計評選樹，不是可部署單元：

- `BRIEF.md` — 提案契約
- `proposals/` — HTML + `*.manifest.json`（目前視覺祖先：**`m2-mone-dense`**）
- `screenshots/` — 比稿截圖（見 [畫面截圖](SCREENSHOTS.zh-TW.md)）
- `validation/` — 針對那些 HTML 提案的 Playwright 與靜態檢查
- `shared/` — 評選專用代幣與 fixtures

把比稿當成設計歷史。執行期 CSS 是 `src/frontend/src/assets/css/main.css`。

## 文件與 workflows

`docs/` 放雙語技術文件：[API](API.zh-TW.md)、[安裝設定](SETUP.zh-TW.md)、[主題系統](THEME.zh-TW.md)、[專案結構](PROJECT_STRUCTURE.zh-TW.md)、[畫面截圖](SCREENSHOTS.zh-TW.md)。根目錄保留 `README`、`CHANGELOG`、`CONTRIBUTING`、`LICENSE`。

`.github/workflows/`：

- `ci.yml` — Node 24、安裝三個套件、coverage、建置
- `release.yml` — tag／受信任的 `run-release` 部署到 Cloudflare Pages + Workers

## 相關文件

- [README](../README.zh-TW.md)
- [安裝設定](SETUP.zh-TW.md)
- [API](API.zh-TW.md)
- [主題系統](THEME.zh-TW.md)
- [畫面截圖](SCREENSHOTS.zh-TW.md)
