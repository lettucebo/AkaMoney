# Proposal 11 Bootstrap Repair Evidence

## Round 2 — Rubber Duck I2／I6（2026-08-25）

範圍：14 份 `*.manifest.json` 的 `capabilities`，以及 `11-bootstrap.html`／本報告。未改其他提案 HTML、BRIEF、shared、validation。

| 編號 | 問題 | 處置 |
|---|---|---|
| **I2** | 14/14 對 `large250` 搜 `p0245` 都能命中，屬全域搜尋／跨頁排序，卻多數標成 B「當前頁」 | 全部改標 **C**，繁中註記需後端 `q`／`sort`；沒有真正的當前頁過濾，故不保留假 B |
| **I6** | `11-bootstrap` 在 390×844 一次渲 250 列、約 3509 節點、scrollHeight ≈ 53633px | 每頁 25 列（20–60）＋可見上一頁／下一頁，符合 large250 browse 契約 |

**不保留假 B：** 14 份 HTML 都是對 `scenario.urls` 全量 filter／sort 再切片。BRIEF §9 規定全域搜尋／跨頁排序為 C。

**保留為 B：** 關鍵字高亮、狀態徽章、建立／封存／複製、前端比較分析等現有欄位推導，且與搜尋分開表述。

### 11-bootstrap 分頁

- `state.pageSize = 25`；搜尋／排序／資料集／建立時重設 `pageIndex`。
- 搜尋與排序仍作用於全情境；新建短網址仍置頂並落在第 1 頁。
- 可見控制：`data-page="prev|next"`、「上一頁／下一頁」，末頁 `disabled`。
- 手機與桌面共用分頁，不再一次渲 250 張 card。

### Manifest 變更

| 提案 | 變更 | A/B/C |
|---|---|---|
| 01-linear | 「當前頁搜尋與排序」B → 全域 C | 3/2/1 |
| 02-editorial | 刪兩項假 B；保留既有 C；補狀態／高亮 B | 5/2/2 |
| 03-swiss | 刪兩項假 B；保留既有 C 與狀態籤／比較 B | 4/2/3 |
| 04-bento | 刪兩項假 B；保留既有 C；補狀態徽章 B | 4/1/3 |
| 05-vercel | 假 B → C；補狀態／高亮 B | 5/2/1 |
| 06-brutalist | 兩項假 B → 一項 C；補狀態／建立封存 B | 5/2/1 |
| 07-material | 「當前頁排序」B → 跨頁排序 C；保留高亮 B | 4/1/2 |
| 08-glass | 兩項假 B → 一項 C；補狀態徽章 B | 4/1/1 |
| 09-terminal | 「當前頁搜尋排序」B → C | 3/2/2 |
| 10-stripe | 「當前頁搜尋排序」B → C | 3/3/2 |
| 11-bootstrap | 「當前頁搜尋排序」B → C | 3/2/1 |
| 12-playful | 假 B → C | 3/2/1 |
| m1-mone-faithful | 假 B → C | 5/2/1 |
| m2-mone-dense | 假 B → C；補高亮 B | 5/2/1 |

C 註記要旨：示範對 large250 全資料集搜尋／排序；正式環境需列表 API 新增 q 與 sort，現況僅支援 page／limit。

Schema：每份 ≥6 項、恰含 `feature`／`class`／`note`、至少 1A+1B。無 `estimatedMigration`。

---

## Round 1 — 既有修復

Fixes applied:
- Preserve the newest-created short URL as the first visible dashboard row even while click-count sorting is active.
- Rebind Chart.js tooltip/series/grid/axis colors to the active theme tokens so light ↔ dark mode changes are reflected in real rendered output.
- Keep the custom Bootstrap 5.3 direction intact without modifying validation/BRIEF/shared/other proposal files.

## Static validation（全量，含 14 提案）
Command:
`cd design-mockups\validation; node static-validator.mjs`

Output:
```text
PASS valid
PASS 01-linear
PASS 02-editorial
PASS 03-swiss
PASS 04-bento
PASS 05-vercel
PASS 06-brutalist
PASS 07-material
PASS 08-glass
PASS 09-terminal
PASS 10-stripe
PASS 11-bootstrap
PASS 12-playful
PASS m1-mone-faithful
PASS m2-mone-dense
15/15 proposal contracts passed
```

## Targeted browser validation
Command:
`cd design-mockups\validation; $env:PROPOSAL_ID='11-bootstrap'; $env:VALIDATION_PORT='44011'; npx playwright test proposals.spec.mjs --grep "11-bootstrap proposal contract" --reporter=line`

Output:
```text
Running 18 tests using 2 workers
  18 passed (42.8s)
```

（18 項 desktop+mobile proposal contract 全過，含 large250 browse gate。）

## Mobile／Desktop large250 DOM 實測（390×844 與 1440×900）

| 指標 | I6 原文（修前） | 修後 mobile | 修後 desktop |
|---|---|---|---|
| 同時列數 | 250 | **25** | **25** |
| DOM 節點 | 3,509 | **592** | **592** |
| scrollHeight | 53,633px | **6,303px** | **2,074px** |
| 分頁 | 無 | 第 1／10 頁，下一頁可見可點 | 同左 |

行為抽樣：
- 下一頁後列數仍 25，頁碼 2。
- 搜尋 `p0245`（第 245 筆）回傳 1 列 `p0245` → 全情境搜尋仍在（故標 C）。
- 建立 `pinchk` 後第一列即為該短代碼；切換排序後仍置頂。

## Council & Rubber Duck（本輪）

**方案選擇：** 分頁（25 列 + 上一頁／下一頁）優於虛擬捲動。理由：驗證器已認 `data-page="next"`／「下一頁」；不必引入 scroll 哨兵；與其他 11 案 20–25 列慣例一致。Load-more 也能過關，但「上一頁」對掃讀 250 筆更可用。

**Rubber Duck：**
1. 有沒有提案其實只搜當前頁、被我誤標 C？沒有。14 份都是 `urls.filter` 全量再 `slice`。
2. 有沒有留下「當前頁搜尋／排序」假 B？掃描 14 份 manifest，false_b = []。
3. Schema 會不會因為刪 B 而不合格？每份仍 ≥6 且含 A+B；static 15/15。
4. 分頁會不會弄丟建立置頂／全量搜尋？實測 pinchk 置頂、p0245 可跨頁命中。
5. 手機是否仍一次渲 250 列？否，25 列／592 節點。

**Council：** 範圍未越權（只動 14 份 manifest + 11 HTML + 本報告）。C 註記使用繁中並寫明需 `q`／`sort`。可行性評分不再建立在假 B 對等上。

Summary:
- Static: 15/15 passed
- Browser: 18/18 passed
- Mobile large250: 25 rows / 592 nodes / 6303px
- Result: I2／I6 已修正並通過驗證。
