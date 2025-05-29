# Static Web App 區域最佳化實作計畫

日期：2025-05-29  
作者：GitHub Copilot

## 概述

將 Azure Static Web App 部署在接近 East Asia 的區域，使用免費方案以優化亞洲地區使用者的存取速度。

## 背景

AkaMoney 的前端使用 Azure Static Web App 進行託管。由於主要使用者位於亞洲地區，將服務部署在接近這些使用者的區域可以提供更佳的效能。根據需求，我們選擇繼續使用免費方案 (Free tier) 並明確指定區域為 East Asia。

## 技術細節

Azure Static Web App 區域的選擇應考慮以下因素：

1. 使用 East Asia 區域（位於香港），這是最接近台灣和亞洲大部分地區的 Azure 區域之一
2. 使用 Free SKU 保持成本效益
3. 確保在 Bicep 檔案中明確指定 location 參數

## 實作步驟

1. 修改 `infra/modules/static-web-app.bicep` 檔案：
   - 將默認 location 參數值設為 'eastasia'
   - 將 SKU 設定為 Free
   - 更新相關註解以反映這些變更

2. 測試修改後的 Bicep 檔案

## 影響評估

- 成本影響：使用免費方案可以控制營運成本
- 效能影響：亞洲地區使用者將體驗到更快的頁面載入速度，因為服務部署在地理位置較近的區域
- 維運影響：單一區域的部署維運較為簡單

## 參考資料

- [Azure 區域](https://azure.microsoft.com/zh-tw/explore/global-infrastructure/geographies/)
- [Azure Static Web Apps 定價](https://azure.microsoft.com/zh-tw/pricing/details/app-service/static/)
- [Static Web Apps 支援的區域](https://learn.microsoft.com/zh-tw/azure/static-web-apps/overview#supported-regions)
