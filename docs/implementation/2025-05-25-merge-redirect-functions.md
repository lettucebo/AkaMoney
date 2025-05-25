# 將 AkaMoney.Redirect 合併到 AkaMoney.Functions

日期：2025-05-25

## 概述

這個實作計畫旨在將 `AkaMoney.Redirect` 專案合併到 `AkaMoney.Functions` 專案中，以簡化整個系統的架構並減少維護負擔。

## 背景

目前，我們的系統中有兩個獨立的 Azure Functions 專案：

1. `AkaMoney.Functions` - 包含短網址建立和管理的 API
2. `AkaMoney.Redirect` - 處理短網址的重新導向功能

這兩個專案功能相關，且共享相同的服務，因此合併它們可以簡化部署和管理流程。

## 實作步驟

1. **複製 RedirectFunction**
   - 將 `RedirectFunction.cs` 從 `AkaMoney.Redirect` 專案複製到 `AkaMoney.Functions` 的 `Functions` 資料夾
   - 更新命名空間從 `AkaMoney.Redirect.Functions` 到 `AkaMoney.Functions.Functions`

2. **解決依賴關係**
   - 確保 `AkaMoney.Functions` 專案已經包含所有 `AkaMoney.Redirect` 專案中使用的依賴 (已確認)

3. **更新路由和設定**
   - 確保不會與現有函式發生路由衝突
   - 保留相同的路由模式，以維持現有的 URL 結構

4. **測試**
   - 確保重新導向功能在合併後正常運作
   - 確保現有的短網址 API 功能不受影響

5. **移除舊專案**
   - 在確認新合併的功能正常運作後，從解決方案中移除 `AkaMoney.Redirect` 專案

## 預期結果

- 單一的 `AkaMoney.Functions` 專案將同時處理短網址的建立和重新導向功能
- 簡化部署流程，只需部署一個 Functions 應用程式
- 減少維護負擔
