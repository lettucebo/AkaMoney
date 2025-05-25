# 2025-05-25-一鍵啟動腳本實作

## 摘要
本文件記錄了 AkaMoney 專案一鍵啟動腳本的實作方式。此腳本可以同時啟動所有必要的服務，包括 Azurite 儲存模擬器、Azure Functions 和前端應用程式，以便開發人員能夠快速啟動整個系統進行開發和測試。

## 動機
在進行開發時，需要啟動多個服務才能完整運行 AkaMoney 系統，包括：
- Azurite 儲存模擬器 (用於本地 Azure Storage 模擬)
- AkaMoney.Functions (主要 API 服務)
- AkaMoney.Redirect (用於短網址重定向的服務)
- 前端應用程式 (Vue.js)

手動啟動這些服務既耗時又容易出錯，特別是對於新加入團隊的開發人員。一鍵啟動腳本可以簡化這個過程，提高開發效率。

## 實作細節

### 腳本位置
腳本位於專案根目錄：`start-akamoney.ps1`

### 功能特點
1. **自動檢查必要工具**：確認是否已安裝 Azurite 和 Azure Functions Core Tools
2. **檢查端口衝突**：檢查所需端口是否已被佔用
3. **並行啟動服務**：
   - Azurite 儲存模擬器 (端口 10000, 10001, 10002)
   - AkaMoney.Functions (端口 7071)
   - AkaMoney.Redirect (端口 7072)
   - 前端應用程式 (端口 8080)
4. **彩色輸出**：使用不同顏色進行狀態輸出，提高可讀性
5. **錯誤處理**：捕獲並顯示啟動過程中的錯誤

### 使用的端口
- Azurite Blob: 10000
- Azurite Queue: 10001
- Azurite Table: 10002
- AkaMoney.Functions: 7071
- AkaMoney.Redirect: 7072
- 前端應用程式: 8080

### 腳本執行方式
從 PowerShell 終端機執行：
```powershell
.\start-akamoney.ps1
```

## 考慮因素

### 優點
1. **簡化開發流程**：一個命令即可啟動所有服務
2. **一致性**：確保所有開發人員使用相同的設置
3. **可視性**：清晰顯示所有服務的狀態和端口
4. **可擴展性**：易於添加新服務或修改現有設置

### 限制
1. **必須手動關閉**：目前需要手動關閉啟動的視窗
2. **僅支援 Windows PowerShell**：目前主要針對 Windows 開發環境
3. **沒有健康檢查**：不會驗證服務是否成功啟動

## 未來改進
1. 添加對 Linux/macOS 的支援
2. 實現優雅的關閉機制
3. 添加服務健康檢查
4. 添加服務日誌集中顯示功能
5. 考慮使用 Docker Compose 作為替代方案

## 相關文件
- [Azure Functions Core Tools 文檔](https://docs.microsoft.com/zh-tw/azure/azure-functions/functions-run-local)
- [Azurite 儲存模擬器文檔](https://docs.microsoft.com/zh-tw/azure/storage/common/storage-use-azurite)
- [Vue CLI 服務文檔](https://cli.vuejs.org/guide/cli-service.html)
