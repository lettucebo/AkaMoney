// filepath: c:\Users\tzyu\Source\Repos\AkaMoney\docs\implementation\2025-06-01-private-endpoint-implementation-details.md
# Private Endpoint 整合實作細節

## 概述
本文件詳細說明為 AkaMoney 專案實作 Azure Function 和 Storage 透過 Private Endpoint 連接到 AkaMoney-vnet 虛擬網路的過程。

## 已實作的基礎設施變更

### 主要更改
1. **儲存體帳戶私人端點**
   - 已配置 Blob、Table、Queue、File 四種儲存體服務的私人端點
   - 每個端點都有專用的 DNS 區域，確保服務名稱解析正確

2. **Azure Function 虛擬網路整合**
   - 配置 Function App 使用 function-subnet 子網路
   - 啟用 WEBSITE_VNET_ROUTE_ALL 設定，確保所有流量經過虛擬網路

3. **Function App 私人端點**
   - 建立 Function App 的私人端點，允許從虛擬網路內安全存取 API
   - 設定 privatelink.azurewebsites.net DNS 區域，提供正確的名稱解析

4. **儲存體帳戶網路安全設定**
   - 關閉儲存體帳戶的公共網路存取
   - 配置虛擬網路規則以僅允許從 function-subnet 子網路存取
   - 設定 bypass 為 'AzureServices'，允許 Azure 服務存取儲存體

## 架構流程

```
+-----------------+            +------------------+
| Azure Function  |            | Storage Account  |
|    (Private)    |            |    (Private)     |
+--------+--------+            +--------+---------+
         |                              |
         |     +-----------------+      |
         +---->| Private Endpoint|<-----+
               +---------+-------+
                         |
                         v
                +------------------+
                |   AkaMoney-vnet  |
                | Virtual Network  |
                +------------------+
                         |
                         |
          +-------------+--------------+
          |              |             |
 +--------v-------+ +----v----------+ +--------v-------+
 | default-subnet | |function-subnet| |   pe-subnet    |
 +----------------+ +---------------+ +----------------+
```

## 技術細節

### Private Endpoint 配置
為了確保所有必要的儲存體服務可以透過私人網路存取，我們建立了以下私人端點：

1. **Blob 儲存體**: 用於檔案儲存和部署容器
2. **Table 儲存體**: 用於短網址和點擊追蹤資料
3. **Queue 儲存體**: 用於訊息佇列處理
4. **File 儲存體**: 用於 Function App 的內容儲存和部署

每個私人端點都連接到專用的 DNS 區域，確保從虛擬網路內的服務可以正確解析服務端點。

### Function App 與虛擬網路整合
Function App 透過下列方式與虛擬網路整合：

1. **虛擬網路整合**: 配置 Function App 將 `function-subnet` 子網路用於出站流量
2. **路由設定**: 啟用 `WEBSITE_VNET_ROUTE_ALL` 設定將所有出站流量路由通過虛擬網路
3. **內容共享**: 配置 `WEBSITE_CONTENTSHARE` 用於虛擬網路環境中的內容儲存

### 儲存體安全設定
儲存體帳戶透過以下安全設定進行保護：

1. **公共網路存取**: 已設為 `Disabled`
2. **預設拒絕**: 網路 ACL 預設動作設為 `Deny`
3. **虛擬網路規則**: 僅允許從 `function-subnet` 子網路存取
4. **Azure 服務直通**: 啟用 bypass 為 `AzureServices`，允許特定 Azure 服務直接存取

## 測試與驗證

### 部署驗證清單
- [ ] 驗證 Function App 可以從虛擬網路內存取儲存體服務
- [ ] 驗證從公共網路無法直接存取儲存體帳戶
- [ ] 測試 Function App 所有功能是否正常運作
- [ ] 監控網路延遲，確保私人端點不會明顯增加延遲
- [ ] 驗證 DNS 解析正確，所有服務可以透過私人端點正確連接

## 注意事項與限制
1. 開啟私人端點和虛擬網路整合將產生額外費用
2. 部署初期可能需要更長的時間來建立所有私人端點和 DNS 區域
3. 私人端點需要適當的 DNS 解析設定才能正常工作
4. 疑難排解可能更為複雜，因為必須考慮網路層面的問題

## 參考資源
- [Azure 私人端點文件](https://docs.microsoft.com/zh-tw/azure/private-link/private-endpoint-overview)
- [Azure Functions 網路選項](https://docs.microsoft.com/zh-tw/azure/azure-functions/functions-networking-options)
- [Azure Storage 私人端點](https://docs.microsoft.com/zh-tw/azure/storage/common/storage-private-endpoints)
- [虛擬網路服務端點](https://docs.microsoft.com/zh-tw/azure/virtual-network/virtual-network-service-endpoints-overview)
