[English](SCREENSHOTS.md) | 繁體中文

# 畫面截圖與視覺參考

本頁先說明**已上線**管理後台的路由與狀態，再指向已進版控的**設計比稿**。那些圖片不能當作目前 Vue 執行期的證明。

## 這些圖片是什麼

| 種類 | 是否在本儲存庫？ | 應視為 |
|------|------------------|--------|
| `design-mockups/screenshots/m2-mone-dense-*.png` | 是 | 僅設計比稿／參考 |
| 其他 `design-mockups/screenshots/*.png` | 是 | 歷史評選截圖，不是已上線 UI |
| `docs/screenshots/*` 或 Vue 應用的 Playwright traces | **否** | 不要捏造或連結 |

只存在於 Copilot session 資料夾等工作階段產物，不屬於儲存庫，不得連結。

## 視覺系統識別碼

已上線視覺系統是 **`m2-mone-dense`**（Proposal F / Monē 高密度資料工具）。對應證據：

- `src/frontend/src/assets/css/main.css` 檔頭：「Proposal F (Mone 高密度資料工具變體)」，代幣與 `design-mockups/proposals/m2-mone-dense.manifest.json` 一致
- `useChartTheme.ts` 以同一份 manifest 作為 `CHART_SERIES` 來源
- `DashboardView.vue` 與 `UrlTable.vue` 註解：Proposal F 垂直切片 — KPI → 按需建立彈窗 → 高密度表格
- Manifest DNA：`collapsible-sidebar`、`dense-table`、`inline-quick-create` — `AppShell` 實作 `collapsible-sidebar`；`UrlTable` 實作 `dense-table`；已上線的建立流程刻意偏離 `inline-quick-create`，改以置中的 `BaseModal`（即 `UrlCreateModal`）取代行內面板。

代幣見 [主題系統](THEME.zh-TW.md)。比稿與執行期的位置見 [專案結構](PROJECT_STRUCTURE.zh-TW.md)。

## 已上線路由與畫面

來源：`src/frontend/src/router/index.ts` 及其載入的 views。登入頁獨立；所有需驗證路由使用 `AppShell`。

| 路由 | 畫面 | 驗證 | 頂欄標題 |
|------|------|------|----------|
| `/` | 重新導向 → `/dashboard` | — | — |
| `/login` | `LoginView` | 公開 | 登入 |
| `/dashboard` | `DashboardView` | 需要 | 連結 |
| `/stats` | `OverallStatsView` | 需要 | 總覽統計 |
| `/analytics/:shortCode` | `AnalyticsView` | 需要 | 成效分析 |
| `/:pathMatch(.*)*` | `NotFoundView` | 需要 | 找不到頁面 |

已上線側欄導覽只有**連結**與**總覽統計**。單筆成效分析從表格列進入，不是第三個側欄項目。

### 登入（`/login`）

置中卡片：品牌標記、「登入 AkaMoney」、Microsoft Entra ID 按鈕。畫面狀態：載入中（「正在前往登入…」）、設定／登入錯誤，以及開啟 `VITE_SKIP_AUTH` 略過驗證時的警告。

### 儀表板（`/dashboard`）

組成（不是以 modal 為主的單頁）：

1. `KpiSummary` — 獨立的 30 天總覽統計（點擊、作用中、全部、平均）。自己的載入／錯誤 + 重試。
2. 頁面標題列主要操作（新增按鈕）開啟 `UrlCreateModal` — 置中的 `BaseModal`，包含 `original_url`、必填短代碼、選填標題／描述／預覽圖。真實空白狀態（「尚未建立任何短網址」）也提供第二個建立動作。
3. `UrlTableToolbar` — 搜尋、點擊數排序、狀態分頁。**只作用於目前伺服器頁**（`page` / `limit`）。
4. 清單狀態：載入中（`StateBlock`）、清單錯誤、空白（「尚未建立任何短網址」）、目前頁無結果，或 `UrlTable`。
5. 表格欄：短連結（顯示主機 `aka.money`）、原始網址、點擊、狀態（`作用中` / `已封存` / `已過期`）、操作（複製、成效、編輯、封存或還原）。
6. `DashboardPagination`、`UrlCreateModal`、`UrlEditModal`、封存／還原 `ConfirmActionModal`、`DashboardToastStack`。

此畫面沒有永久刪除 UI。封存會停止轉址；還原後恢復。

### 總覽統計（`/stats`）

帳戶層級區間表單（起迄 + 本月）。狀態：首次載入、錯誤（已有舊資料時為「無法更新」）、KPI 列、Chart.js 折線（點擊趨勢）+ 兩個甜甜圈（國家、裝置）、熱門連結或空白列。

### 單筆成效（`/analytics/:shortCode`）

狀態：載入中、找不到、錯誤，或主體標題 + 區間按鈕（`近 7 日` / `近 30 日` / `近 30 日（API）`）。圖表：每日折線、國家甜甜圈、裝置甜甜圈、瀏覽器長條。近期點擊表（最多 10 筆）或空白。API 的每日序列是 30 天視窗；「全部」仍是同一視窗，不是全歷史。

### 找不到頁面

需登入的 404：大型 404 字標、簡短說明、回到 `/dashboard` 的連結。

## 淺色、深色與回應式版面

- 主題切換是側欄的太陽／月亮控制。`data-theme` + `akamoney-theme` — [主題系統](THEME.zh-TW.md)。
- 桌面：黏滯側欄（`236px`，可收合為 `64px`）+ 頂欄麵包屑 + 使用者選單／登出。
- `max-width: 860px`：漢堡鈕打開抽屜 + 遮罩；KPI 改兩欄；圖表直向堆疊；表頭隱藏、列改為堆疊區塊。

不要從比稿推論額外快捷鍵、WCAG 宣告或瀏覽器支援。那些不是此處記錄的已上線能力。

## 設計比稿截圖

下列檔案存在，且皆為**設計比稿／參考**，不是目前執行期證明。它們呈現 `m2-mone-dense` HTML 提案的**連結**畫面（高密度表、chip 篩選、示意用「建立連結」按鈕）。與已上線應用有多處可見差異：側欄多了成效分析／建立連結／登入頁／找不到頁面、行動版是 chip 導覽而非 860px 抽屜，以及 Vue 應用並未實作的 `/` · `⌘K` 裝飾。比稿與已上線應用都呈現精簡的儀表板建立動作；已上線的表單在 `BaseModal` 中開啟，而不是以行內面板呈現。

**桌面淺色 — 設計比稿／參考**

![m2-mone-dense desktop light (design mockup)](../design-mockups/screenshots/m2-mone-dense-desktop-light.png)

**桌面深色 — 設計比稿／參考**

![m2-mone-dense desktop dark (design mockup)](../design-mockups/screenshots/m2-mone-dense-desktop-dark.png)

**行動淺色 — 設計比稿／參考**

![m2-mone-dense mobile light (design mockup)](../design-mockups/screenshots/m2-mone-dense-mobile-light.png)

**行動深色 — 設計比稿／參考**

![m2-mone-dense mobile dark (design mockup)](../design-mockups/screenshots/m2-mone-dense-mobile-dark.png)

可互動提案 HTML：[`design-mockups/proposals/m2-mone-dense.html`](../design-mockups/proposals/m2-mone-dense.html)。`design-mockups/screenshots/` 其他前綴（`01-linear` … `12-playful`、`m1-mone-faithful`）是較早的評選方向，不是已上線系統。

## 驗證產物

`design-mockups/validation/` 底下已進版控的 Playwright（`playwright.config.mjs`、`proposals.spec.mjs`、`task-3-validation-report.md`）驗證的是**提案 HTML**，不是 Vue SPA。儲存庫沒有已提交的 e2e 目錄或管理台執行期截圖。若要確認行為，請用本機 `npm run test` 或實際跑起來的應用。

## 相關文件

- [README](../README.zh-TW.md)
- [主題系統](THEME.zh-TW.md)
- [專案結構](PROJECT_STRUCTURE.zh-TW.md)
- [安裝設定](SETUP.zh-TW.md)
- [API](API.zh-TW.md)
