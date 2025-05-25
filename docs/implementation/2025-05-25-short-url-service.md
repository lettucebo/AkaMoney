# AkaMoney 短網址服務實作計畫

## 概述
AkaMoney 是一個短網址服務，允許使用者建立短網址重定向到目標網址，並且追蹤點擊次數與來源。系統分為前端網站、後端 API 和轉址服務三個主要元件。

## 系統架構

### 前端
- Vue 3.x SPA
- Vue Router
- Bootstrap 5
- FontAwesome
- Azure Static Web Apps 託管
- Azure Entra ID 整合

### 後端 API
- Azure Functions (C#)
- Azure Table Storage
- Swagger UI / OpenAPI
- 分為 AkaMoney.Functions 和 AkaMoney.Services 兩個專案

### 轉址服務
- 獨立的 Azure Function (C#)
- 轉址邏輯與點擊追蹤

## 實作步驟

### 1. 建置基本專案結構
- [x] 建立資料夾結構 (src, infra, docs)
- [ ] 建立後端解決方案與專案
- [ ] 建立前端專案
- [ ] 建立 ADR 文件

### 2. 後端 API 實作
- [ ] 設定 Azure Table Storage 資料模型
- [ ] 實作短網址 CRUD 服務
- [ ] 實作 API 端點
- [ ] 整合 Swagger UI
- [ ] 實作 Azure Entra ID 身份驗證

### 3. 轉址服務實作
- [ ] 建立獨立的 Azure Function 專案
- [ ] 實作轉址邏輯
- [ ] 實作點擊追蹤功能
- [ ] 設定默認重定向

### 4. 前端實作
- [ ] 設定 Vue 專案
- [ ] 實作使用者介面
- [ ] 整合 API 服務
- [ ] 實作 Azure Entra ID 登入流程
- [ ] 加入 Bootstrap 5 與 FontAwesome

### 5. Azure Bicep 部署
- [ ] 建立 Azure Function App 部署腳本
- [ ] 建立 Azure Static Web Apps 部署腳本
- [ ] 建立 Azure Table Storage 部署腳本
- [ ] 設定自訂網域

### 6. 文件與拉取請求
- [ ] 更新 README.md
- [ ] 建立使用者文檔
- [ ] 提交拉取請求

## 技術堆疊與版本

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

## 資料模型

### ShortUrl 實體
- PartitionKey: "ShortUrl"
- RowKey: {短網址代碼}
- TargetUrl: 目標網址
- Title: 社交媒體標題 (選填)
- Description: 社交媒體描述 (選填)
- ImageUrl: 社交媒體圖片 (選填)
- CreatedAt: 建立時間
- ExpirationDate: 到期日 (選填)
- IsArchived: 是否封存
- ClickCount: 點擊次數

### ClickInfo 實體
- PartitionKey: {短網址代碼}
- RowKey: {時間戳}-{隨機字串}
- UserAgent: 使用者代理
- Referrer: 引用來源
- IPAddress: IP 位址
- Timestamp: 點擊時間
