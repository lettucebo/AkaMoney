# Proposal 03 — Swiss 國際主義排版 · 修正報告

## 2026-08-24 23:36 (UTC+08:00) — 修正全部 7 項審查發現（4 Critical + 3 Important）

### 範圍與限制

僅修改下列檔案，未更動 validator / shared / BRIEF / 其他 proposal，且未提交（no commit）：

- `design-mockups/proposals/03-swiss.html`
- `design-mockups/proposals/proposal-03-report.md`（本檔，新建）

`03-swiss.manifest.json` 經逐項比對後**無需修改**：`direction` 仍為 `Swiss 國際主義排版`，
`dna` 六軸維持 `top-bar` / `compact-rows` / `inline-quick-create` / `comparative` /
`horizontal-scroll-table` / `edit`（BRIEF §14.3 03-swiss 列），tokens 與 capabilities 未受本次
修正影響（7 項發現皆位於 HTML 的表單標記、驗證邏輯、焦點管理與頁尾文案）。

視覺方向保留：所有新增欄位沿用既有 Swiss 語彙（`.qc-field` 模組格、1px 規線 `--rule-soft`、
無圓角、mono 大寫字距標籤、紅色必填星號 `--accent`），未引入陰影／漸層／圓角。

---

### 逐項修正對照

| # | 等級 | 發現 | 修正 | 證據（`03-swiss.html` 行號，修正後） |
|---|---|---|---|---|
| C1 | Critical | create 表單缺「描述」欄位 | `.qc-grid` 內新增 `qc-field--wide` 模組格，含 `<textarea id="create-desc" name="description">` 與說明；`submitCreate()` 將值寫入 record `description` | L1206–L1210（欄位）、L424–L428（`textarea.input--area` 樣式）、L2389 / L2453（讀值與寫入 record） |
| C2 | Critical | create 表單缺「預覽圖」欄位 | 新增 `<input id="create-image" type="url" name="imageUrl">`，送出時驗證為 http(s) 網址並寫入 `record.image_url` | L1211–L1215、L2390、L2426–L2431（驗證）、L2459（`if (imageUrl) record.image_url = imageUrl;`） |
| C3 | Critical | create 表單缺「到期時間」欄位 | 新增 `<input id="create-expire" type="datetime-local" name="expiresAt">`，說明「選填，留空＝永不過期」；送出時以 `new Date(...).getTime()` 轉 Unix 毫秒寫入 `record.expires_at`，留空則不設此欄位 | L1216–L1220、L2391、L2433–L2443（解析與錯誤處理）、L2460（`if (expiresAt !== null) record.expires_at = expiresAt;`） |
| C4 | Critical | 短代碼應為必填卻是選填、且會自動產生 | `#create-code` 加 `required`，label 加紅色必填星號，placeholder 由「留白則自動產生」改為 `quarterly-report`；**刪除** `CODE_ALPHABET` / `randomCode()` 與 `code \|\| randomCode()` 分支，改為空值直接擋下並回報「請輸入短代碼（必填）。」 | L1196–L1200（標記）、L2408–L2413（必填檢查）、L2445（`var finalCode = code;`）；`randomCode` / `CODE_ALPHABET` 全檔已無出現 |
| I5 | Important | 短代碼長度上限 24 與 BRIEF §3 C1 的 20 不符 | `pattern` 改為 `[A-Za-z0-9_-]{3,20}`、提示文字改「必填，3–20 字元…」、JS 正規式同步改 `{3,20}`、錯誤訊息改「短代碼需為 3–20 個英數字、底線或連字號。」 | L1198（pattern）、L1199（提示）、L2414、L2416 |
| I6 | Important | Esc 關閉 create 未還原焦點至觸發元素 | 新增模組變數 `createTrigger`；`setView('create')` 在切換前記錄 `document.activeElement`；新增 `restoreCreateTriggerFocus()`（檢查 `document.contains` / `disabled` / 是否位於 `[hidden]` 子樹後才 `.focus()`）；Esc 與「取消／導覽離開 create」路徑皆呼叫還原 | L1620（宣告）、L2211–L2214（記錄觸發者）、L2250–L2257（還原函式）、L2596–L2600（Esc）、L2540–L2542（取消／view-switch 離開 create） |
| I7 | Important | 頁尾在可見 UI 洩漏設計方向名稱 | `<footer>` 品牌文字由「AKA.MONEY — 瑞士國際主義排版方案」改為通用的「AKA.MONEY 短網址控制台」；`<title>` 以外之可見文字已無方向字樣 | L1538 |

---

### 版面配置說明

`.qc-grid` 為 12 欄模組網格。修正後欄位配置維持整齊的兩列模組：

- 第 1 列：原始網址（span 6）＋ 短代碼（span 3）＋ 標題（span 3）
- 第 2 列：描述（span 6）＋ 預覽圖（span 3）＋ 到期時間（span 3）
- 第 3 列：動作列（span 12）

`@media (max-width: 1120px)` 既有規則 `.qc-field, .qc-field--wide { grid-column: span 12; }`
（L1062 附近）自動讓六欄在行動尺寸堆疊，無需新增斷點。

---

### 驗證證據

#### 1. 單檔靜態驗證

```text
> cd design-mockups/validation
> node static-validator.mjs ../proposals/03-swiss.html

PASS 03-swiss
1/1 proposal contracts passed
```

#### 2. 聚焦瀏覽器契約套件（desktop + mobile 兩個 project）

```text
> npx playwright test proposals.spec.mjs --grep "03-swiss" --grep-invert "@screenshots" --reporter=list

Running 20 tests using 2 workers
  ✓   2 [mobile]  › 03-swiss proposal contract › applies every view and dataset combination without overflow (7.6s)
  ✓   1 [desktop] › 03-swiss proposal contract › applies every view and dataset combination without overflow (7.8s)
  ✓   3 [mobile]  › 03-swiss proposal contract › uses shared scenario values in every rendered Chart.js container (1.4s)
  ✓   4 [desktop] › 03-swiss proposal contract › uses shared scenario values in every rendered Chart.js container (1.4s)
  ✓   5 [mobile]  › 03-swiss proposal contract › empties every chart container for zero analytics (1.3s)
  ✓   6 [desktop] › 03-swiss proposal contract › empties every chart container for zero analytics (1.3s)
  ✓   7 [mobile]  › 03-swiss proposal contract › keeps every chart fallback visible only when Chart.js request fails (1.1s)
  ✓   8 [desktop] › 03-swiss proposal contract › keeps every chart fallback visible only when Chart.js request fails (1.1s)
  ✓   9 [mobile]  › 03-swiss proposal contract › changes every Chart.js theme color category for every real chart (1.5s)
  ✓  10 [desktop] › 03-swiss proposal contract › changes every Chart.js theme color category for every real chart (1.5s)
  ✓  11 [mobile]  › 03-swiss proposal contract › renders the harness frame at the full Playwright viewport (707ms)
  ✓  12 [desktop] › 03-swiss proposal contract › renders the harness frame at the full Playwright viewport (789ms)
  ✓  13 [mobile]  › 03-swiss proposal contract › emits READY exactly once from an iframe (850ms)
  ✓  14 [desktop] › 03-swiss proposal contract › emits READY exactly once from an iframe (826ms)
  ✓  15 [mobile]  › 03-swiss proposal contract › emits STATE_CHANGED after parent messages and user changes (1.3s)
  ✓  16 [desktop] › 03-swiss proposal contract › emits STATE_CHANGED after parent messages and user changes (1.3s)
  ✓  17 [mobile]  › 03-swiss proposal contract › ignores malformed parent messages without errors (1.8s)
  ✓  18 [desktop] › 03-swiss proposal contract › ignores malformed parent messages without errors (1.7s)
  ✓  20 [desktop] › 03-swiss interaction contract › performs search, sort, copy, archive, create, and theme interactions (4.0s)
  ✓  19 [mobile]  › 03-swiss interaction contract › performs search, sort, copy, archive, create, and theme interactions (4.1s)

  20 passed (25.1s)
```

（互動契約測試涵蓋建立流程：測試填入的短代碼長度符合新的 3–20 規則，移除自動產生後仍全綠。）

#### 3. 針對 7 項發現的專屬瀏覽器驗證

以 `validation/_tmp-verify-03.mjs`（暫存腳本，取證後已刪除；suite 的 `testMatch` 僅
`proposals.spec.mjs`，不受影響）在 Chromium 實跑，輸出逐字如下：

```text
PASS  C1 #create-desc textarea exists in create view  — {"tag":"textarea","type":"","visible":true,"label":"描述","inCreate":true}
PASS  C1 #create-image url field exists  — {"tag":"input","type":"url","visible":true,"label":"預覽圖","inCreate":true}
PASS  C1 #create-expire datetime-local field exists  — {"tag":"input","type":"datetime-local","visible":true,"label":"到期時間","inCreate":true}
PASS  C4 #create-code has required attribute  — {"required":true,"pattern":"[A-Za-z0-9_-]{3,20}","placeholder":"quarterly-report"}
PASS  I5 #create-code pattern is {3,20}  — [A-Za-z0-9_-]{3,20}
PASS  I5 hint text says 3–20  — ["必填，須為完整的 http(s) 網址。","必填，3–20 字元，英數、底線或連字號。","選填，僅供列表顯示。","選填，作為內部備註使用。","選填，填入預覽圖網址。","選填，留空＝永不過期。"]
PASS  C4 blank short code is rejected (stays on create, error shown)  — {"view":"create","errVisible":true,"errText":"請輸入短代碼（必填）。","focused":"create-code"}
PASS  I5 21-char short code rejected  — {"view":"create","text":"短代碼需為 3–20 個英數字、底線或連字號。"}
PASS  C1 created link appears first in dashboard list  — aka.money/repair-03-swiss 新建維修驗證連結https://example.com/no-code02026-08-24作用中複製封存
PASS  C1 success feedback toast shown  — 已建立 aka.money/repair-03-swiss，成功加入清單最上方。
PASS  C1 rows increased  — before=12
PASS  I6 focus moves into create form on open
PASS  I6 Esc restores focus to trigger  — {"matches":true,"active":"BUTTON.btn btn--accent btn--sm"}
PASS  I7 no direction name in visible body text  — {"title":"AKA.MONEY — 瑞士國際主義網格控制台","hits":[],"footer":"AKA.MONEY 短網址控制台 資料集：預設 布景：淺色"}
PASS  R4 no horizontal overflow @1440x900 on create  — {"sw":1440,"iw":1440}
PASS  R4 no horizontal overflow @390x844 on create  — {"sw":390,"iw":390}
PASS  no console/page errors

SUMMARY: 17/17 checks passed
```

其中：

- `I7` 檢查 `document.body.innerText` 是否包含「瑞士 / Swiss / 國際主義」→ `hits: []`（僅
  `<title>` 保留方向名稱，符合 BRIEF §17.1 規則 10）。
- `R4` 於 1440×900 與 390×844 兩個基準尺寸、`create` 畫面下確認
  `scrollWidth <= innerWidth + 1`，證明新增兩列欄位未造成水平溢位（BRIEF §4）。
- 全程無 console error 或 pageerror。

---

### 疑慮與備註（Concerns）

1. **到期時間輸入型別**：採 `datetime-local`（BRIEF §3 C1 允許「到期時間（選填）」；審查建議
   `datetime-local` 或 `date`）。轉換為 Unix 毫秒時使用瀏覽器本地時區解讀，與情境資料的
   `expires_at`（Unix 毫秒）語意一致。
2. **預覽圖採網址欄而非上傳區**：BRIEF §3 C1 明訂「可為上傳區或網址欄」，選網址欄以維持
   Swiss 方向的極簡格線版面，且避免引入 `FileReader` 之外的額外互動面。
3. **焦點還原的保護條件**：`restoreCreateTriggerFocus()` 會在觸發元素已被移除、被 disabled
   或落入 `[hidden]` 子樹時放棄還原，避免 `.focus()` 打到不可見節點；此時焦點維持在
   dashboard，可正常續按 Tab。
4. **manifest 未變更**：本次 7 項發現皆不涉及 manifest 欄位，維持原值以確保
   `static-validator.mjs` 的 BRIEF 指派比對（provider/model/direction/stack/dna）持續通過。
5. **未提交**：依任務要求，所有變更皆未 `git commit`。
