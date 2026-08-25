# AkaMoney 設計比稿 — 共用需求契約（BRIEF）

> **狀態：已凍結（frozen contract）。** 本文件是交付給 14 位提案代理人的唯一需求來源。
> 收到 **本檔 + 你被指派的那一列 + `shared/scenarios.js` +（M1／M2 另加）`shared/mone-tokens.md`**
> 就足以產出合規提案，**不需要也不應該**再去閱讀 AkaMoney 原始碼或計畫書。
>
> 文中 **必須 / MUST**、**禁止 / MUST NOT**、**應該 / SHOULD** 依 RFC 2119 語意。
> 凡標記「驗證器檢查」者，會由自動化 Playwright 驗收腳本以程式判定，**不通過即退件**。

---

## 0. 你要交付什麼

在 `design-mockups/proposals/` 底下產出**兩個檔案**，檔名由你的指派列決定（§13）：

| 檔案 | 內容 |
|---|---|
| `<編號>-<slug>.html` | 單一 entry HTML，內含 6 個語義畫面、雙布景、真實圖表、全部互動 |
| `<編號>-<slug>.manifest.json` | 依 §12 schema 撰寫的機器可讀描述 |

**其他限制**

- **禁止**修改 `design-mockups/shared/` 內任何檔案（唯讀共用資產）。
- **禁止**新增第三個檔案（不得拆出獨立 `.css` / `.js`；所有樣式與腳本內嵌於 HTML）。
- **禁止** commit。`design-mockups/` 已列入 repo 的 `.gitignore`（`.gitignore:178`），產出不進版控。
- **禁止**動到 repo 內 `design-mockups/` 以外的任何檔案。

---

## 1. 產品背景

AkaMoney 是一套自架短網址服務，管理後台供內部團隊建立短網址、追蹤點擊成效。目前架構為
Cloudflare Workers（轉址 + Admin API）＋ Vue 3 SPA 管理台，短網域為 **`aka.money`**（提案一律使用此假網域）。

管理台的核心資料模型（提案的欄位語彙一律以此為準）：

```ts
UrlResponse {
  id: string; short_code: string; original_url: string; short_url: string;
  title?: string; description?: string; image_url?: string;
  created_at: number;      // Unix 毫秒
  updated_at: number;      // Unix 毫秒
  expires_at?: number;     // Unix 毫秒，未設定表示永不過期
  is_active: boolean;      // false = 已封存
  click_count: number;
}
```

分析資料模型：`AnalyticsResponse` 提供 `total_clicks`、`clicks_by_date`、`clicks_by_country`、
`clicks_by_device`、`clicks_by_browser`、`recent_clicks[]`；
總覽模型 `OverallStatsResponse` 提供 `total_clicks`、`active_links`、`total_links`、`click_trend`、
`top_links[]`、`country_distribution`、`device_distribution`、`date_range`。

現有路由（決定 §2 的六個語義畫面）：`/dashboard`、`/stats`、`/analytics/:shortCode`、`/login`、
`/:pathMatch(.*)*`（404）。建立短網址目前沒有獨立路由，是 Dashboard 內的 modal。

### 1.1 現況 UX 缺陷（本次比稿要解決的問題）

| # | 缺陷 | 現況證據 |
|---|---|---|
| 1 | **零品牌感**：直接套用 Bootstrap 5.3 預設外觀，主色為原生藍 `#0d6efd`，客製規則僅約 5 條 | `src/frontend/src/assets/css/main.css:24, 57-83` |
| 2 | **假圖表**：趨勢圖用 `progress-bar` 逐列堆疊模擬，沒有任何圖表庫 | `AnalyticsView.vue` 的 `clicks_by_date` 迴圈 + `.progress`；`OverallStatsView.vue` 的 `click_trend` 迴圈 + `.progress` |
| 3 | **資料密度極低**：每筆短網址一張 `col-12` 全寬 card 垂直堆疊，一屏看不到幾筆 | `DashboardView.vue` 的 URLs List 區塊 |
| 4 | **弱資訊層級**：`h2 My URLs` + 兩顆按鈕，KPI、趨勢、清單彼此無視覺主從 | `DashboardView.vue` header 區塊 |
| 5 | **手刻 modal 疊床架屋**：建立／編輯／封存／還原四個 modal 全塞在同一個 998 行檔案，樣式為 `modal fade show d-block` + inline `rgba(0,0,0,0.5)` | `DashboardView.vue` 四個 modal 區塊 |
| 6 | **無布景切換**：僅有淺色，沒有深色模式 | 全站無 `data-bs-theme` / 深色 token |
| 7 | **字體為系統預設堆疊**，無品牌字型、無 CJK 排版考量 | `main.css:52-54` |
| 8 | **介面文案為英文**（`My URLs`、`Create New`、`Total Clicks`…），與繁中使用者情境不符 | `DashboardView.vue`、`AnalyticsView.vue`、`OverallStatsView.vue`、`LoginView.vue` |
| 9 | **空／零資料狀態敷衍**：一律 `No data available` 置中灰字 | `AnalyticsView.vue`、`OverallStatsView.vue` |
| 10 | **登入頁毫無記憶點**：置中 `card shadow` + 一顆 `btn-primary btn-lg` | `LoginView.vue` |

**評選主軸只有兩個字：好看（視覺品質）與好用（任務流程）。**
**無障礙（WCAG）不是評分維度、也不是驗收門檻**；僅保留與「好用」直接相關的鍵盤操作與
`prefers-reduced-motion`（見 §8）。

---

## 2. 六個語義畫面（MUST，驗證器檢查）

每份提案 **MUST** 在同一個 HTML 內提供以下 6 個語義畫面，畫面切換由 §11 協定或畫面內導覽驅動：

| 語義名稱 | 內容要求 |
|---|---|
| `dashboard` | 短網址清單（含搜尋、依點擊排序、複製、封存入口）、清單層級的成效摘要 |
| `analytics` | **單一短網址**的成效：總點擊、每日趨勢、國家／裝置／瀏覽器分佈 |
| `stats` | **全帳號總覽**：總點擊、作用中／全部連結數、期間趨勢、Top Links、國家／裝置分佈、日期區間 |
| `login` | 登入畫面（Microsoft 帳號登入為唯一登入方式，可另呈現開發模式提示） |
| `create` | 建立短網址的**任務狀態**（見下） |
| `notfound` | 短代碼不存在／路由不存在的 404 畫面，含回到 dashboard 的出口 |

**關於 `create`：**
`create` 是一個**任務狀態，不必然是路由或 modal**。你可以用 modal、右側 drawer、底部 sheet、
命令面板、行內快速建立列、或獨立專頁來實作——由你的**結構 DNA**（§14）指定，不可自選。
但無論形式為何：

- **MUST** 存在唯一元素 `[data-view="create"]`。
- 收到 `SET_VIEW` + `value: "create"` 時 **MUST** 讓該元素可見，且根元素 `data-active-view="create"`。
- **例外規則（驗證器據此判定）**：當 `data-active-view` 為 `dashboard`/`analytics`/`stats`/`login`/`notfound`
  時，**有且僅有**該名稱的 `[data-view]` 可見；當 `data-active-view="create"` 時，
  `[data-view="create"]` **MUST** 可見，且**最多**再允許一個其他 `[data-view]` 同時可見（作為底層宿主畫面）。

---

## 3. 共通能力（MUST，驗證器檢查）

不指定 UX 解法，只指定「使用者要能完成什麼」。以下每一項都 **MUST** 真的可操作，不得只是靜態外觀。

| # | 能力 | 具體要求 |
|---|---|---|
| C1 | **建立短網址** | 表單至少含：原始長網址（必填）、自訂短代碼（必填，3–20 字，`[a-zA-Z0-9-_]`）、標題（選填）、描述（選填）、預覽圖（選填，可為上傳區或網址欄）、到期時間（選填，留空＝永不過期）。送出後 **MUST** 在畫面上看到成功回饋，且新連結**出現在 dashboard 清單最前面**（純前端記憶體即可）。 |
| C2 | **搜尋與查無結果** | 搜尋輸入即時（或送出後）過濾短代碼／原始網址／標題；**MUST** 有專屬的「查無結果」狀態（不得只是空白），並提供清除查詢的方式。 |
| C3 | **依點擊數重新排序** | 一個明確控制項可切換點擊數排序（至少 遞減 ⇄ 遞增），**MUST** 真的改變 DOM 中列表項目的順序。 |
| C4 | **複製短網址並取得回饋** | 每筆連結可複製 `aka.money/<short_code>`；**MUST** 在 300ms 內出現可見成功回饋（toast／圖示變化／inline 標籤皆可）；剪貼簿 API 失敗時 **MUST NOT** 拋出未捕捉錯誤（`try/catch` + 降級）。 |
| C5 | **封存 + 確認 + 復原** | 封存 **MUST** 先出現確認層（modal／sheet／inline confirm 皆可），確認後該筆進入「已封存」狀態；**MUST** 提供復原路徑：撤銷（undo）提示，或在已封存清單／篩選中提供「還原」動作。兩者皆可，至少擇一且真的可還原。 |
| C6 | **狀態完整** | 六種狀態都 **MUST** 可被看到：載入中（loading）、空清單（empty）、API 錯誤（error）、搜尋無結果（no-results）、圖表零資料（zero analytics）、大量資料（250 筆）。前五種由 `SET_DATASET` 對應情境驅動（§10），loading 至少在切換資料集或送出表單時短暫出現。 |

---

## 4. 響應式（MUST，驗證器檢查）

- **桌機基準：1440 × 900**；**行動基準：390 × 844**。兩個尺寸都 **MUST** 完整可用。
- **禁止水平溢位**：兩個尺寸下 `document.documentElement.scrollWidth <= window.innerWidth + 1`，
  且六個畫面、七種資料情境（含 250 筆與超長網址）都成立。
- **不得**自建裝置切換器／不得使用固定像素寬容器鎖死版面；比較中心會直接改 iframe 寬度，
  提案必須靠 CSS 斷點自然適應。
- 刻意的橫向捲動容器（例如 DNA 指定 `horizontal-scroll-table`）**允許**，但 **MUST** 侷限在
  該容器內（`overflow-x: auto`），**不得**讓 `<html>` 產生水平捲軸。
- 超長原始網址（`edgeCases` / `large250` 情境）**MUST** 以截斷、換行或省略處理，不得撐破版面。

---

## 5. 淺色 / 深色雙布景（MUST，驗證器檢查）

- 兩套布景 **MUST 各自獨立調校**，**MUST NOT** 是反相。
- **禁止** `filter: invert(...)`、`mix-blend-mode` 反相、或整站 `filter: hue-rotate` 之類的偷吃步。
- 切換 **MUST** 透過根元素 `data-theme="light" | "dark"` 驅動（見 §11／§12），且：
  - 圖表配色 **MUST** 跟著換（含格線、軸標籤、tooltip 文字色）。
  - 兩套布景的品牌調性 **MUST** 一致（同一個設計語言的兩種光線條件），不是兩個不同設計。
- 初始布景固定為 **`light`**（比較中心接手後再下 `SET_THEME`）。可讀取
  `prefers-color-scheme` 作為使用者自行開啟時的偏好，但 **MUST** 在收到 `SET_THEME` 時無條件服從。
- 每份提案 **MUST** 在畫面上提供一個 `[data-action="theme-toggle"]` 控制項，使用者自己也能切換。

---

## 6. 真實圖表（MUST，驗證器檢查）

- **MUST** 使用 **Chart.js，鎖定精確版本**（§16）。
- **禁止**用 `div` 寬度、`progress-bar`、純 CSS 長條假裝圖表（這正是現況缺陷 #2）。
- 圖表 **MUST** 綁定共用情境資料的真實數值（§10），不得寫死示範數字。
- **圖表容器與 id（驗證器檢查）**：圖表 **MUST** 放在帶 `data-chart="<chart-id>"` 的容器內，
  允許的 chart-id 為固定清單：

  | chart-id | 出現位置 | 資料來源 |
  |---|---|---|
  | `clicks-trend` | `analytics` | `scenario.analytics.dailySeries` |
  | `country-distribution` | `analytics` | `scenario.analytics.countryDistribution` |
  | `device-distribution` | `analytics` | `scenario.analytics.deviceDistribution` |
  | `browser-distribution` | `analytics` | `scenario.analytics.browserDistribution` |
  | `stats-trend` | `stats` | `scenario.overallStats.click_trend` |
  | `stats-country` | `stats` | `scenario.overallStats.country_distribution` |
  | `stats-device` | `stats` | `scenario.overallStats.device_distribution` |
  | `dashboard-sparkline` | `dashboard`（選用） | `scenario.analytics.dailySeries` |

  **最低要求**：`analytics` 至少 `clicks-trend` + 另外兩個分佈圖；`stats` 至少 `stats-trend` + 一個分佈圖。
  圖表型別（line／bar／doughnut／radar…）由你決定。

- **靜態 SVG 降級（MUST）**：以 `onerror` 或載入後 `typeof window.Chart === 'undefined'` 判斷 CDN 失敗，
  失敗時 **MUST** 在同一個 `[data-chart]` 容器內以**內嵌 SVG** 畫出**同一份真實資料**的簡化圖表
  （折線／長條即可），並且 **MUST NOT** 產生 console 錯誤。
- **狀態標記（本簡報要求，驗證器可使用）**：每個 `[data-chart]` 容器 **MUST** 帶
  `data-chart-state="rendered" | "empty" | "fallback"`：
  - `rendered` = Chart.js 已成功繪製且有資料
  - `empty` = 資料為零（`zeroAnalytics` 情境）——此時 **MUST** 呈現設計過的零資料狀態，而非空白容器
  - `fallback` = CDN 失敗，已改用內嵌 SVG

---

## 7. 繁體中文與 CJK 字型（MUST）

### 7.1 文案

- 介面文案 **全面繁體中文（zh-TW）**；`<html lang="zh-Hant-TW">`。
- **固定欄位語彙**（**MUST** 逐字使用，確保 14 案可比較）：

  | 概念 | 固定用詞 |
  |---|---|
  | 短網址 | 短網址 |
  | 原始網址 | 原始網址 |
  | 短代碼 | 短代碼 |
  | 標題 / 描述 / 預覽圖 | 標題 / 描述 / 預覽圖 |
  | 到期時間 | 到期時間 |
  | 點擊數 | 點擊數 |
  | 建立時間 | 建立時間 |
  | 狀態值 | 作用中 / 已封存 / 已過期 |
  | 六個畫面 | 儀表板 / 成效分析 / 總覽統計 / 登入 / 建立短網址 / 找不到頁面 |
  | 主要動作 | 建立 / 搜尋 / 複製 / 封存 / 還原 / 排序 |

- 其餘微文案（空狀態、錯誤說明、按鈕輔助字、tooltip）**自由發揮**，且是視覺個性的一部分。
- 數字、短代碼、網址維持拉丁字元；日期格式建議 `YYYY-MM-DD`（情境資料即此格式）。

### 7.2 CJK 後備鏈（MUST）

Libre Baskerville、Playfair Display、JetBrains Mono、Geist、Archivo Black 等**皆無中文字符**，
直接使用會 fallback 成系統預設字，設計意圖全毀。所有 `font-family` **MUST** 依下表配置後備鏈：

| 角色 | 拉丁字型 | 必須搭配的 CJK 字型 | 建議宣告 |
|---|---|---|---|
| 襯線標題 | Libre Baskerville / Playfair Display | **Noto Serif TC** | `font-family: "Libre Baskerville", "Noto Serif TC", serif;` |
| 無襯線內文 | Inter / Geist / Manrope | **Noto Sans TC** | `font-family: "Inter", "Noto Sans TC", system-ui, sans-serif;` |
| 等寬數據 | JetBrains Mono / IBM Plex Mono | **Noto Sans TC** | `font-family: "JetBrains Mono", "Noto Sans TC", monospace;` |
| 展示字 | Archivo Black / Space Grotesk | **Noto Sans TC**（Bold） | `font-family: "Space Grotesk", "Noto Sans TC", sans-serif;` |

**等寬字硬規則（MUST）**：中文沒有真正的等寬選項。**mono 只能用於拉丁／數值資料**
（短代碼、數字、時間戳、URL），**中文一律 Noto Sans TC**。
**禁止**對含中文的區塊設定全域 `font-family: monospace`。
（09 Terminal 案特別註記：以「終端機配色與版面」承載風格，而非全域等寬。）

---

## 8. 動效與鍵盤（MUST，驗證器檢查）

- **至少兩個有目的的微互動**（不是裝飾）。有目的＝幫助理解狀態變化。合格範例：
  複製成功的圖示形變、排序時列表項目的位移過渡、drawer/sheet 的方向性進場、
  資料載入的骨架屏轉真實內容、封存後的 undo 提示滑入。
- **`prefers-reduced-motion`（MUST）**：
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```
  若有 JS 驅動動畫，**MUST** 另以 `window.matchMedia('(prefers-reduced-motion: reduce)').matches` 判斷跳過。
- **鍵盤可用性（屬「好用」，非無障礙合規）**：
  - 核心流程（建立、搜尋、排序、複製、封存確認）**MUST** 能純鍵盤完成。
  - 所有互動元素 **MUST** 是原生可聚焦元素（`<button>` / `<a href>` / `<input>` / `<select>`）
    或具備 `tabindex="0"` + `keydown` Enter/Space 處理。
  - **`Esc` MUST 關閉任何對話層**（modal／drawer／sheet／命令面板／確認層），
    並將焦點**還原到觸發元素**。
  - 對話層開啟時，焦點 **MUST** 移入該層，且 **MUST NOT** 逸失到 `<body>`。
  - 隱藏中的畫面 **MUST NOT** 被 Tab 走到（用 `hidden`、`display:none` 或 `inert`）。

---

## 9. 能力三級標記（MUST，寫入 manifest）

為避免展示做不出來的功能，每個提案在 manifest 的 `capabilities` 中 **MUST** 標記所用功能的分級：

| 級別 | 定義 |
|---|---|
| **A** | 現有 API 直接支援，可直接實作 |
| **B** | 前端可由現有資料推導，不需後端變更 |
| **C** | 需要後端新增 API／聚合欄位 |

**已查核的既定分級（MUST 照抄，不得自行改判）：**

| 功能 | 級別 | 理由 |
|---|---|---|
| 點擊趨勢（按日期） | **A** | `AnalyticsResponse.clicks_by_date` / `OverallStatsResponse.click_trend` |
| 國家分佈 | **A** | `clicks_by_country` / `country_distribution` |
| 裝置分佈 | **A** | `clicks_by_device` / `device_distribution` |
| 瀏覽器分佈 | **A** | `clicks_by_browser` |
| 總覽 KPI（總點擊／作用中／全部連結） | **A** | `OverallStatsResponse` |
| Top Links | **A** | `OverallStatsResponse.top_links` |
| **當前頁**的搜尋／篩選／排序 | **B** | 前端對已取得的分頁資料推導 |
| 依標題／描述關鍵字高亮 | **B** | 前端推導 |
| **OS 分佈** | **C** | `AnalyticsResponse` 無此聚合欄位，僅 `recent_clicks[].os` 有原始值 |
| **來源（referrer）分佈** | **C** | 同上，僅 `recent_clicks[].referer` 有原始值 |
| **全域搜尋**（跨所有分頁） | **C** | 列表 API 僅支援 `page` / `limit` |
| **跨頁排序**（全資料集排序） | **C** | 同上 |

**規則**：你**可以**展示 C 級功能（它們可能正是好設計的一部分），但 **MUST**
在 manifest 中誠實標記為 `C`，並在 `note` 說明需要什麼後端支援。
比較中心會據此自動計算真實遷移成本——**因此 manifest 中 MUST NOT 出現 `estimatedMigration` 欄位**。

---

## 10. 共用情境資料契約（MUST，驗證器檢查）

### 10.1 載入方式

```html
<script src="../shared/scenarios.js"></script>
```

- 載入後全域可用 `window.AKAMONEY_SCENARIOS`，提供兩個函式：
  - `listScenarios(): string[]` — 回傳 7 個情境名稱
  - `getScenario(name: string): Scenario` — 回傳**深拷貝**，可安全就地修改
- **禁止** `fetch()` / `XMLHttpRequest` / 動態 `import()` 讀取本地檔案
  （提案必須在 `file://` 降級模式下也不報錯）。
- **禁止**自行編造任何連結、數字、國家、裝置或趨勢資料。畫面上出現的每一筆資料
  **MUST** 來自 `getScenario()`，或來自使用者在 `create` 流程中親手輸入的內容。

### 10.2 七個情境名稱（MUST 逐字，順序即 `listScenarios()` 順序）

```
default   large250   empty   noResults   edgeCases   zeroAnalytics   apiError
```

| 情境 | 內容 | 提案必須呈現 |
|---|---|---|
| `default` | 15 筆（12 作用中 + 3 已封存），總點擊 1219 | 一般狀態；封存篩選有東西可看 |
| `large250` | 250 筆（含超長網址、無標題、已過期、已封存邊界資料） | 密度策略：分頁／虛擬捲動／區段載入皆可，但 **MUST** 能瀏覽全部 250 筆且不卡頓、不溢位 |
| `empty` | 0 筆 | 設計過的空狀態＋引導建立第一筆 |
| `noResults` | 8 筆資料，`meta.searchQuery` 為必然無命中的查詢詞 | **MUST** 用 `meta.searchQuery` 預填搜尋框並直接呈現「查無結果」狀態 |
| `edgeCases` | 4 筆：超長 URL、無標題、已過期、已封存 | 截斷／預設文案／過期徽章／封存徽章的版面韌性 |
| `zeroAnalytics` | 3 筆連結、0 點擊、`dailySeries` 為空陣列 | 圖表零資料狀態（`data-chart-state="empty"`） |
| `apiError` | 0 筆，`meta.error` 為錯誤訊息字串 | **MUST** 呈現錯誤狀態並顯示 `meta.error` 文案，提供重試出口 |

### 10.3 情境物件結構（MUST 依此讀取）

```js
{
  name: string,                       // 七個名稱之一
  urls: [ /* UrlResponse 形狀，見 §1；is_active 為 boolean，時間為 Unix 毫秒 */ ],
  analytics: {
    totalClicks: number,
    dailySeries: [{ date: 'YYYY-MM-DD', clicks: number }],   // 30 點；zeroAnalytics/apiError 為 []
    countryDistribution: { '臺灣': n, '日本': n, '美國': n, '新加坡': n },
    deviceDistribution:  { '手機': n, '桌機': n, '平板': n },
    browserDistribution: { Safari: n, Chrome: n, Edge: n, Firefox: n },
    campaignSpike: { date: 'YYYY-MM-DD', clicks: number, label: string } | null,
    highlights: string[]              // 已是繁中短句，可直接呈現
  },
  overallStats: {
    total_clicks, active_links, total_links, archived_links,
    average_clicks_per_link,
    click_trend: { 'YYYY-MM-DD': number },
    top_links: [{ short_code, original_url, click_count, title }],
    country_distribution, device_distribution,
    date_range: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
  },
  user: { id, email, name: '設計評審小組', role: 'admin' },
  meta: {
    locale: 'zh-TW', generatedAt: number, summary: string,
    searchQuery?: string,             // 僅 noResults
    error?: string                    // 僅 apiError
  }
}
```

### 10.4 情境切換行為

- 收到 `SET_DATASET` 時，**MUST** 以新情境**重建**畫面資料（含圖表 destroy/re-create），
  並更新根元素 `data-dataset`，再回送 `STATE_CHANGED`。
- 切換情境 **MUST NOT** 造成 console 錯誤、圖表殘影或記憶體洩漏（重建前先 `chart.destroy()`）。
- 使用者在 `create` 流程新增的資料屬於當前 session；切換情境時可重置。

---

## 11. 父子 postMessage 控制協定（MUST，驗證器檢查）

比較中心（父視窗）以 iframe 嵌入每份提案。協定**逐字如下，不得增減欄位名稱**。

### 11.1 父 → 子

```ts
{
  source: "akamoney-compare",
  type: "SET_VIEW" | "SET_THEME" | "SET_DATASET",
  value: string
}
```

允許值（**MUST** 驗證，不合法一律**忽略**且**不得**拋錯）：

| type | 允許的 value |
|---|---|
| `SET_VIEW` | `dashboard` \| `analytics` \| `stats` \| `login` \| `create` \| `notfound` |
| `SET_THEME` | `light` \| `dark` |
| `SET_DATASET` | `default` \| `large250` \| `empty` \| `noResults` \| `edgeCases` \| `zeroAnalytics` \| `apiError` |

**接收端 MUST**：
1. 先檢查 `event.data` 是非 null 物件，且 `event.data.source === "akamoney-compare"`；否則直接 return。
2. 再檢查 `type` 與 `value` 在允許清單內；否則直接 return。
3. 套用狀態 → 更新根元素 `data-*` → 回送 `STATE_CHANGED`。

### 11.2 子 → 父

```ts
{
  source: "akamoney-proposal",
  proposalId: string,               // MUST 等於 manifest.id 與 [data-proposal-id]
  type: "READY" | "STATE_CHANGED",
  state: { view: string, theme: string, dataset: string }
}
```

- `READY`：首次渲染完成後**送出一次**（`DOMContentLoaded` 之後、字型／圖表載入不阻塞）。
- `STATE_CHANGED`：**每一次**狀態變更後送出，**包含使用者在 iframe 內自行操作**
  （點畫面內導覽、自己按 `[data-action="theme-toggle"]`）造成的變更。
- 發送方式：`window.parent.postMessage(msg, "*")`；
  **MUST** 先檢查 `window.parent !== window`，獨立開啟時不送。

### 11.3 參考實作骨架（可直接改寫使用）

```html
<script>
(function () {
  var PROPOSAL_ID = '01-linear';                       // MUST 換成你的 id
  var VIEWS = ['dashboard','analytics','stats','login','create','notfound'];
  var THEMES = ['light','dark'];
  var DATASETS = ['default','large250','empty','noResults','edgeCases','zeroAnalytics','apiError'];
  var state = { view: 'dashboard', theme: 'light', dataset: 'default' };

  function emit(type) {
    if (window.parent === window) return;
    window.parent.postMessage({
      source: 'akamoney-proposal',
      proposalId: PROPOSAL_ID,
      type: type,
      state: { view: state.view, theme: state.theme, dataset: state.dataset }
    }, '*');
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.source !== 'akamoney-compare') return;
    if (data.type === 'SET_VIEW'    && VIEWS.indexOf(data.value)    !== -1) applyView(data.value);
    else if (data.type === 'SET_THEME'   && THEMES.indexOf(data.value)   !== -1) applyTheme(data.value);
    else if (data.type === 'SET_DATASET' && DATASETS.indexOf(data.value) !== -1) applyDataset(data.value);
    else return;
    emit('STATE_CHANGED');
  });
  // applyView / applyTheme / applyDataset MUST 更新 state 與根元素 data-*，並重繪。
  // 初始化完成後：emit('READY');
})();
</script>
```

### 11.4 `localStorage` 規則

- 全域狀態由父層持有。子頁**可以不用** `localStorage`。
- 若使用，key **MUST** 以 `akamoney-proposal:<proposalId>:` 為前綴，且 **MUST** 包在 `try/catch` 中
  （`file://` 下行為未定義）。
- 正式檢視方式為**本機 HTTP server**（例如 `npx serve design-mockups` 或
  `python -m http.server`），雙擊 `file://` 開啟僅為降級模式，但降級模式下 **MUST NOT** 出現 console 錯誤。

---

## 12. DOM hooks 與 manifest schema

### 12.1 核心 DOM hooks（MUST，驗證器直接查詢）

| Hook | 規則 |
|---|---|
| `[data-proposal-id]` | 全文件**有且僅有一個**元素帶此屬性（建議 `<body>` 或單一根 `<div>`）；值 **MUST** 等於 manifest `id` 與檔名前綴。狀態屬性 **MUST** 掛在**同一個**元素上。 |
| `[data-view="<name>"]` | 六個名稱各**有且僅有一個**元素；非作用中畫面 **MUST** 不可見且不可 Tab（`hidden` / `display:none` / `inert`）。可見性規則見 §2。 |
| `[data-action="<name>"]` | **核心允許值恰為**：`theme-toggle`、`view-switch`、`search`、`sort-clicks`、`copy`、`archive`、`create-submit`（另有兩個延伸值見下表，除此之外 **MUST NOT** 自創其他 `data-action` 值）。**MUST** 是原生可聚焦互動元素。 |
| `[data-chart]` | 圖表容器，值取自 §6 的 chart-id 固定清單。 |
| 根元素狀態屬性 | `data-theme`（`light`\|`dark`）、`data-active-view`（六名稱之一）、`data-dataset`（七情境之一）。**MUST** 隨狀態即時同步。 |

**各 action 的最低語意（MUST）**

| action | 數量 | 語意 |
|---|---|---|
| `theme-toggle` | 恰 1 個 | 點擊切換 `data-theme` 並回送 `STATE_CHANGED` |
| `view-switch` | ≥ 1 個 | 切換語義畫面；**MUST** 另帶 `data-view-target="<六名稱之一>"` |
| `search` | 恰 1 個 | **MUST** 是 `<input>`；輸入即影響清單結果 |
| `sort-clicks` | ≥ 1 個 | 切換點擊數排序方向，**MUST** 真的改變 DOM 順序 |
| `copy` | 每筆連結 1 個 | 複製 `aka.money/<short_code>`，並顯示可見回饋 |
| `archive` | 每筆作用中連結 1 個 | 開啟封存確認層 |
| `create-submit` | ≥ 1 個 | `create` 表單的送出按鈕 |

**延伸 hooks（本簡報要求；驗證器可使用，但核心 gate 為上表五項）**

| Hook | 用途 |
|---|---|
| `data-view-target="<view>"` | 掛在 `[data-action="view-switch"]` 上，宣告目標畫面 |
| `data-chart-state="rendered\|empty\|fallback"` | 掛在 `[data-chart]` 上，宣告圖表實際狀態（§6） |
| `data-copy-state="idle\|copied"` | 掛在 `[data-action="copy"]` 上，複製成功後 2 秒內為 `copied` |
| `[data-action="archive-confirm"]` | 封存確認層中的確認按鈕 |
| `[data-action="archive-undo"]` | 撤銷／還原按鈕（C5 的復原路徑） |
| `[data-state="loading\|empty\|error\|no-results"]` | 標記當前狀態容器，供驗證器確認 C6 六狀態 |

### 12.2 Manifest schema（MUST，逐欄位）

檔名 `<編號>-<slug>.manifest.json`，與 HTML 同目錄。**頂層欄位恰為以下 9 個，不多不少：**

```json
{
  "id": "01-linear",
  "title": "Linear 式極簡專業",
  "provider": "Anthropic",
  "model": "claude-opus-4.8",
  "direction": "Linear 式極簡專業",
  "stack": "Tailwind v4",

  "dna": {
    "navigation": "fixed-sidebar",
    "linkRepresentation": "dense-table",
    "createFlow": "command-palette",
    "analyticsModel": "exploration-workbench",
    "mobileStrategy": "priority-column-summary-row",
    "workMode": "scan"
  },

  "tokens": {
    "colors": {
      "light": {
        "bg": "#ffffff", "surface": "#fafafa", "surfaceAlt": "#f4f4f5",
        "textPrimary": "#18181b", "textSecondary": "#71717a",
        "border": "#e4e4e7", "accent": "#5e6ad2",
        "success": "#16a34a", "warning": "#d97706", "danger": "#dc2626",
        "chartSeries": ["#5e6ad2", "#16a34a", "#d97706", "#dc2626", "#0891b2"]
      },
      "dark": {
        "bg": "#0d0e10", "surface": "#131417", "surfaceAlt": "#1a1b1f",
        "textPrimary": "#ededf0", "textSecondary": "#8a8f98",
        "border": "#23252a", "accent": "#7b85e8",
        "success": "#4ade80", "warning": "#fbbf24", "danger": "#f87171",
        "chartSeries": ["#7b85e8", "#4ade80", "#fbbf24", "#f87171", "#22d3ee"]
      }
    },
    "typography": {
      "displayFamily": "\"Inter\", \"Noto Sans TC\", sans-serif",
      "bodyFamily": "\"Inter\", \"Noto Sans TC\", sans-serif",
      "monoFamily": "\"JetBrains Mono\", \"Noto Sans TC\", monospace",
      "cjkSerif": "Noto Serif TC",
      "cjkSans": "Noto Sans TC",
      "baseSize": "14px",
      "scale": ["11px", "12px", "14px", "16px", "20px", "28px"]
    },
    "radii": { "sm": "3px", "md": "5px", "lg": "8px", "xl": "12px", "full": "9999px" },
    "spacing": { "unit": "4px", "xs": "4px", "sm": "8px", "md": "12px", "lg": "16px", "xl": "24px", "2xl": "32px" }
  },

  "capabilities": [
    { "feature": "每日點擊趨勢圖", "class": "A", "note": "使用 clicks_by_date" },
    { "feature": "當前頁點擊數排序", "class": "B", "note": "前端對已載入分頁排序" },
    { "feature": "全域搜尋", "class": "C", "note": "需後端在列表 API 加入 q 參數" }
  ]
}
```

> 上例的 `capabilities` 僅為示意（**實際 MUST 至少 6 項**），其餘欄位結構為完整必備形狀。

**欄位規則**

| 欄位 | 型別 / 允許值 |
|---|---|
| `id` | string，**MUST** 等於檔名前綴與 `[data-proposal-id]`（例：`01-linear`、`m1-mone-faithful`） |
| `title` | string，繁中，提案標題 |
| `provider` | `Anthropic` \| `OpenAI` \| `Google` \| `xAI` \| `Microsoft`（照指派列） |
| `model` | 照指派列的模型字串 |
| `direction` | 照指派列的設計方向 |
| `stack` | `Tailwind v4` \| `手寫 CSS` \| `Bootstrap 5.3`（照指派列） |
| `dna` | 恰 6 個 key，值 **MUST** 取自 §14.1 的英文 enum，且 **MUST** 與你的指派列完全一致 |
| `tokens.colors.light` / `.dark` | 兩者 **MUST** 有**完全相同的 key 集合**，且 **MUST** 至少包含上例列出的 11 個 key（`chartSeries` 為 3–9 個 hex 字串陣列） |
| `tokens.typography` | 恰含 `displayFamily`、`bodyFamily`、`monoFamily`、`cjkSerif`、`cjkSans`、`baseSize`、`scale` |
| `tokens.radii` | 恰含 `sm`、`md`、`lg`、`xl`、`full` |
| `tokens.spacing` | 恰含 `unit`、`xs`、`sm`、`md`、`lg`、`xl`、`2xl` |
| `capabilities` | 陣列，每項恰含 `feature`(string)、`class`(`A`\|`B`\|`C`)、`note`(string)；**MUST** 至少 6 項且至少涵蓋 1 個 A、1 個 B |
| `estimatedMigration` | **MUST NOT 存在**（由比較中心統一計算，避免不可比較的主觀數字） |

JSON **MUST** 為合法 UTF-8、無註解、無尾逗號。

---

## 13. 檔名與 14 案指派表（凍結）

| id / 檔名 | 提供商 | 模型 | 設計方向 | 技術棧 |
|---|---|---|---|---|
| `01-linear.html` | Anthropic | `claude-opus-4.8` | Linear 式極簡專業 | Tailwind v4 |
| `02-editorial.html` | Anthropic | `claude-opus-4.8` | Editorial 雜誌感 | 手寫 CSS |
| `03-swiss.html` | Anthropic | `claude-opus-5` | Swiss 國際主義排版 | 手寫 CSS |
| `04-bento.html` | Anthropic | `claude-opus-5` | Bento Grid（Apple 式） | Tailwind v4 |
| `05-vercel.html` | OpenAI | `gpt-5.6-sol` | Vercel / Geist 黑白極簡 | Tailwind v4 |
| `06-brutalist.html` | OpenAI | `gpt-5.6-sol` | Neo-Brutalism 粗獷 | 手寫 CSS |
| `07-material.html` | Google | `gemini-3.1-pro-preview` | Material 3 Expressive | 手寫 CSS |
| `08-glass.html` | Google | `gemini-3.1-pro-preview` | Glassmorphism 玻璃擬態 | Tailwind v4 |
| `09-terminal.html` | xAI | `grok-4.6` | Terminal / Developer-first | 手寫 CSS |
| `10-stripe.html` | xAI | `grok-4.6` | Stripe 式資料密集商業 | Tailwind v4 |
| `11-bootstrap.html` | Microsoft | `mai-code-1.1-flash` | Bootstrap 深度客製（低風險對照組） | Bootstrap 5.3 |
| `12-playful.html` | Microsoft | `mai-code-1.1-flash` | Playful 品牌個性 | Tailwind v4 |
| `m1-mone-faithful.html` | OpenAI | `gpt-5.5` | Monē Warm Morandi 忠實移植 | 手寫 CSS |
| `m2-mone-dense.html` | OpenAI | `gpt-5.5` | Monē 高密度資料工具變體 | Tailwind v4 |

`id` = 檔名去掉 `.html`。manifest 檔名 = 同 `id` + `.manifest.json`。

**技術棧語意**

- **Tailwind v4**：**MUST** 使用 §16 的鎖版 browser CDN；自訂 token 以 `@theme` 或 CSS 變數定義。
- **手寫 CSS**：**MUST NOT** 引入任何 CSS 框架；以 `<style>` 內嵌手寫（可用 CSS 變數、`@layer`、
  `container` query）。
- **Bootstrap 5.3**：**MUST** 使用 §16 鎖版 CSS + bundle JS，並以 CSS 變數覆寫深度客製。

---

## 14. 結構 DNA 矩陣（預先指派，不得自選）

任兩案至少 3 軸不同，藉此保證資訊架構分化。**你 MUST 依你那一列實作，並在 manifest `dna` 逐欄位對應。**

### 14.1 六個結構軸與英文 enum

| 軸 | 中文取值 → manifest enum |
|---|---|
| `navigation` | 固定側欄 `fixed-sidebar`／無 chrome 內容優先 `chromeless`／頂部列 `top-bar`／可收合側欄 `collapsible-sidebar`／極簡頂部+麵包屑 `minimal-top-breadcrumb`／可收合側欄+FAB `collapsible-sidebar-fab`／浮動側欄 `floating-sidebar`／命令面板優先 `command-palette-first`／頂部列+次級導覽 `top-bar-subnav`／工作區分頁 `workspace-tabs`／底部分頁 `bottom-tabs` |
| `linkRepresentation` | 密集資料表 `dense-table`／時間軸 `timeline`／緊湊列 `compact-rows`／Bento 磚牆 `bento-tiles`／卡片網格 `card-grid`／分割窗格 `split-pane`／終端機日誌 `terminal-log` |
| `createFlow` | 命令面板 `command-palette`／專頁 wizard `full-page-wizard`／行內快速建立 `inline-quick-create`／右側 drawer `right-drawer`／專頁 `/new` `dedicated-page`／底部 sheet `bottom-sheet`／置中 modal `center-modal` |
| `analyticsModel` | 探索工作台 `exploration-workbench`／敘事報告 `narrative-report`／比較分析 `comparative`／即時監控 `live-monitor`／目標達成導向 `goal-oriented` |
| `mobileStrategy` | 優先欄位摘要列 `priority-column-summary-row`／卡片重排 `card-reflow`／橫向捲動表格 `horizontal-scroll-table`／逐層 drill-down `progressive-drilldown`／底部分頁 `bottom-tabs`／底部 sheet `bottom-sheet` |
| `workMode` | 掃描 `scan`／敘事 `narrate`／編輯 `edit`／監控 `monitor`／分析 `analyze` |

### 14.2 14 案指派（中文）

| 案 | 導覽形式 | 連結呈現 | 建立流程 | 分析心智模型 | 行動策略 | 工作模式 |
|---|---|---|---|---|---|---|
| 01 | 固定側欄 | 密集資料表 | 命令面板 | 探索工作台 | 優先欄位摘要列 | 掃描 |
| 02 | 無 chrome 內容優先 | 時間軸 | 專頁 wizard | 敘事報告 | 卡片重排 | 敘事 |
| 03 | 頂部列 | 緊湊列 | 行內快速建立 | 比較分析 | 橫向捲動表格 | 編輯 |
| 04 | 可收合側欄 | Bento 磚牆 | 右側 drawer | 即時監控 | 逐層 drill-down | 監控 |
| 05 | 極簡頂部 + 麵包屑 | 卡片網格 | 專頁 `/new` | 探索工作台 | 卡片重排 | 掃描 |
| 06 | 固定側欄 | 卡片網格 | 底部 sheet | 目標達成導向 | 底部分頁 | 編輯 |
| 07 | 可收合側欄 + FAB | 緊湊列 | 底部 sheet | 即時監控 | 底部分頁 | 編輯 |
| 08 | 浮動側欄 | 分割窗格（列表+詳情） | 置中 modal | 即時監控 | 底部 sheet | 分析 |
| 09 | 命令面板優先 | 終端機日誌 | 命令面板 | 探索工作台 | 橫向捲動表格 | 分析 |
| 10 | 頂部列 + 次級導覽 | 密集資料表 | 右側 drawer | 比較分析 | 優先欄位摘要列 | 分析 |
| 11 | 頂部列 | 密集資料表 | 置中 modal | 即時監控 | 卡片重排 | 掃描 |
| 12 | 工作區分頁 | 卡片網格 | 專頁 wizard | 目標達成導向 | 底部分頁 | 敘事 |
| M1 | 底部分頁（行動優先） | 緊湊列 | 底部 sheet | 敘事報告 | 底部分頁 | 敘事 |
| M2 | 可收合側欄 | 密集資料表 | 行內快速建立 | 比較分析 | 逐層 drill-down | 掃描 |

### 14.3 14 案 manifest `dna` 對照（MUST 逐字照抄你那一列）

| id | navigation | linkRepresentation | createFlow | analyticsModel | mobileStrategy | workMode |
|---|---|---|---|---|---|---|
| `01-linear` | `fixed-sidebar` | `dense-table` | `command-palette` | `exploration-workbench` | `priority-column-summary-row` | `scan` |
| `02-editorial` | `chromeless` | `timeline` | `full-page-wizard` | `narrative-report` | `card-reflow` | `narrate` |
| `03-swiss` | `top-bar` | `compact-rows` | `inline-quick-create` | `comparative` | `horizontal-scroll-table` | `edit` |
| `04-bento` | `collapsible-sidebar` | `bento-tiles` | `right-drawer` | `live-monitor` | `progressive-drilldown` | `monitor` |
| `05-vercel` | `minimal-top-breadcrumb` | `card-grid` | `dedicated-page` | `exploration-workbench` | `card-reflow` | `scan` |
| `06-brutalist` | `fixed-sidebar` | `card-grid` | `bottom-sheet` | `goal-oriented` | `bottom-tabs` | `edit` |
| `07-material` | `collapsible-sidebar-fab` | `compact-rows` | `bottom-sheet` | `live-monitor` | `bottom-tabs` | `edit` |
| `08-glass` | `floating-sidebar` | `split-pane` | `center-modal` | `live-monitor` | `bottom-sheet` | `analyze` |
| `09-terminal` | `command-palette-first` | `terminal-log` | `command-palette` | `exploration-workbench` | `horizontal-scroll-table` | `analyze` |
| `10-stripe` | `top-bar-subnav` | `dense-table` | `right-drawer` | `comparative` | `priority-column-summary-row` | `analyze` |
| `11-bootstrap` | `top-bar` | `dense-table` | `center-modal` | `live-monitor` | `card-reflow` | `scan` |
| `12-playful` | `workspace-tabs` | `card-grid` | `full-page-wizard` | `goal-oriented` | `bottom-tabs` | `narrate` |
| `m1-mone-faithful` | `bottom-tabs` | `compact-rows` | `bottom-sheet` | `narrative-report` | `bottom-tabs` | `narrate` |
| `m2-mone-dense` | `collapsible-sidebar` | `dense-table` | `inline-quick-create` | `comparative` | `progressive-drilldown` | `scan` |

---

## 15. 視覺方向：必須做到 / 禁止 / 雙布景翻譯規則（凍結）

**每個方向都明列淺色與深色的翻譯規則，不要自行猜測。**
（Glassmorphism 與 Terminal 原本常被當成深色專屬，但雙布景是硬性要求，因此已明確定義其淺色形態。）

| 案 | 必須做到 | 禁止 | 淺色翻譯 | 深色翻譯 |
|---|---|---|---|---|
| 01 Linear | 高密度、1px 細框、細字重、鍵盤快捷 | 漸層、模糊、大圓角、彩色圖示 | 近白底 + 極淡灰框 | 深炭底 + 微亮框 |
| 02 Editorial | 襯線標題、非對稱版面、大留白 | 卡片網格、儀表板慣例 | 紙張米白 + 墨黑 | 深墨底 + 暖白字 |
| 03 Swiss | 嚴格模組網格、無襯線大標、紅/黑/白 | 圓角 >4px、陰影、漸層 | 純白 + 黑 + 單一紅 | 純黑 + 白 + 同一紅 |
| 04 Bento | 大小不一圓角磚塊、每塊單一訊息 | 傳統表格、等寬卡片列 | 淺灰底 + 白磚 | 深底 + 深灰磚 |
| 05 Vercel | 純黑白 + 單一強調色、銳利對比 | 多彩配色、圓潤可愛 | 白底黑字 | 黑底白字 |
| 06 Neo-Brutalism | 粗黑框、硬邊位移陰影、高飽和撞色 | 柔和陰影、漸層、低飽和 | 亮黃／亮藍底 + 黑框 | 深底 + 螢光撞色 + 白框 |
| 07 Material 3 | 動態色彩、大圓角、明確 elevation、FAB | 扁平無層次 | M3 light scheme | M3 dark scheme |
| 08 Glass | 背景模糊、半透明層、光暈 | 實心不透明卡片 | **淺色霧面玻璃 + 彩色柔光背景**（非白卡） | 深色玻璃 + 暗部光暈 |
| 09 Terminal | 等寬美學、深色終端隱喻、指令列互動 | 圓角卡片、彩色插圖 | **紙張／終端列印風**（白紙黑字綠強調） | 經典深色終端 |
| 10 Stripe | 專業密集表格、精緻圖表 | 大字大圖的玩具感 | 白底 + 靛藍強調 | 深藍黑 + 亮靛藍 |
| 11 Bootstrap | 證明 Bootstrap 也能不醜：改變數、字型、間距 | **保留任何預設藍 `#0d6efd` 與預設 card 外觀** | 自訂 light theme | `data-bs-theme="dark"` 加強調校 |
| 12 Playful | 品牌個性、活潑不幼稚、有溫度空狀態 | 兒童感、廉價、犧牲可讀性 | 明亮彩色 | 深底 + 保持活潑飽和 |
| M1 | **逐值套用 Monē token**、Libre Baskerville、Tonal Layer 取代陰影 | 引入 Monē 以外色票 | Monē light（`#faf8f5`／`#81b29a`） | Monē dark（`#0a0a0b`／`#4ade80`） |
| M2 | 保留 Monē 全部色彩語義與襯線質感，**間距收緊、表格化** | 破壞色彩語義、改用冷色系 | 同 M1 色票，密度提高 | 同 M1 色票，密度提高 |

### 15.1 M1 / M2 專用附加規則

- **MUST** 另讀 `shared/mone-tokens.md`，並**逐值**套用其中的 light/dark 色彩、圖表 palette、
  字級語義、圓角、8px 間距節奏與 Tonal Layer 規則。
- **MUST NOT** 引入該附錄以外的色票。
- 深色模式 **MUST** 遵守：避免純黑背景、primary 用 `#4ade80`、`onPrimary` 用黑字 `#000000`。
- Monē 官方文件已載明部分品牌組合低於 WCAG AA；**這是既有品牌取捨，本次不以 WCAG 為 gate**。
  需要降低可讀性風險時，優先用更大字級、更重字重、圖示＋文字並用，或改用較深的 `accent*` token。

---

## 16. 鎖版資源（MUST，逐字使用下列 URL）

**通則：禁止** `@latest`、`@4`、`@5`、無版號、或任何會隨時間變動的 URL。
**禁止**引入本節未列出的第三方 JS／CSS。

| 資源 | 精確 URL |
|---|---|
| **Tailwind v4（browser CDN）** | `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3/dist/index.global.js` |
| **Chart.js** | `https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js` |
| **Bootstrap CSS** | `https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css` |
| **Bootstrap JS bundle** | `https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js` |
| **Bootstrap Icons（僅 11 案可選用）** | `https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css` |

> 註：Tailwind v3 時代的 `https://cdn.tailwindcss.com` **禁止使用**（非 v4）。

**Google Fonts（僅可使用下列精確家族 URL；只引入你真正用到的）**

```
https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap
https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap
https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&display=swap
https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap
https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap
https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap
https://fonts.googleapis.com/css2?family=Archivo+Black&display=swap
https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap
https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap
https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap
https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;600;700&display=swap
```

（以上 5 個 CDN URL 與 11 個字型 URL 皆已於 2026-08-24 實測回應 200。）

**網路降級（MUST）**

- 字型載入失敗時 **MUST** 有合理的系統字後備鏈（`system-ui`, `"Microsoft JhengHei"`,
  `"PingFang TC"`, `sans-serif`），版面不得崩壞。
- Chart.js 載入失敗時 **MUST** 走 §6 的內嵌 SVG 降級。
- Tailwind／Bootstrap CDN 失敗時，畫面**允許**降級為無樣式，但 **MUST NOT** 出現 JS 例外。
- **禁止**引用外部圖片（情境資料中的 `image_url` 是 `images.example.com` 的**不存在網域**，
  **MUST NOT** 直接當 `<img src>` 使用；請改以佔位圖形、首字母縮圖、或 `onerror` 隱藏處理）。

---

## 17. 交付品質檢查表（自我驗收，逐項打勾）

**結構**
- [ ] 只有 `<id>.html` + `<id>.manifest.json` 兩個檔案
- [ ] 全文件唯一 `[data-proposal-id]`，值 = `id` = 檔名前綴 = manifest `id`
- [ ] 六個 `[data-view]` 各一，可見性符合 §2 規則
- [ ] 七種 `data-action` 齊備且語意正確（§12.1）
- [ ] 根元素 `data-theme` / `data-active-view` / `data-dataset` 即時同步

**協定**
- [ ] 驗證 `source === "akamoney-compare"`，非法訊息靜默忽略
- [ ] 三種 `SET_*` 的 value 白名單驗證
- [ ] 初始化後送出一次 `READY`
- [ ] 每次狀態變更（含使用者自行操作）送出 `STATE_CHANGED`
- [ ] `window.parent === window` 時不發送

**資料**
- [ ] 全部資料來自 `AKAMONEY_SCENARIOS.getScenario()`
- [ ] 七種情境都能切換且畫面正確（含 `apiError` 顯示 `meta.error`、`noResults` 預填 `meta.searchQuery`）
- [ ] `large250` 下 250 筆可完整瀏覽、不卡頓、不溢位

**視覺**
- [ ] 淺／深兩套布景獨立調校，非反相，無 `filter: invert`
- [ ] 圖表配色隨布景切換
- [ ] 依指派的視覺方向執行「必須做到」，未觸犯「禁止」
- [ ] 依指派的結構 DNA 六軸實作，manifest `dna` 逐字對應

**圖表**
- [ ] 使用鎖版 Chart.js 真實繪製，非 CSS 假圖
- [ ] `analytics` ≥ 3 張、`stats` ≥ 2 張，chart-id 取自固定清單
- [ ] `zeroAnalytics` 下為設計過的零資料狀態（`data-chart-state="empty"`）
- [ ] 斷網時走內嵌 SVG 降級（`data-chart-state="fallback"`），無 console 錯誤

**互動與語言**
- [ ] C1–C6 六項能力皆可實際操作完成
- [ ] ≥ 2 個有目的的微互動，且 `prefers-reduced-motion` 生效
- [ ] Esc 關閉所有對話層並還原焦點；核心流程純鍵盤可完成
- [ ] 全繁中；固定欄位語彙逐字使用；CJK 後備鏈依 §7.2 配置

**尺寸**
- [ ] 1440×900 與 390×844 皆無水平溢位（六畫面 × 七情境）
- [ ] Console 在完整操作一輪後**零錯誤、零未捕捉 rejection**

### 17.1 禁止的偷吃步（違反即退件）

1. **禁止**在有圖表資料時仍用靜態假長條／假 SVG 冒充圖表（僅 CDN 失敗時允許 SVG 降級）。
2. **禁止**六個畫面只是「同一個通用卡片網格換內容」——各畫面 **MUST** 有實質不同的資訊架構。
3. **禁止**以 `filter: invert()` 或任何反相手法實作深色布景。
4. **禁止**自行編造提案專屬資料（連結、國家、數字、趨勢）。
5. **禁止**留下任何 console 錯誤或未捕捉的 Promise rejection。
6. **禁止**在沒有降級處理的情況下依賴網路資源（字型／CDN／圖片）。
7. **禁止**使用未鎖版的 CDN URL。
8. **禁止**用 `<div onclick>` 之類不可聚焦元素充當核心互動控制項。
9. **禁止**在 manifest 中放入 `estimatedMigration`。
10. **禁止**在畫面中標示自己的模型、提供商或技術棧（**第一輪為盲測**，`title` 以外不得洩漏身分；
    manifest 內的 `provider`／`model` 由比較中心控制何時揭露）。

---

## 18. 視覺主題衝突裁決（重要）

某些通用產出規範（例如 web artifact 類技能）會要求一律套用 **Clawpilot 主題調色盤**。
**本比稿明確不適用該規範**：

- 使用者**明確要求** 14 份提案探索**彼此不同的視覺系統**，這正是本次比稿存在的理由。
- 因此每份提案 **MUST** 依照 §13／§15 指派的視覺方向配色，
  **MUST NOT** 被強制套用 Clawpilot 調色盤。
- **例外**：**比較中心**（不屬於本次提案任務）**MUST** 使用 Clawpilot 主題。
- 若你同時載入了要求 Clawpilot 主題的技能指引，**本 BRIEF 的指派視覺方向優先**。

---

## 19. 名詞速查（一頁摘要）

| 項目 | 值 |
|---|---|
| 語義畫面 | `dashboard` `analytics` `stats` `login` `create` `notfound` |
| 情境名稱 | `default` `large250` `empty` `noResults` `edgeCases` `zeroAnalytics` `apiError` |
| 布景 | `light` `dark`（初始 `light`） |
| 父→子 source | `akamoney-compare` |
| 子→父 source | `akamoney-proposal` |
| 父→子 type | `SET_VIEW` `SET_THEME` `SET_DATASET` |
| 子→父 type | `READY` `STATE_CHANGED` |
| actions | `theme-toggle` `view-switch` `search` `sort-clicks` `copy` `archive` `create-submit` |
| 根狀態屬性 | `data-proposal-id` `data-theme` `data-active-view` `data-dataset` |
| 短網域 | `aka.money` |
| 桌機 / 行動 | 1440×900 / 390×844 |
| Tailwind | `@tailwindcss/browser@4.3.3` |
| Chart.js | `chart.js@4.5.1` |
| Bootstrap | `bootstrap@5.3.8` |
