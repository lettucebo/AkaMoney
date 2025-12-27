# 專案結構

本文件說明 AkaMoney 專案目錄的組織方式。

## 根目錄組織

根目錄僅包含開源專案標準的必要檔案：

### 文件檔案（根目錄層級）
這些檔案遵循開源標準慣例保留在根目錄：

- `README.md` / `README.zh-TW.md` - 專案概覽和快速入門指南
- `CHANGELOG.md` / `CHANGELOG.zh-TW.md` - 版本歷史和發布說明
- `CONTRIBUTING.md` - 貢獻指南
- `LICENSE` - 專案授權

### 配置檔案（根目錄層級）
這些檔案必須保留在根目錄，因為它們配置整個專案：

- `.editorconfig` - 編輯器設定，確保一致的編碼風格
- `.prettierrc` - 程式碼格式化規則
- `.node-version` / `.nvmrc` - Node.js 版本規範
- `.gitignore` - Git 忽略模式
- `package.json` / `package-lock.json` - Monorepo/工作區協調器

## 原始碼組織

### `/src` 目錄
包含所有應用程式原始碼，按服務組織：

- `backend/` - 管理 API 服務（Cloudflare Worker）
- `frontend/` - 管理儀表板（Vue 3 應用程式）
- `redirect/` - 公開 URL 重定向服務（Cloudflare Worker）
- `shared/` - 共享類型和工具

### `/docs` 目錄
包含所有詳細的技術文件：

- `API.md` / `API.zh-TW.md` - API 文件
- `SETUP.md` / `SETUP.zh-TW.md` - 設定和部署指南
- `SCREENSHOTS.md` / `SCREENSHOTS.zh-TW.md` - 應用程式截圖
- `THEME.md` / `THEME.zh-TW.md` - 主題客製化指南
- `IMPLEMENTATION_SUMMARY.md` - 實作細節
- `IMPLEMENTATION_SSO_USER.md` - SSO 使用者實作細節

## 組織原則

1. **保持根目錄整潔**：只在根目錄放置必要的專案檔案
2. **關注點分離**：文件放在 `/docs`，原始碼放在 `/src`
3. **遵循慣例**：標準檔案（README、LICENSE 等）保留在根目錄
4. **配置在根目錄**：專案級配置檔案必須在根目錄才能正常運作
5. **詳細文件在 /docs**：技術文件和實作細節放在 `/docs`

## 為什麼採用這種結構？

- **業界標準**：遵循常見的 Node.js/TypeScript 專案慣例
- **工具相容性**：根目錄的配置檔案可與編輯器和工具配合使用
- **清晰分離**：容易區分原始碼、文件和配置
- **可維護性**：新貢獻者可以快速理解專案佈局
