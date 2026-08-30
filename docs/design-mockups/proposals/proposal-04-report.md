# 提案 04-bento 修復報告

- 提案：`04-bento`（方向：**Bento Grid（Apple 式）**；Stack：**Tailwind v4**）
- 修復檔案：`docs/design-mockups/proposals/04-bento.html`
- 未修改：`docs/design-mockups/proposals/04-bento.manifest.json`（理由見下方「疑慮與備註」第 1 點）
- 日期：2026-08-24

## 1. 範圍與限制

- 僅修改 `04-bento.html`；`04-bento.manifest.json` 內容不變（`direction`、`stack`、`dna` 皆為 BRIEF §13／§14.3 凍結欄位）。
- 指派方向 **Bento Grid（Apple 式）** 與 DNA `可收合側欄；Bento 磚牆；右側 drawer；即時監控；逐層 drill-down；監控` 全數保留（見 §4 驗證證據末段 DNA 檢查）。
- 未進行任何 git commit；當時（本目錄尚位於根目錄 `design-mockups/`，遷移至 `docs/design-mockups/` 之前）`design-mockups/` 於本 repo 為 gitignore 範圍，`git status --porcelain` 未出現本次任何檔案。此為歷史狀態描述——現行 repo 中 `docs/design-mockups/` 已納入版控，並非目前的 gitignore 規則。

## 2. 逐項修正對照

| # | 審查意見 | 修正內容 | 檔案位置 | 證據 |
| --- | --- | --- | --- | --- |
| 1 | [§8 Focus] create 右側 drawer 無 focus trap，`applyView('create')` 移除 host view 的 `inert`，Tab 可逸失到側欄與磚牆 | `applyView()` 於 create 啟用時對 `.shell`（含側欄 + 全部磚塊）與 `#undo-toast` 加上 `inert`，離開時移除；並在全域 `keydown` 內以 `drawerFocusables()` 實作 Tab／Shift+Tab 循環，於首尾元素回捲 | `04-bento.html`：`applyView()`／`drawerFocusables()`／`FOCUSABLE`（≈L700–L760）、`keydown` 處理（≈L1230 起） | 驗證輸出 `F1 背景 .shell 被設為 inert`、`F1 連續 14 次 Tab 焦點皆留在 drawer 內`、`F1 連續 6 次 Shift+Tab…`、`F1 背景 body 不可被點擊聚焦（inert 生效）` |
| 2 | [§8 Focus] Esc／取消／✕ 關閉 drawer 後未還原焦點，無 `createTrigger` | 新增 `createTrigger` 變數：`applyView('create')` 前擷取 `document.activeElement`（或事件觸發元素），`restoreCreateTrigger()` 在離開 create 時 `trigger.focus()`；三條關閉路徑（Esc、`data-view-target="dashboard"` 的取消鈕與 ✕）共用同一條 `applyView('dashboard')` 出口 | `04-bento.html`：`createTrigger` 宣告、`restoreCreateTrigger()`、`applyView()`（≈L700–L760） | `F2 Esc 後焦點還原到觸發元素`、`F2 取消鈕關閉後焦點還原到側欄觸發項`、`F2 關閉 ✕ 後焦點還原到觸發元素` |
| 3 | [C6 Loading] `applyDataset()` 同步渲染、無短暫 loading | `applyDataset()` 先同步渲染（避免與大量資料瀏覽斷言競爭），隨即在 `#dashboard-state` 塞入 `loadingSkeleton()`（`data-state="loading"` + `.skeleton`），並對 `#url-list` 加上 `data-loading="true"` 淡化，140ms 後 `setTimeout` 清除並重繪；重入時先 `clearTimeout` | `04-bento.html`：`loadingSkeleton()`（≈L1089）、`applyDataset()`（≈L1094–L1122）、`.links-grid[data-loading="true"]` CSS | `F3 切換資料集時出現 data-state="loading" 骨架`、`F3 切換至 empty 資料集同樣出現 loading`、`F3 loading 結束後骨架已移除`、`F3 large250 資料集列表仍同步可見（不影響瀏覽斷言） — 24 rows` |
| 4 | [C6/§12.1] 表單送出骨架與重試骨架未帶 `data-state="loading"` | 建立表單送出的 `#create-feedback` 骨架與 `#retry-button` 重試骨架均改為 `<div class="state" data-state="loading" role="status" aria-live="polite">…<div class="skeleton">` 包裹容器 | `04-bento.html`：重試路徑（≈L1170）、建立送出（≈L1324） | `F4 重試路徑容器帶 data-state="loading"`、`F4 重試 loading 容器內含 .skeleton 骨架`、`F4 建立表單送出時容器帶 data-state="loading"`、`F4 建立表單 loading 容器內含 .skeleton 骨架` |
| 5 | [Stack/Manifest] manifest 宣告 Tailwind v4 但實作 0 個 Tailwind class，CDN 形同虛設 | 新增 `<style type="text/tailwindcss">` 的 `@theme`（`--font-sans`／`--font-mono`／`--breakpoint-bento: 1100px`／`--breakpoint-brick: 720px`），並把磚牆 span、表單欄位、drawer 頁首/頁尾、分頁列、登入／404 置中卡片、等寬字改寫為真正的 Tailwind utility（`col-span-*`、`max-bento:` / `max-brick:` 變體、`grid gap-1.5`、`flex items-center border-b border-solid`、`font-mono`…），並刪除對應的手寫 CSS 規則（`.t3`–`.t12`、`.field`、`.pagination`、`.drawer-head/foot`、`.sheet-actions`、`.center-card`） | `04-bento.html`：`@theme` 區塊（≈L17–L29）、被刪除規則位置留有註解、磚塊標記（≈L340–L620） | `F5 磚牆 tile 使用 Tailwind col-span-* utility — 22 tiles`、`F5 col-span-3 由 Tailwind 產生實際 grid-column — grid-column=span 3 / span 3`、`F5 900px…span 6`、`F5 390px…span 12`、`F5 font-mono utility 生效`、`F5 drawer 標題列 border-b utility 生效 — border-bottom-width=1px`、`F5 已無殘留 .t3/.t12 手寫 span class` |

## 3. 靜態驗證（單檔）

```
> node static-validator.mjs ../proposals/04-bento.html
PASS 04-bento
1/1 proposal contracts passed
```

## 4. 瀏覽器驗證

### 4.1 既有合約測試（Playwright，desktop 1440×900 + mobile 390×844）

```
> npx playwright test proposals.spec.mjs --grep "04-bento" --grep-invert "@screenshots" --reporter=list

Running 20 tests using 2 workers

  ✓   1 [desktop] › proposals.spec.mjs:668:5 › 04-bento proposal contract › applies every view and dataset combination without overflow (11.8s)
  ✓   2 [mobile] › proposals.spec.mjs:668:5 › 04-bento proposal contract › applies every view and dataset combination without overflow (12.0s)
  ✓   3 [desktop] › proposals.spec.mjs:689:5 › 04-bento proposal contract › uses shared scenario values in every rendered Chart.js container (2.6s)
  ✓   4 [mobile] › proposals.spec.mjs:689:5 › 04-bento proposal contract › uses shared scenario values in every rendered Chart.js container (2.6s)
  ✓   5 [desktop] › proposals.spec.mjs:701:5 › 04-bento proposal contract › empties every chart container for zero analytics (2.4s)
  ✓   6 [mobile] › proposals.spec.mjs:701:5 › 04-bento proposal contract › empties every chart container for zero analytics (2.4s)
  ✓   7 [desktop] › proposals.spec.mjs:712:5 › 04-bento proposal contract › keeps every chart fallback visible only when Chart.js request fails (1.8s)
  ✓   8 [mobile] › proposals.spec.mjs:712:5 › 04-bento proposal contract › keeps every chart fallback visible only when Chart.js request fails (2.1s)
  ✓   9 [desktop] › proposals.spec.mjs:724:5 › 04-bento proposal contract › changes every Chart.js theme color category for every real chart (3.6s)
  ✓  10 [mobile] › proposals.spec.mjs:724:5 › 04-bento proposal contract › changes every Chart.js theme color category for every real chart (3.6s)
  ✓  11 [desktop] › proposals.spec.mjs:740:5 › 04-bento proposal contract › renders the harness frame at the full Playwright viewport (1.7s)
  ✓  12 [mobile] › proposals.spec.mjs:740:5 › 04-bento proposal contract › renders the harness frame at the full Playwright viewport (1.4s)
  ✓  13 [desktop] › proposals.spec.mjs:757:5 › 04-bento proposal contract › emits READY exactly once from an iframe (1.8s)
  ✓  14 [mobile] › proposals.spec.mjs:757:5 › 04-bento proposal contract › emits READY exactly once from an iframe (1.6s)
  ✓  15 [desktop] › proposals.spec.mjs:770:5 › 04-bento proposal contract › emits STATE_CHANGED after parent messages and user changes (3.2s)
  ✓  16 [mobile] › proposals.spec.mjs:770:5 › 04-bento proposal contract › emits STATE_CHANGED after parent messages and user changes (3.1s)
  ✓  17 [desktop] › proposals.spec.mjs:793:5 › 04-bento proposal contract › ignores malformed parent messages without errors (2.4s)
  ✓  18 [mobile] › proposals.spec.mjs:793:5 › 04-bento proposal contract › ignores malformed parent messages without errors (2.9s)
  ✓  19 [desktop] › proposals.spec.mjs:946:5 › 04-bento interaction contract › performs search, sort, copy, archive, create, and theme interactions (6.5s)
  ✓  20 [mobile] › proposals.spec.mjs:946:5 › 04-bento interaction contract › performs search, sort, copy, archive, create, and theme interactions (6.1s)

  20 passed (42.8s)
```

### 4.2 針對本次五項意見的專用瀏覽器驗證

以 `node server.mjs --port 41755` 提供靜態服務，Chromium 實機操作（開啟／Tab 循環／Esc／取消／✕／SET_DATASET／重試／表單送出），逐項斷言：

```
PASS  F5 Tailwind CDN 已載入 @tailwindcss/browser@4
PASS  F5 存在 <style type="text/tailwindcss"> @theme 區塊
PASS  F5 磚牆 tile 使用 Tailwind col-span-* utility  — 22 tiles
PASS  F5 col-span-3 由 Tailwind 產生實際 grid-column  — grid-column=span 3 / span 3
PASS  F5 font-mono utility 生效（@theme --font-mono）  — "JetBrains Mono", "Noto Sans TC", ui-mon
PASS  F5 drawer 標題列 border-b utility 生效  — border-bottom-width=1px
PASS  F5 已無殘留 .t3/.t12 手寫 span class
PASS  F5 頁面載入無 console error（未使用 @import）  — []
PASS  F5 1440px 下 max-bento/max-brick variant 正確  — grid-column=span 3 / span 3
PASS  F5 900px 下 max-bento/max-brick variant 正確  — grid-column=span 6 / span 6
PASS  F5 390px 下 max-bento/max-brick variant 正確  — grid-column=span 12 / span 12
PASS  F2 開啟前焦點在觸發元素
PASS  F1/F2 drawer 已開啟
PASS  F1 背景 .shell 被設為 inert
PASS  F1 側欄 nav 項目位於 inert 子樹內
PASS  F1 儀表板磚塊位於 inert 子樹內
PASS  F1 連續 14 次 Tab 焦點皆留在 drawer 內  — input → input → textarea → input → input → input → input → input → input → input → input → button → button → button
PASS  F1 連續 6 次 Shift+Tab 焦點皆留在 drawer 內
PASS  F1 背景 body 不可被點擊聚焦（inert 生效）
PASS  F2 Esc 關閉 drawer
PASS  F2 Esc 後 .shell 的 inert 已移除
PASS  F2 Esc 後焦點還原到觸發元素
PASS  F2 取消鈕關閉後焦點還原到側欄觸發項
PASS  F2 關閉 ✕ 後焦點還原到觸發元素
PASS  F3 切換資料集時出現 data-state="loading" 骨架
PASS  F3 loading 結束後骨架已移除
PASS  F3 large250 資料集列表仍同步可見（不影響瀏覽斷言）  — 24 rows
PASS  F3 切換至 empty 資料集同樣出現 loading
PASS  F3 empty 資料集最終顯示 data-state="empty"
PASS  F4 apiError 資料集顯示 data-state="error"
PASS  F4 重試路徑容器帶 data-state="loading"
PASS  F4 重試 loading 容器內含 .skeleton 骨架
PASS  F4 建立表單送出時容器帶 data-state="loading"
PASS  F4 建立表單 loading 容器內含 .skeleton 骨架
PASS  F4 建立成功後 loading 已結束
PASS  DNA collapsible-sidebar 仍存在
PASS  DNA bento-tiles 仍存在
PASS  DNA right-drawer 仍為右側抽屜
PASS  DNA live-monitor 即時監控磚仍存在
PASS  無新增 console error  — []

SUMMARY: 40/40 checks passed
```

### 4.3 視覺回歸抽查

於 1440×900／390×844 兩尺寸擷取 dashboard（light/dark）、create（drawer 開啟）、login、stats（dark）共 10 張截圖人工檢視：磚牆比例、drawer 版面、表單標籤間距、登入置中卡片與行動版單欄堆疊皆與改寫前一致，未見版面破損。

## 5. Rubber Duck 內容完整性修復（BRIEF §2，2026-08-25）

- **審查發現**：`analytics`（成效分析）畫面在一般 `SET_VIEW` 路徑下只呈現每日趨勢／活動高峰／國家／裝置／瀏覽器分佈，**未**明確揭示「這是哪一支短網址」與「該對象的總點擊數」，與 BRIEF §2 對 `analytics` 的要求（單一短網址的成效：**總點擊**、每日趨勢、國家／裝置／瀏覽器分佈）有落差。`stats` 畫面原本已具備總點擊、作用中／全部連結數、Top Links、日期區間、趨勢／國家／裝置，未受影響。
- **修正內容**：在 `analytics` 畫面頂端新增一枚 `col-span-12` 的 `accent` 磚 `[分析對象]`，內含：
  - `#analytics-subject-code`：以 `aka.money/<short_code>` 呈現分析對象識別碼，取自 `scenario.overallStats.top_links[0]`（無資料時 fallback 至 `urls[0]`）。
  - `#analytics-subject-meta`：呈現「〈標題〉· 總點擊 N 次」，其中總點擊取自 `scenario.analytics.totalClicks`（與既有趨勢／分佈圖的基準數值一致，避免數字互相矛盾）。
  - 對應邏輯寫在 `renderPanels()`（既有的、於 `SET_VIEW`／初始化／資料集切換時皆會呼叫的渲染函式），不新增額外呼叫時機，因此在一般 `SET_VIEW` 路徑即會生效。
  - 保留原有「監控區間」「活動高峰」「觀察重點」與既有 `stats` 畫面內容不變；DNA（`collapsible-sidebar` / `bento-tiles` / `right-drawer` / `live-monitor` / `progressive-drilldown` / `monitor`）與 manifest 皆未更動。

### 5.1 靜態驗證

```
> node static-validator.mjs ../proposals/04-bento.html
PASS 04-bento
1/1 proposal contracts passed
```

### 5.2 完整目標瀏覽器驗證（含既有合約 + 互動 + 截圖，共 22 項）

```
> npx playwright test proposals.spec.mjs --grep "04-bento" --reporter=list
Running 22 tests using 2 workers
  ... (20 項既有合約／互動測試，詳見上方 §4.1／§4.2)
  ✓ [desktop] › proposals.spec.mjs:1040:3 › @screenshots 04-bento
  ✓ [mobile]  › proposals.spec.mjs:1040:3 › @screenshots 04-bento
22 passed (55.6s)
```

### 5.3 可見文字檢查（實機載入，`SET_DATASET` + `SET_VIEW` 正常路徑）

以 `node server.mjs --port 45001` 起靜態伺服，Chromium 載入 `04-bento.html`、透過標準 `postMessage` 協定切換 `default` 與 `zeroAnalytics` 情境後取 `[data-view="analytics"]` 之 `innerText`：

```
===== 04-bento | dataset=default | view=analytics =====
分析對象
aka.money/spring24
春季會員招募主頁 · 總點擊 1,219 次
每日點擊趨勢
監控區間 2026-07-26 ～ 2026-08-24
...

===== 04-bento | dataset=zeroAnalytics | view=analytics =====
分析對象
aka.money/zero001
尚未曝光的募資頁 · 總點擊 0 次
每日點擊趨勢
尚無監控區間
尚無可視化資料
...
```

`stats` 畫面（總點擊／作用中/全部/Top Links/日期區間/趨勢/國家/裝置）維持既有內容，逐一情境確認皆為情境資料驅動，未受本次變更影響。

### 5.4 結論

- 靜態驗證：1/1 通過。
- 完整目標瀏覽器驗證：22/22 通過（含既有合約、互動、截圖）。
- 可見文字檢查：`analytics` 已明確顯示分析對象短碼與總點擊；`stats` 原有內容不變、仍完整。
- DNA、雙布景、響應式、父子協定、建立列釘選行為：均未變動，且測試結果證實無回歸。

## 6. 疑慮與備註

1. **manifest 的 `stack` 維持 `Tailwind v4`**：`validation/static-validator.mjs` 依 BRIEF §13／§14.3 硬編碼每個提案的 provider／model／direction／stack／dna，改成「手寫 CSS」會直接讓靜態驗證失敗。因此本次採用審查意見給的第一個選項——讓 Tailwind 真正承擔版面職責（`@theme` token + utility class），而非改動 manifest。
2. **`@tailwindcss/browser@4` 的 `@import` 陷阱**：在 `<style type="text/tailwindcss">` 內寫任何 `@import`（含 `@import "tailwindcss"`）都會讓瀏覽器以頁面相對路徑去抓 `/proposals/tailwindcss` 而產生 404 console error，導致 `expect(errors).toEqual([])` 失敗。實測確認：只寫 `@theme { … }` 時，執行階段仍會注入預設的 `@import "tailwindcss"`（utilities／preflight／theme 全數產生），且完全沒有額外網路請求。故最終採用「只有 `@theme`」的寫法。
3. **層疊順序**：Tailwind 產生的規則位於 `@layer theme/base/utilities`，本檔案未分層的手寫 `<style>` 一律勝出。因此改寫時必須同步刪除對應手寫規則，utility 才會生效；`input.input` 的 `font: inherit` 亦屬未分層規則，故短代碼輸入框維持 sans-serif（此為改動前既有行為，非本次回歸）。
4. **loading 視窗 140ms**：`proposals.spec.mjs` 的大量資料瀏覽斷言以「非輪詢」方式讀取 `[data-action="copy"]:visible` 數量，因此 `applyDataset()` 保持先同步渲染列表，僅狀態列短暫顯示 loading 骨架，避免把整段渲染延後而與斷言競速。
5. **`data-state="success"`**：建立成功回饋沿用 `data-state="success"`（BRIEF §12.1 僅列 `loading|empty|error|no-results`）。此非本次審查意見，且互動測試以「成功」文字比對，故未更動。
