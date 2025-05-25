# AkaMoney 🔗

AkaMoney 是一個高效能的短網址服務，提供使用者友好的介面來建立、管理和追蹤短網址。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

![AkaMoney Logo](docs/images/logo.png)

## ✨ 功能

- 🚀 快速將長網址轉換為短網址
- 📊 追蹤點擊次數和來源
- 🔒 安全的管理後台（需要 Azure Entra ID 登入）
- 📅 支援短網址過期設定
- 🖼️ 支援社交媒體分享的標題、描述和圖片
- 🔍 自動管理短網址的大小寫問題

## 🏗️ 系統架構

AkaMoney 採用三元件架構:

1. **轉址服務** - 基於 Azure Functions 的獨立微服務，處理短網址轉址請求
2. **管理 API** - 基於 Azure Functions 的後端 API，處理短網址的管理功能
3. **管理前端** - 基於 Vue 3 的單頁應用程式，作為管理介面

![Architecture Diagram](docs/images/architecture.png)

## 🚀 快速開始

### 環境需求

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js](https://nodejs.org/) (>= 16.x)
- [Vue CLI](https://cli.vuejs.org/)
- [Azure Functions Core Tools](https://docs.microsoft.com/azure/azure-functions/functions-run-local)
- [Azure 訂閱](https://azure.microsoft.com/free/)

### 本地開發設定

#### 後端 API

1. 複製儲存庫
```bash
git clone https://github.com/lettucebo/AkaMoney.git
cd AkaMoney
```

2. 在 Azure Storage Emulator 或 Azure Storage Account 中建立 Table Storage
   - 表格名稱: `shorturls` 和 `clickinfo`

3. 設定 `local.settings.json` (在 `src/AkaMoney.Functions` 和 `src/AkaMoney.Redirect`)
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",
    "TableStorageConnection": "UseDevelopmentStorage=true",
    "DefaultRedirectUrl": "https://www.example.com",
    "AzureAd:Instance": "https://login.microsoftonline.com/",
    "AzureAd:TenantId": "your-tenant-id",
    "AzureAd:ClientId": "your-client-id"
  }
}
```

4. 啟動 API 專案
```bash
cd src/AkaMoney.Functions
func start
```

5. 在另一個終端機窗口中，啟動轉址服務
```bash
cd src/AkaMoney.Redirect
func start
```

#### 前端

1. 設定環境變數 (`.env.local` 在 `src/akamoney-frontend`)
```
VUE_APP_API_URL=http://localhost:7071/api
VUE_APP_REDIRECT_URL=http://localhost:7072
VUE_APP_AUTH_CLIENT_ID=your-client-id
VUE_APP_AUTH_AUTHORITY=https://login.microsoftonline.com/your-tenant-id
```

2. 安裝相依套件並啟動開發伺服器
```bash
cd src/akamoney-frontend
npm install
npm run serve
```

3. 前端將在 http://localhost:8080 運行

## 🚢 部署到 Azure

請參考 [部署文件](docs/deployment.md) 了解如何使用 Azure Bicep 部署到 Azure。

## 📦 使用的套件

### 後端
- .NET 8.0
- Azure Functions v4
- Azure.Data.Tables 12.8.3
- Microsoft.Azure.Functions.Extensions 1.1.0
- Microsoft.Azure.WebJobs.Extensions.OpenApi 1.5.1
- Microsoft.Extensions.DependencyInjection 8.0.0
- Microsoft.Identity.Web 2.15.3

### 前端
- Vue 3.3.x
- Vue Router 4.2.x
- Bootstrap 5.3.x
- Axios 1.6.x
- @azure/msal-browser 3.6.0
- Font Awesome 6.5.0

## 🤝 貢獻

歡迎提交 Issue 和 Pull Requests！

## 📄 授權

本專案採用 MIT 授權條款 - 查看 [LICENSE](LICENSE) 文件了解更多細節。

## 📮 聯絡

有任何問題？請開立 [Issue](https://github.com/lettucebo/AkaMoney/issues)。
