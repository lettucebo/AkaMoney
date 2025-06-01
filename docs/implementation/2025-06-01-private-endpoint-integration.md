// filepath: c:\Users\tzyu\Source\Repos\AkaMoney\docs\implementation\2025-06-01-private-endpoint-integration.md
# Private Endpoint Integration Implementation Plan

## Overview
本文件描述了將 AkaMoney 的 Azure Functions 和 Storage 透過 Private Endpoint 連接起來的實作計畫。此設計可以提高系統安全性，限制存取到儲存體僅能透過私人網路存取。

## 需要實作的基礎設施
1. **虛擬網路 (AkaMoney-vnet)**
   - 包含三個子網路：
     - default: 預設子網路
     - function-subnet: 給 Function App 使用的子網路，具有適當的委派
     - pe-subnet: 給私人端點使用的子網路

2. **儲存體私人端點**
   - Blob Storage 私人端點：連接 Blob 儲存體服務
   - Table Storage 私人端點：連接 Table 儲存體服務
   - 私人 DNS 區域，以便正確解析私人端點：
     - privatelink.blob.core.windows.net
     - privatelink.table.core.windows.net

3. **Function App 虛擬網路整合**
   - Function App 與 function-subnet 子網路整合
   - 啟用 vnetRouteAllEnabled 以確保所有流量通過虛擬網路

## 實作詳情
### 新增的 Bicep 模組
- **virtual-network.bicep**: 建立並配置虛擬網路和子網路
- **private-endpoint.bicep**: 建立私人端點和私人 DNS 區域整合

### 更新的模組
- **storage-account.bicep**: 新增對私人端點的支援
  - 可設定 publicNetworkAccess 為 'Disabled'
  - 設定網路 ACL 預設動作
  
- **function-app.bicep**: 新增虛擬網路整合
  - enableVnetIntegration 參數
  - subnetId 參數
  - virtualNetworkSubnetId 屬性
  - vnetRouteAllEnabled 屬性

### main.bicep 變更
- 新增 enablePrivateNetworking 參數以控制是否啟用私人網路功能
- 部署虛擬網路
- 更新 Storage Account 部署以啟用私人端點
- 更新 Function App 部署以啟用虛擬網路整合
- 部署 Blob 和 Table 儲存體的私人端點

## 測試計畫
1. 部署更新後的基礎設施
2. 驗證 Function App 可以存取 Storage Account
3. 驗證從公共網路無法直接存取 Storage Account
4. 確認 Function App 可以正常運作
5. 驗證資源存取延遲不影響應用程式效能

## 安全性考量
- Private Endpoint 可防止從公共網路直接存取儲存體
- Function App 存取儲存體的流量保留在 Azure 私人網路內
- 僅允許授權的 Azure 服務通過強制存取控制存取儲存體

## 後續可能的優化
1. 將 Azure Key Vault 整合到基礎設施中，並使用私人端點保護敏感資訊
2. 考慮為 Function App 啟用私人端點，限制對 API 的公共存取
3. 實作更嚴格的網路安全群組規則，以進一步限制內部流量
