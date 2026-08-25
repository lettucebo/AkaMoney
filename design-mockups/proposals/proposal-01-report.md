# Proposal 01 — Linear 式極簡專業 · 修正報告

## 2026-08-24 22:44 (UTC+08:00) — 修正全部 8 項審查發現（3 Critical + 5 Important）

### 範圍與限制（依 BRIEF 與任務約束）

本次僅修改下列三個檔案，未更動 validator / shared / BRIEF / 其他 proposal，且未提交（no commit）：

- `design-mockups/proposals/01-linear.html`
- `design-mockups/proposals/01-linear.manifest.json`
- `design-mockups/proposals/proposal-01-report.md`（本檔，新建）

保留 Linear 視覺方向與 DNA 不變：`01-linear.manifest.json` 的 `dna`（`fixed-sidebar` / `dense-table` / `command-palette` / `exploration-workbench` / `priority-column-summary-row` / `scan`）、`tokens`（色票、字體、圓角、間距）、`provider`/`model` 皆維持原值，僅替換 `capabilities` 陣列使其誠實化。所有新增互動沿用既有 Linear 樣式語彙（極簡邊框、`--accent #5e6ad2`、dense 表格列、命令面板）。

資料形狀依 `shared/scenarios.js`（唯讀）：url record 具 `short_code/original_url/title/description/image_url/expires_at/is_active/click_count`；`overall_stats.date_range={start,end}`；`top_links[]={short_code,original_url,click_count,title}`；`edgeCases` 含 `edge-expired`（BASE−3d 到期）與 `edge-missing-title`。

### 測試優先閘門（Test-first gate）

#### 基準線（修改前）

- 靜態驗證：`node static-validator.mjs ../proposals/01-linear.html` → `PASS 01-linear` / `1/1 proposal contracts passed`。
- 瀏覽器套件（當時 proposals/ 僅有 01-linear + valid fixture）：`npx playwright test proposals.spec.mjs --grep-invert '@screenshots'` → **56/56 passed**。

結論：套件在基準線已全綠，因此 8 項發現多為品質/正確性問題（僅 F1 短代碼長度、F2 Esc 行為受自動化測試涵蓋）。主要風險是「不得弄壞既有綠燈」，本次已驗證未破壞。

#### 最終驗證（修改後）

靜態驗證（重跑）：

```text
PASS 01-linear
1/1 proposal contracts passed
```

聚焦瀏覽器套件（獨立埠 `VALIDATION_PORT=44311`、`PROPOSAL_ID=01-linear`，避開並行 agent 佔用的預設埠）：

```text
npx playwright test proposals.spec.mjs --grep '01-linear' --grep-invert '@screenshots'

Running 20 tests using 2 workers
  ✓  01-linear proposal contract › applies every view and dataset combination without overflow
  ✓  01-linear proposal contract › uses shared scenario values in every rendered Chart.js container
  ✓  01-linear proposal contract › empties every chart container for zero analytics
  ✓  01-linear proposal contract › keeps every chart fallback visible only when Chart.js request fails
  ✓  01-linear proposal contract › changes every Chart.js theme color category for every real chart
  ✓  01-linear proposal contract › renders the harness frame at the full Playwright viewport
  ✓  01-linear proposal contract › emits READY exactly once from an iframe
  ✓  01-linear proposal contract › emits STATE_CHANGED after parent messages and user changes
  ✓  01-linear proposal contract › ignores malformed parent messages without errors
  ✓  01-linear interaction contract › performs search, sort, copy, archive, create, and theme interactions

  20 passed (49.1s)
```

（desktop + mobile 兩個 project，共 10 個測試 × 2 = 20 案例全數通過，含互動契約測試。）

> 註：本 repo 為多 agent 並行環境，`proposals/` 下同時被其他 agent 新增/修改多個 proposal（05-vercel、07-material、08-glass、11-bootstrap、m1/m2-mone… 等）。全套件跑動時其他 proposal 的失敗屬各自範圍、與 01-linear 無關；上方以 `--grep '01-linear'` 聚焦，證明 01-linear 本身 20/20 全綠。

### 逐項修正對照（F1–F8）

| # | 等級 | 發現 | 修正重點 | 主要證據（`01-linear.html` 行號） |
|---|------|------|----------|-----------------------------------|
| F1 | Critical | 缺預覽圖 UI；短代碼無長度限制/驗證；建立時未持久化 preview/expiry/description/title | 新增「預覽圖片」URL 欄 + 上傳鈕 + 即時縮圖；短代碼 `minlength=3 maxlength=20` + pattern + 提示 + 即時驗證訊息；送出時把 `image_url/expires_at/title/description` 寫入新 record | L650 `name="image_url"`；L656 `type="file" id="image-file"`；L636 short_code `minlength="3"`；L638 提示「3–20 個字元…」；L1315 「短代碼長度需為 3 到 20 個字元。」；L1325 檔案預覽；L1391 `image_url:` 寫入 record |
| F2 | Critical | 命令面板無真正 Esc 關閉、無 focus trap、未還原焦點；UI 文案「Esc 取消」不實 | 面板開啟時對 `.app` 設 `inert` 形成 focus trap；記錄觸發來源 `paletteTrigger`；Esc keydown 僅在 `view==='create'` 時關閉；每條關閉路徑都先移除 `.app` inert 再還原焦點 | L775 `setAttribute('inert')`；L776 `removeAttribute('inert')`；L723 `paletteTrigger`；L786 記錄觸發者；L791 面板首欄 focus；L793 還原前先移除 app inert；L796 還原觸發者焦點；L1303 Esc `if (state.view !== 'create') return;` |
| F3 | Critical | 資料集切換/表單送出無可見載入狀態；retry 無「載入→可觀察結果」 | dashboard 清單延遲渲染（double-rAF + 140ms fallback + token/done 保護），切換與 retry 皆先顯示 `[data-state="loading"]` 橫幅 + 骨架列（保證 ≥1 paint）；表單送出顯示「建立中…」至少一個 paint | L315–L323 loading/skeleton CSS；L727 `datasetToken`；L1145 `showDashboardLoading`；L1155–L1166 骨架列；L1170 `applyDataset` 延遲；L1185 token；L1383 「建立中…」 |
| F4 | Important | 需依 `expires_at` 判定過期、標題缺漏要有刻意 fallback、要顯示標題 | 新增 `linkStatus()` 由 `is_active`+`expires_at` 推導 作用中/已過期/已封存；三態徽章+狀態點；每列顯示標題，缺標題以「未命名連結」fallback 呈現 | L736 `function linkStatus(url)`；L997 `未命名連結` fallback；徽章/點 CSS 於 badge/dot 區塊 |
| F5 | Important | Analytics 未指明所選短網址/標題；Stats 未呈現情境 `date_range` | Analytics 面板 `#analytics-subject` 顯示所選（top link）短代碼 + 標題；Stats `#stats-daterange` 顯示情境 `date_range` 起訖 | L531 `id="analytics-subject"`；L569 `id="stats-daterange"` |
| F6 | Important | manifest 宣稱未實作的「全域搜尋/跨資料集排序」、且高亮宣稱不精確 | 移除 2 項 C 級不實能力；改為 6 項誠實能力（3×A + 3×B），並修正高亮宣稱為「短代碼／原始網址／標題」實際命中 | `01-linear.manifest.json` capabilities（6 項，A≥1、B≥1，符合驗證器） |
| F7 | Important | 維度選擇器僅改 class，未實質改變 workbench | 選維度後設定 `analyticsDimension`，重繪排行 `#analytics-breakdown`、更新維度感知摘要，並以 `is-focus` 提升對應圖卡 | L549 `data-dim-card`；L725 `analyticsDimension`；L1099 `renderAnalyticsBreakdown(dim)`；L1217 選擇時更新維度；L1224 重繪排行 |
| F8 | Important | 登入未明確標示以 Microsoft 帳號登入 | 登入按鈕文案明確為「使用 Microsoft 帳號登入」，加四色 `.ms-glyph`，並保留 Entra ID SSO 說明 | L599 「使用 Microsoft 帳號登入」 |

### 實作摘要

- **過期判定的時鐘錨定**：`referenceNow() = Math.max(Date.now(), scenario.meta.generatedAt||0)`，確保 `edge-expired`（BASE−3d）在任何 runner 時鐘下都渲染為「已過期」，且 `large250` 之未來到期一律為「作用中」。
- **不破壞既有測試的關鍵點**：
  - `firstDashboardRowHasExactShortCode` 依賴 `.lk` 純葉節點文字 `aka.money/CODE` 與複製鈕 `data-code`；標題另置於獨立元素（`.c-code-main` 內），未污染 `.lk`。
  - `locateCreateField` 以 label `/原始網址/` 優先解析 URL 欄，故新增第二個 `input[type=url]`（預覽圖片）不致混淆；`type=file` 設 `hidden`，被 `firstUsableField` 視為不可見而略過。
  - 測試建立的短代碼為 `pw`+8 碼（10 字元），符合新的 3–20 + pattern 規則；建立成功偵測 `/成功|完成|已建立|created|success/` 命中 toast「已建立短網址」，而「建立中…」不命中（正確）。
  - 僅延遲 dashboard 清單渲染；charts/stats/analytics 維持同步，避免動搖 Chart.js 相關測試。閘門斷言（empty/no-results/error）皆為 7s 輪詢，延遲渲染安全。
- **靜態驗證器約束**：capabilities 僅 `{feature,class,note}`、≥6 項且 A/B 皆具；未引入禁用 API（FileReader 不在禁用清單）；新增按鈕/輸入不帶 `data-action`，不觸發 ALLOWED_ACTIONS 檢查；「Microsoft」不在 blind-mode 正規式內。

### 疑慮與備註（Concerns）

1. **過期狀態錨定 `generatedAt`**：為在固定情境資料與任意 runner 時鐘下皆穩定，過期判定取 `max(Date.now(), generatedAt)`。若未來情境資料改為「相對於真實當下」產生，需重新檢視此錨定。
2. **並行環境**：跑全套件時其他 proposal（並行 agent 新增）會出現失敗，屬各自範圍，非本次修改造成；本報告以聚焦 `01-linear` 證明本 proposal 20/20 全綠。預設埠 41739 曾被並行 webServer 佔用，故最終聚焦跑動改用 `VALIDATION_PORT=44311`。
3. **檔案上傳為前端預覽**：`image-file` 以 `FileReader` 產生 data URL 供即時縮圖；此為 mock，無實際後端上傳（符合設計稿範圍）。
4. **未提交**：依任務要求，本次所有變更皆未 `git commit`。

---

## 2026-08-24 23:21 (UTC+08:00) — 最終審查兩項 Important 修正

### 兩項發現

1. **⌘K 有宣傳卻無作用**：側邊欄「建立連結」與工具列「建立」按鈕皆標示 `⌘K`（`01-linear.html:436`、`:465`），但沒有對應的鍵盤處理器，按下 ⌘K/Ctrl+K 毫無反應。
2. **資料集載入狀態僅出現在 dashboard**：切換資料集時，只有 dashboard 的骨架列會顯示載入；停在 analytics／stats 檢視時完全沒有載入回饋。

### 範圍與限制

僅修改 `01-linear.html`（實作）與本報告（附加證據）。未更動 validator/shared/BRIEF/其他 proposal；未提交。因無法修改受保護的 `proposals.spec.mjs`，另以**獨立臨時斷言腳本**（`validation/_tmp-verify-01.mjs`，證據擷取後已刪除）對兩項新行為做 RED→GREEN 驗證，並以既有聚焦套件確認無回歸。所有瀏覽器跑動使用隔離的 `VALIDATION_PORT` 以避開並行 agent。

### 測試優先閘門（RED → GREEN）

**RED（修改前，臨時腳本針對兩項新行為）** — 靜態同時為 PASS：

```text
PASS 01-linear   /   1/1 proposal contracts passed
FAIL  F1 Ctrl+K opens create view
FAIL  F1 focus moves into create form
FAIL  F1 Esc restores focus to trigger
FAIL  F1 Meta+K opens create view
FAIL  F2 top-loading element exists
FAIL  F2 top-loading visible during analytics dataset switch
FAIL  F2 top-loading hides after settle
PASS  F2 dashboard skeleton/loading retained
FAIL  F2 race token: final dataset settled + indicator hidden  — hidden=false rows=15
SUMMARY: 1/9 checks passed
```

**GREEN（修改後，臨時腳本）**：

```text
PASS  F1 Ctrl+K opens create view
PASS  F1 focus moves into create form
PASS  F1 Esc restores focus to trigger
PASS  F1 Meta+K opens create view
PASS  F2 top-loading element exists
PASS  F2 top-loading visible during analytics dataset switch
PASS  F2 top-loading hides after settle
PASS  F2 dashboard skeleton/loading retained
PASS  F2 race token: final dataset settled + indicator hidden  — hidden=true rows=15
SUMMARY: 9/9 checks passed
```

**聚焦瀏覽器套件（`--grep '01-linear' --grep-invert '@screenshots'`，隔離埠）** — 初次實作導致 2 個既有測試回歸（見下方分析），修正後連續 3 次全綠：

```text
run #2 (port 44823, 修正順序後): 20 passed (23.3s)
run #3 (port 45210):            20 passed (19.6s)
run #4 (port 45390):            20 passed (24.4s)
```

run #2 的完整 ✓ 明細（desktop + mobile 各 10 案）：

```text
  ✓ applies every view and dataset combination without overflow (desktop 7.8s / mobile 8.0s)
  ✓ uses shared scenario values in every rendered Chart.js container (desktop / mobile)
  ✓ empties every chart container for zero analytics (desktop / mobile)
  ✓ keeps every chart fallback visible only when Chart.js request fails (desktop / mobile)
  ✓ changes every Chart.js theme color category for every real chart (desktop / mobile)
  ✓ renders the harness frame at the full Playwright viewport (desktop / mobile)
  ✓ emits READY exactly once from an iframe (desktop / mobile)
  ✓ emits STATE_CHANGED after parent messages and user changes (desktop / mobile)
  ✓ ignores malformed parent messages without errors (desktop / mobile)
  ✓ interaction contract: search, sort, copy, archive, create, theme (desktop / mobile)
  20 passed
```

**最終靜態驗證**：`PASS 01-linear` / `1/1 proposal contracts passed`。

### 逐項修正對照

| # | 發現 | 修正重點 | 證據（`01-linear.html`） |
|---|------|----------|--------------------------|
| 1 | ⌘K 無作用 | 新增全域 `keydown` 監聽 Meta+K／Ctrl+K（排除 Alt），`preventDefault()` 後以 `applyView('create', undefined, trigger)` 開啟命令面板；`trigger` 取當前 `activeElement`，若為 `body` 則退回工具列「建立」按鈕，交由既有 `applyView` 保存觸發者並於關閉時還原焦點（Esc／導覽皆可） | L1340–L1352 新監聽器；沿用 L786/L793/L796 的 `paletteTrigger` 焦點保存與還原 |
| 2 | 載入僅在 dashboard | 新增 `.content` 內 `position:absolute` 的**共用頂端載入條** `#top-loading`（`role="status"`，含視覺隱藏文字），任何檢視（dashboard／analytics／stats）切換資料集時皆顯示；`applyDataset` 於重建前同步 `showTopLoading()`+`showDashboardLoading()`，重建延後至 double-rAF（保證 ≥1 paint）並以 `datasetToken` 防競態，`finishDataset` 完成後 `hideTopLoading()` | L329–L339 CSS；L107 `.content position:relative`；L470–L473 HTML；L1185/L1192 `showTopLoading`/`hideTopLoading`；L1205–L1224 `applyDataset`＋`finishDataset` |

### 回歸分析與修正（Council + Rubber Duck）

- **現象**：首次實作把 `renderCharts()` 等重繪排在 `finishDataset` 內 `renderDashboard()` 之前，導致 2 個既有測試偶發失敗（`large250` 的 `assertLargeDatasetBrowsable` 對 dashboard 複製鈕做**一次性、未輪詢**計數得 0；互動測試主題色比對偶發 0 變化）。失敗在 desktop／mobile 之間不一致 → 屬**時序競態**而非邏輯錯誤。
- **根因**：基準線本就把 `renderDashboard` 延後（F3），但它是延後區塊中**唯一**工作、時序最短；我在其前面插入圖表重繪，推遲了複製鈕出現的時間點，於快跑的 mobile 上輸掉這場競態。
- **修正**：將 `finishDataset` 內順序改為 `renderDashboard()` **優先**，其餘 `renderStats/renderAnalytics/renderCharts` 隨後，最後 `hideTopLoading()`。dashboard 複製鈕出現時機因此回到基準線水準，同時仍保留 double-rAF 的「載入至少一個 paint」保證與 `datasetToken` 防競態。
- **驗證**：修正後聚焦套件連續 3 次 20/20 全綠，臨時腳本 9/9 全綠，靜態 PASS。

### 疑慮與備註（Concerns）

1. **`assertLargeDatasetBrowsable` 為一次性計數**：此測試對延後渲染本質敏感（基準線亦然）。本次已把 dashboard 重繪排在延後區塊最前，時序等同基準線；如日後此測試改為輪詢會更穩健，但屬受保護檔案，未更動。
2. **analytics／stats 為共用頂端指示**：採審查明列可接受的「shared top-level loading indicator」。頂端載入條為 `position:absolute`，不影響版面或水平溢位；停在非 dashboard 檢視切換資料集時提供可見載入回饋。
3. **臨時驗證腳本**：`validation/_tmp-verify-01.mjs` 僅為擷取 RED/GREEN 證據，未列入套件（`testMatch` 僅 `proposals.spec.mjs`），證據擷取後已刪除，未變更任何既有 validator 檔案。
4. **未提交**：依任務要求，本次所有變更皆未 `git commit`；`design-mockups/` 亦被 `.gitignore` 忽略。
