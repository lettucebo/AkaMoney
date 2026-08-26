[English](IMPLEMENTATION_SUMMARY.md) | 繁體中文

# AkaMoney — 實作摘要

> **次要／非權威文件。** 本文件是目前程式碼庫狀態的時間快照，*並非* 設定、執行或維運
> AkaMoney 的權威依據。若要取得權威且持續維護的說明，請優先參考各任務指南——
> [設定](SETUP.zh-TW.md)、[API](API.zh-TW.md) 與 [驗證](AUTHENTICATION.zh-TW.md)——
> 這些文件會與程式碼保持同步。若本快照與任務指南有出入，以任務指南為準。

## 範圍與狀態

AkaMoney 是一套部署於 Cloudflare 的短網址服務。本摘要描述目前程式庫實際交付的內容，讓讀者
能快速掌握全貌。文中刻意避免路線圖承諾，以及未有程式碼支撐的功能宣稱。凡是後端已知尚未
完成之處，皆列於 [已知後端 API 缺口](#已知後端-api-缺口)，並附上追蹤 issue 連結，而非含糊
帶過。

## 架構快照

專案切分為三個可獨立部署的服務。儲存庫中另有 `src/shared` 目錄，但目前沒有執行中服務
匯入它；契約仍分別定義於各服務套件中。

| 服務 | 目錄 | 驗證 | 職責 |
|------|------|------|------|
| 轉址服務（`akamoney-redirect`） | `src/redirect/` | 無（公開） | 解析 `GET /:shortCode` 並發出 302 轉址 |
| Admin API（`akamoney-admin-api`） | `src/backend/` | Microsoft Entra ID（JWT） | 短網址 CRUD、分析、儲存、清理 |
| 前端（管理儀表板） | `src/frontend/` | Microsoft Entra ID（MSAL） | 操作者介面 |
| 尚未接線的型別宣告 | `src/shared/` | — | 存在於儲存庫，但執行中服務尚未匯入 |

```text
src/
├── frontend/   # Vue 3 + Vite + Tailwind v4 管理儀表板
├── backend/    # Admin API — Cloudflare Worker（Hono），受 JWT 保護
├── redirect/   # 公開轉址 Worker（Hono），無驗證
└── shared/     # 存在但尚未接入執行中服務的型別宣告
```

## 前端（Proposal F / m2-mone-dense）

儀表板實作 **Proposal F** 設計方向（manifest
`design-mockups/proposals/m2-mone-dense.manifest.json`，「Monē 高密度資料工具變體」）。它以
Vue 3（`<script setup>`）、Vite 與 **Tailwind CSS v4** 建置，採用 CSS 優先的 `@theme` 設定
（沒有 `tailwind.config.js`）；並未使用 Bootstrap。執行期的明暗主題由 `<html>` 上的
`data-theme` 屬性與 Pinia theme store 驅動。

已交付且以元件／視圖形式存在的能力：

- **可收合側邊欄外殼**——`AppShell`、`AppSidebar`、`AppTopbar`。
- **高密度、易掃視的短網址表格**——`UrlTable` 搭配 `UrlTableToolbar` 與 `DashboardPagination`。
- **行內快速建立**——`QuickCreatePanel` 取代舊有以彈窗為主的建立流程。
- **KPI 摘要**——`KpiSummary`，由 `useKpiSummary` composable 供給資料。
- **比較式分析**——`AnalyticsView` 與 `OverallStatsView`，使用 `BaseChart` 及來自
  `useChartTheme` 的共用分類色盤。
- **編輯／確認／提示 UX**——`UrlEditModal`、`ConfirmActionModal`、`DashboardToastStack`。

## Admin API

Admin API 是一個 Hono Worker（`src/backend/src/index.ts`）。驗證方式是以租戶 JWKS（透過
`jose`）驗證 Microsoft Entra ID 權杖，而非簽發本地 HS256 權杖；受保護路由使用
`authMiddleware`，而 `/api/shorten` 使用 `optionalAuthMiddleware`。已實作的路由包含：

- `GET /health`
- `POST /api/shorten`（可選驗證）
- `GET /api/urls`、`GET /api/urls/:id`、`PUT /api/urls/:id`、`DELETE /api/urls/:id`
- `GET /api/analytics/:shortCode`、`GET /api/public/analytics/:shortCode`
- `GET /api/stats/overall`
- `POST /api/admin/cleanup`
- `GET /api/storage/config`、`POST /api/storage/upload`、`GET /api/storage/files`、
  `GET /api/storage/files/:key`、`DELETE /api/storage/files/:key`

另有 `scheduled` cron handler 自動執行保留期清理。

## 轉址服務

轉址服務（`src/redirect/src/index.ts`）刻意保持精簡且公開。它提供 `GET /health` 與
`GET /:shortCode`，於 D1 查詢短碼，並回傳指向原始網址的 `302` 轉址。將轉址與 Admin API 分離
表示管理端點若出問題，也不會拖垮轉址功能。

## 資料、儲存與驗證

- **資料庫（Cloudflare D1）：** `urls`、`click_records` 與 `users` 資料表。後續 migration
  於 `urls` 加入 `image_url`（`0004`），並於 `users` 加入通用 SSO 欄位（`0002`／`0003`）。
- **物件儲存：** 一層儲存供應者抽象（`src/backend/src/services/storage/`）透過 factory 依設定
  選用 Cloudflare R2 或 Azure Blob Storage。
- **驗證：** Microsoft Entra ID 同時用於儀表板（MSAL）與 Admin API 的 bearer 權杖（於伺服器端
  驗證）。執行期權威行為請見 [驗證](AUTHENTICATION.zh-TW.md)，登入如何持久化使用者紀錄請見
  [SSO 使用者自動建立](IMPLEMENTATION_SSO_USER.zh-TW.md)。
- **保留期：** 舊的點擊紀錄會透過每日 cron 與 `POST /api/admin/cleanup` 清除。

## 測試現況

每個服務各自帶有 Vitest 測試套件。測試位於緊鄰程式碼的 `__tests__/` 目錄中（前端
元件／視圖／store／composable、Admin API 的 middleware 與 service 含驗證與 user upsert，以及
轉址服務）。從專案根目錄執行：

```bash
npm run test              # 三個服務全部
npm run test:frontend     # 僅儀表板
npm run test:backend      # 僅 admin API
npm run test:redirect     # 僅轉址服務
npm run test:coverage     # 含覆蓋率
```

## 已知後端 API 缺口

部分儀表板能力領先於後端。這些缺口在 GitHub 上追蹤，應以此清單為權威依據，而非本檔中的任何
狀態宣稱：

- [#132 — Epic：Proposal F（mone-dense）儀表板推行的後端 API 缺口](https://github.com/lettucebo/AkaMoney/issues/132)
- [#133 — `GET /api/urls`：新增搜尋（q）、排序／順序、狀態篩選、狀態計數](https://github.com/lettucebo/AkaMoney/issues/133)
- [#134 — `OverallStatsResponse`：新增與 `date_range` 連動的 `links_created_in_range`](https://github.com/lettucebo/AkaMoney/issues/134)
- [#135 — `AnalyticsResponse`：新增 `clicks_by_os` 與 `clicks_by_referer`（安全 hostname）](https://github.com/lettucebo/AkaMoney/issues/135)

## 相關文件

- [README](../README.zh-TW.md)
- [架構](ARCHITECTURE.zh-TW.md)
- [驗證](AUTHENTICATION.zh-TW.md)
