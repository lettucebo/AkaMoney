# 變更日誌

[English](CHANGELOG.md) | 繁體中文

AkaMoney 專案的所有重要變更都將記錄在此檔案中。

格式基於 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
此專案遵循 [語義化版本](https://semver.org/spec/v2.0.0.html)。

## [1.5.0] - 2026-09-03

### 新增
- 在 Vue 前端、管理 API Worker 與重新導向 Worker 全面整合 Sentry Issues、Logs、分散式追蹤，以及僅於錯誤發生時啟用的前端 Replay。
- 啟用 Cloudflare Workers Logs、Worker 版本中繼資料與 source map 上傳，以取得可讀的正式環境堆疊追蹤。
- 為 `https://aka.money/health` 新增每分鐘執行的 uptime monitor，並設定首次停機與恢復後再次停機的電子郵件通知。
- 新增受保護的 CI source map 流程，避免不具權限的 build 工作取得 Sentry 上傳權杖，並在 Pages 部署前移除所有 `.map` 檔案。
- 新增中英雙語的監控、設定、部署與疑難排解文件。

### 變更
- 管理 API 的 5xx 回應改為通用錯誤封包，不再回傳原始例外細節或堆疊追蹤；適用的 4xx 回應仍可保留安全的驗證資訊。
- 發布流程改為在部署前將兩個 Worker 設定的 `ENVIRONMENT` 設為 `"production"`，正式環境遙測不再被回報為 `development`。
- 前端建置改為只有在具備 `GITHUB_ACTIONS` 或 `SENTRY_AUTH_TOKEN` 時才產生 hidden source maps，手動建置與部署不可能再發布 source maps。
- `VITE_SENTRY_REPLAY_ENABLED` 判斷改為先去除前後空白並轉小寫，因此 `false`、`False` 與含空白的寫法都會停用 error Replay。
- 全存放庫改用 npm workspaces：依賴改為從存放庫根目錄安裝並共用單一 `package-lock.json`，各應用程式的指令則透過 `-w akamoney-<frontend|backend|redirect>` 執行。
- 將封存的 UI 提案比較資料移至 `docs/design-mockups`，讓存放庫根目錄只保留使用中的專案目錄。

### 安全性
- 移除正式環境發布流程的 pull-request-target 觸發與對應的發布標籤，未合併的 Pull Request 程式碼不再能於持有 Cloudflare、Azure、Entra 或 Sentry 憑證的工作中執行（#140）。
- 新增不持有任何憑證的 `prepare-release` 工作，只從 `main` 的政策檢出進行驗證：精確的 SemVer tag 或已確認的手動觸發都必須解析為 `origin/main` 的祖先 commit，而後續工作只會檢出、建置並回報這個不可變的 SHA。
- 每個部署工作在安裝依賴與任何使用 secret 的步驟之前，都會重新確認該 commit 仍位於主線，避免等待審核期間部署已離開主線的 commit。
- 正式環境發布改以不會取消進行中部署的 `release-production` concurrency 群組序列化，並據實記錄仍存在的發布信任限制：審核者可自我核准、管理員可略過 environment 保護、對歷史 commit 打 tag 仍會執行該 commit 當時的工作流程、同存放庫寫入者仍受信任，且 `CLOUDFLARE_API_TOKEN`／`AZURE_STORAGE_SAS_TOKEN` 仍屬 repository 範圍，只有 `SENTRY_AUTH_TOKEN` 是 environment secret。
- 前端遙測不再帶出客戶目的地網址：URL store 的 console error 只記錄 error name、code 與 HTTP status，且連結列表、成效分析與熱門連結統計中呈現或以屬性帶出 `original_url` 的元素都以 `data-sentry-block` 排除於 Session Replay 之外。
- 管理 API 的 Sentry events 除 `Cookie` 標頭外，也一併移除已解析的 request cookies，與重新導向 Worker 一致。
- 移除管理 API 權杖驗證成功日誌中的原始 Entra object id/subject。

## [1.3.0] - 2026-08-27

### 新增
- 在儀表板頁首與空白狀態新增按需建立短網址入口
- 新增以 Enter 或 Space 鍵開啟預覽圖片選擇器的鍵盤操作
- 新增涵蓋文件查詢、commit、發布、worktree、Cloudflare 與 Wrangler、Issue 管理及瀏覽器測試的 GitHub Copilot 技能

### 變更
- 將常駐的短網址建立面板改為置中彈窗，讓連結清單與篩選功能能立即顯示
- 在彈窗流程中保留網址驗證、選填資訊、圖片上傳、到期時間、清單與 KPI 更新，以及過期回應防護

### 文件
- 更新英文與繁體中文的實作、視覺參考、專案結構及主題文件，以符合按需建立流程
- 記錄已上線儀表板刻意改用彈窗，而非歷史設計中的 `inline-quick-create` 軸

## [1.2.0] - 2026-08-26

### 新增
- 以 Monē 介面系統重新設計管理後台
  - 以 Tailwind CSS v4 與 CSS-first 設計 token 取代 Bootstrap
  - 新增響應式應用程式殼層、側邊欄、頂欄、KPI 摘要、內嵌 URL 工作流程、可重用 UI 基礎元件與亮／暗主題
  - 新增具主題感知能力的 Chart.js 分析元件與 composable
- 新增 URL 格式化、趨勢、短連結與轉址驗證工具，並補齊測試覆蓋
- 新增涵蓋架構、驗證、設定、資料庫、部署、開發、儲存、測試、疑難排解與文件索引的中英雙語專案文件
- 新增 GitHub Copilot 儲存庫指引
- 封存 UI 設計提案比較成果，包含十四個互動式提案、截圖、manifest 與比較資料

### 修正
- 透過 single-flight 初始化與移除重複初始化呼叫端，修正認證啟動競態問題
- 透過正規化路徑並拒絕外部與 protocol-relative 轉址目標，強化登入轉址驗證
- 修正並行載入與變更期間的 URL 清單一致性，包含刪除最後一頁唯一項目後正確回復頁面的行為

### 變更
- 在前後端型別中記錄既有的局部 URL 更新契約：明確傳入 `null` 會清空 nullable 欄位，省略欄位則維持原值
- 更新各應用程式相依套件，包括 Hono、Wrangler、Axios、Happy DOM 與 Vitest
- 更新 CI，要求 Node.js 24 以符合儲存庫的 engine 規範
- 設定發布 workflow 從 repository variables 提供 `VITE_API_URL`

### 文件
- 更新英文與繁體中文 README 及貢獻指引，以符合 Tailwind 介面與 Microsoft Entra 驗證流程
- 修正部署 tag 範例，使其符合儲存庫不使用 `v` 前綴的慣例

## [1.1.6] - 2026-01-03

### 修正
- 修正 STORAGE_PROVIDER 環境變數大小寫敏感問題
  - 儲存提供者名稱（r2、azure）現在不區分大小寫
  - 使用者可以設定 STORAGE_PROVIDER 為 "r2"、"R2"、"azure"、"Azure" 或 "AZURE"
  - 在 `getStorageConfig()`、`createStorageProvider()` 和 `isStorageConfigured()` 函數中標準化提供者名稱
  - 新增 12 個全面的測試案例以測試大小寫不敏感行為
  - 避免因大小寫不符而導致的「儲存未配置」錯誤

## [1.1.5] - 2025-12-26

### 修正
- 修正 Cloudflare D1 GraphQL Analytics API 篩選器參數
  - 將 `datetime_geq` 改為 `date_geq` 以符合 Cloudflare API 規範
  - 將 `datetime_leq` 改為 `date_lt` 以符合 Cloudflare API 規範
  - 修正日期格式從 ISO 8601 改為 YYYY-MM-DD（Cloudflare API 要求）
  - 解決因參數名稱錯誤導致的 GraphQL 查詢失敗

### 新增
- D1 Analytics 日期範圍選擇功能
  - 新增互動式日期範圍選擇器，使用 HTML5 日期輸入框
  - 新增「套用日期範圍」按鈕以查詢自訂期間資料
  - 新增「重設為本月」按鈕以回到預設檢視
  - API 現在接受選用的 `startDate` 和 `endDate` 查詢參數（YYYY-MM-DD 格式）
  - 預設日期範圍為本月而非單日
  - 回應包含 `dateRange` 欄位，顯示起始和結束日期
  - 前端驗證確保開始日期 ≤ 結束日期後才發送 API 請求
  - 載入期間禁用日期輸入框以防止競態條件

### 改進
- 增強 D1 Analytics 資料精確度
  - 將回應欄位從 `daily` 改為 `total` 以反映期間資料
  - 修正使用率計算方式，現在會計算所選日期範圍內的平均每日使用量
  - 修正備用估算功能，現在會尊重日期範圍而非僅估算今日
  - 將 `actualDailyReads/Writes` 重新命名為 `actualTotalReads/Writes` 以更清楚
- 改善 D1 Analytics UI 清晰度
  - 更新標題以分別顯示「總讀取/寫入次數」和「每日限制」
  - 移除對日期範圍無意義的「剩餘」計算
  - 在資訊區段新增日期範圍顯示
  - 新增資訊提示，說明儲存空間使用量為累計值，不受日期範圍影響
  - 修正 TypeError: Cannot read properties of undefined (reading 'toLocaleString')
- 增強輸入驗證
  - 驗證 `startDate` 和 `endDate` 必須同時提供
  - 驗證日期格式，無效格式時回傳 400 錯誤
  - 驗證 `startDate` 必須早於或等於 `endDate`
  - 消除 API 和服務層之間的日期計算重複

## [1.1.3] - 2025-12-25

### 修正
- 修正點擊記錄問題，在轉址服務的 INSERT 語句中加入遺漏的 short_code 欄位
  - 在轉址服務型別中為 `ClickRecord` 介面加入 `short_code` 欄位
  - 更新 INSERT 語句以包含 `short_code` 欄位
  - 防止 NOT NULL 約束違規
  - 確保 Dashboard 和 Analytics 的點擊統計正確更新

## [1.1.2] - 2025-12-24

### 修正
- 修正 MSAL redirect 回調處理與狀態同步問題
  - 在 initialize() 中正確處理 redirect promise 回應
  - 在 redirect 回調後設定 active account
  - 成功 redirect 後儲存 access token 到 localStorage
  - 為 MSAL 初始化加入完整的錯誤處理
  - 啟用 `storeAuthStateInCookie` 以防止狀態同步問題
- 修正搜尋結果為 0 或資料不足時仍顯示分頁按鈕
  - 根據實際資料筆數計算總頁數
  - 資料為 0 筆時隱藏分頁
  - 資料少於一頁時隱藏分頁
  - 防止導向超出範圍的頁碼
  - 搜尋條件改變時重置為第 1 頁
  - 限制顯示的頁碼數量以改善使用體驗

### 改進
- 更好的驗證流程，使用 redirect 登入方式
- 增強分頁使用體驗，正確計算頁數
- 透過 cookie 儲存狀態減少瀏覽器擴充套件干擾

## [1.1.1] - 2025-12-24

### 修正
- 修正登入時無窮迴圈的問題，改用重新導向驗證流程取代彈出視窗
  - 從 `loginPopup()` 改為 `loginRedirect()` 以避免彈出視窗內的路由衝突
  - 移除 LoginView 元件中的手動導向邏輯（由 router guard 處理）
  - 避免彈出視窗被瀏覽器封鎖的問題
  - 提供更好的使用者體驗，使用整頁重新導向流程
  - 符合 Microsoft 驗證的最佳實踐建議

## [1.1.0] - 2025-12-24

### 新增
- 儀表板中短網址的複製按鈕及視覺回饋
  - 一鍵複製到剪貼簿功能
  - 複製時以打勾圖示視覺確認
  - 支援螢幕閱讀器的無障礙功能
- 儀表板 URL 列表的搜尋功能
  - 可依短碼、URL 或標題搜尋
  - 即時篩選 URL 列表
  - 清除按鈕可重設搜尋
  - 顯示結果計數和分頁提示
- 增強的無障礙改進
  - 互動元素的 ARIA 標籤
  - 複製動作的螢幕閱讀器通知
  - 鍵盤友善導航

### 改進
- 儀表板 UI 增強以提升使用者體驗
- 更好的使用者操作視覺回饋

## [1.0.0] - 2025-12-21

### 新增
- 實作 URL 短網址服務的初始版本
- Vue 3 前端搭配 Vite 和 TypeScript
- Cloudflare Workers 後端搭配 Hono 框架
- D1 資料庫整合與遷移系統
- API 端點的 JWT 驗證
- Microsoft Entra ID 整合供儀表板登入
- URL 管理儀表板與 CRUD 操作
- 完整的分析儀表板
  - 按日期追蹤點擊（最近 30 天）
  - 地理分布（國家、城市）
  - 裝置類型分析（手機、桌機、平板）
  - 瀏覽器統計
  - 作業系統偵測
  - 最近點擊記錄表
- 公開 URL 短網址介面
- 自訂短碼支援（3-20 個英數字元加上連字號/底線）
- 使用 nanoid 自動產生短碼
- URL 驗證和重複防止
- 快速重新導向功能（302 狀態）
- 響應式 Bootstrap 5 UI
- Pinia 狀態管理
- Vue Router 搭配驗證守衛
- R2 儲存配置
- DevContainer 支援以確保一致的開發環境
- 完整文件
  - README.md - 專案概覽
  - SETUP.md - 設定與部署指南
  - API.md - 完整 API 文件
  - CONTRIBUTING.md - 貢獻指南
  - IMPLEMENTATION_SUMMARY.md - 實作細節
- 所有文件的繁體中文翻譯
- CHANGELOG.md 用於追蹤變更

### 安全性
- 使用 HS256 的 JWT token 產生與驗證
- 參數化資料庫查詢以防止 SQL 注入
- 所有端點的輸入驗證
- CORS 中介軟體配置
- 透過 Vue 自動轉義防止 XSS
- CodeQL 安全掃描通過，0 個漏洞

### 配置
- Node.js 24 (LTS) 需求
- 環境變數模板（.env.example）
- EditorConfig 和 Prettier 配置
- TypeScript 嚴格模式
- Cloudflare Workers 和 D1 的 Wrangler 配置

### 基礎設施
- Cloudflare Workers 用於無伺服器 API
- Cloudflare Pages 用於前端託管
- Cloudflare D1 用於資料庫
- Cloudflare R2 用於儲存
- 全球邊緣網路部署

### 依賴項目
- 前端：Vue 3.5.13、Vite 6.0.3、Bootstrap 5.3.3、Pinia 2.2.8、Vue Router 4.4.5
- 後端：Hono 4.6.14、nanoid 5.0.9
- 開發：TypeScript 5.7.2、Wrangler 3.94.0

### 修正
- 新增缺少的 bootstrap-icons 依賴
- 修正 CORS 中介軟體以在 Cloudflare Workers 環境中正常運作 (#24)
- 改善剪貼簿複製 UX 的視覺回饋
- 增強 wrangler.toml 文件中 database_id 配置的說明
- 修正當 Entra ID client_id 未配置時的 AADSTS900144 錯誤 (#21)
- 修正前端建置環境變數注入 (#23)
- 修正驗證流程以請求後端授權的自訂 API 範圍 (#28)

### 變更
- 整理根目錄檔案，將大部分檔案移至 docs 資料夾 (#3)
- 將所有原始碼移至 src 資料夾 (#7)
- 將 URL 重新導向服務和管理 API 拆分為獨立的 Cloudflare Workers (#18)
- 以 Microsoft Entra ID token 驗證取代自訂 JWT 驗證 (#27)
- 重構儀表板為首頁，並提供統一的 URL 建立介面 (#34)
- 將非敏感配置從 Secrets 遷移至 Variables 於發布工作流程中 (#35)
- 標準化 worker secret 配置以使用 here-string 語法 (#20)
- 接受 v1.0 和 v2.0 Microsoft Entra ID token 格式 (#29)

### 改進
- 新增測試覆蓋率（80%+）和 GitHub Actions CI (#5)
- 新增 CD 工作流程以自動部署至 Cloudflare (#9)
- 實作 secret 驅動的 CD 部署以防止 wrangler.toml 中的敏感資訊洩漏 (#11)
- CD 工作流程自動建立 Cloudflare 資源（如果不存在）(#12)
- 要求所有管理頁面進行驗證 (#16)
- 新增 CD 工作流程步驟以透過 wrangler 配置 Worker secrets (#19)
- 將 Cloudflare Pages 來源加入 CORS 允許清單 (#24)
- 新增深色模式與主題切換功能 (#26)
- 新增詳細的錯誤回應和日誌記錄至驗證中介軟體 (#32)
- 新增全面的錯誤處理與詳細診斷至 API 路由 (#33)

## [未發布]

### 計畫功能
- 為短網址產生 QR code
- 密碼保護連結
- 連結過期通知
- 批次匯入 URL 功能
- 每個使用者的自訂網域
- 連結的 A/B 測試
- 連結排程
- 將分析匯出為 CSV/PDF
- 電子郵件通知
- API 速率限制
- 增強快取策略
- 連線池最佳化
- 監控儀表板

---

更多每個版本的詳細資訊，請參閱[發布說明](https://github.com/lettucebo/AkaMoney/releases)。
