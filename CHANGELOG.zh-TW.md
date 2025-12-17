# 更新日誌

AkaMoney 專案的所有重要更改都將記錄在此文件中。

格式基於 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
本專案遵循 [語義化版本控制](https://semver.org/spec/v2.0.0.html)。

## [1.0.0] - 2024-12-17

### 新增功能
- 網址縮短服務初始實作
- 使用 Vue 3、Vite 和 TypeScript 的前端
- 使用 Hono 框架的 Cloudflare Workers 後端
- D1 資料庫整合與遷移系統
- API 端點的 JWT 身份驗證
- 管理儀表板的 Microsoft Entra ID 整合
- 網址管理儀表板，支援 CRUD 操作
- 完整的分析儀表板
  - 按日期追蹤點擊（最近 30 天）
  - 地理分布（國家、城市）
  - 設備類型分布（行動裝置、桌面、平板）
  - 瀏覽器統計
  - 作業系統檢測
  - 最近點擊記錄表
- 公開網址縮短介面
- 自訂短網址代碼支援（3-20 個英數字元 + 連字號/底線）
- 使用 nanoid 自動生成短網址代碼
- 網址驗證和重複防護
- 快速重定向功能（302 狀態）
- 響應式 Bootstrap 5 使用者介面
- Pinia 狀態管理
- 帶身份驗證守衛的 Vue Router
- R2 儲存配置
- DevContainer 支援，提供一致的開發環境
- 完整文件
  - README.md - 專案概述
  - SETUP.md - 設定與部署指南
  - API.md - 完整 API 文件
  - CONTRIBUTING.md - 貢獻指南
  - IMPLEMENTATION_SUMMARY.md - 實作細節
- 所有文件的繁體中文翻譯
- CHANGELOG.md 用於追蹤更改

### 安全性
- 使用 HS256 的 JWT 令牌生成和驗證
- 參數化資料庫查詢以防止 SQL 注入
- 所有端點的輸入驗證
- CORS 中介軟體配置
- 通過 Vue 自動轉義防止 XSS
- CodeQL 安全掃描通過，0 個漏洞

### 配置
- Node.js 24（LTS）要求
- 環境變數範本（.env.example）
- EditorConfig 和 Prettier 配置
- TypeScript 嚴格模式
- Cloudflare Workers 和 D1 的 Wrangler 配置

### 基礎設施
- 無伺服器 API 的 Cloudflare Workers
- 前端託管的 Cloudflare Pages
- 資料庫的 Cloudflare D1
- 儲存的 Cloudflare R2
- 全球邊緣網路部署

### 相依套件
- 前端：Vue 3.5.13、Vite 6.0.3、Bootstrap 5.3.3、Pinia 2.2.8、Vue Router 4.4.5
- 後端：Hono 4.6.14、nanoid 5.0.9
- 開發：TypeScript 5.7.2、Wrangler 3.94.0

### 修復
- 新增缺少的 bootstrap-icons 相依套件
- 修復 CORS 中介軟體以在 Cloudflare Workers 環境中正確運作
- 改進剪貼簿複製使用者體驗，提供視覺回饋
- 增強 wrangler.toml 中 database_id 配置的文件說明

## [未發布]

### 計劃功能
- 短網址的 QR 碼生成
- 密碼保護連結
- 連結過期通知
- 批量網址匯入功能
- 每個使用者的自訂域名
- 連結的 A/B 測試
- 連結排程
- 將分析匯出為 CSV/PDF
- 電子郵件通知
- API 速率限制
- 增強的快取策略
- 連接池優化
- 錯誤追蹤整合（Sentry）
- 監控儀表板
- 警報系統

---

有關每個版本的更多詳細資訊，請參閱[發布說明](https://github.com/lettucebo/AkaMoney/releases)。
