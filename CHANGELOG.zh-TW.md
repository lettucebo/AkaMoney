# 變更日誌

[English](CHANGELOG.md) | 繁體中文

AkaMoney 專案的所有重要變更都將記錄在此檔案中。

格式基於 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
此專案遵循 [語義化版本](https://semver.org/spec/v2.0.0.html)。

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
- 錯誤追蹤整合（Sentry）
- 監控儀表板
- 警報系統

---

更多每個版本的詳細資訊，請參閱[發布說明](https://github.com/lettucebo/AkaMoney/releases)。
