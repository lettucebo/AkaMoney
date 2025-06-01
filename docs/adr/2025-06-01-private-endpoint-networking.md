// filepath: c:\Users\tzyu\Source\Repos\AkaMoney\docs\adr\2025-06-01-private-endpoint-networking.md
# 架構決策紀錄：私人端點網路架構

## 狀態
已接受

## 背景
AkaMoney 應用程式目前使用公共端點來存取儲存體資源，這種方式存在潛在的安全隱憂，因為儲存體帳戶可從公共網路存取。為了提高基礎設施安全性，我們需要實作一種方法，使 Function App 能夠通過私人網路連接到儲存體帳戶。

## 決策
我們決定實作 Azure Private Endpoint，將 Azure Storage 帳戶與 Azure Function App 連接到一個名為 AkaMoney-vnet 的虛擬網路中。

### 具體架構
1. 建立名為 AkaMoney-vnet 的虛擬網路，包含三個子網路：
   - 預設子網路
   - function-subnet：專用於 Function App 的虛擬網路整合
   - pe-subnet：專用於私人端點

2. 為 Storage 帳戶建立以下私人端點：
   - Blob Storage 私人端點：用於檔案儲存和部署容器
   - Table Storage 私人端點：用於短網址和點擊追蹤資料

3. 啟用 Function App 的虛擬網路整合，連接到 function-subnet

4. 設定私人 DNS 區域以便在虛擬網路內正確解析私人端點：
   - privatelink.blob.core.windows.net
   - privatelink.table.core.windows.net

## 後果
### 優點
1. **提高安全性**：儲存體帳戶不再暴露在公共網路上，減少攻擊面
2. **符合法規要求**：符合資料隱私和安全法規，提供更好的資料保護
3. **更好的網路隔離**：清晰地定義了網路邊界，改善了整體安全架構
4. **控制資料外洩**：減少了資料從網路外洩的機會

### 缺點
1. **增加複雜性**：基礎設施配置更複雜，需要更多維護成本
2. **潛在的延遲增加**：私人網路通信可能會引入輕微的延遲
3. **更高的成本**：虛擬網路和私人端點會產生額外費用
4. **疑難排解挑戰**：網路隔離環境中的問題排除可能更為複雜

## 替代方案
1. **網路規則和 IP 限制**：僅使用 Storage 防火牆規則限制存取，而不使用私人端點
2. **僅服務端點**：使用虛擬網路服務端點而非私人端點
3. **共享存取簽章 (SAS)**：依賴 SAS 令牌進行有限存取

## 採用的方案
我們選擇了私人端點解決方案，因為它提供了最佳的安全性和隔離性，符合長期的安全需求。

## 未解決的問題
1. 如何監控私人網路基礎設施的成本效益
2. 是否考慮為 Function App 本身也建立私人端點

## 參考資料
- [Azure Private Endpoint 概述](https://docs.microsoft.com/zh-tw/azure/private-link/private-endpoint-overview)
- [Azure Functions 和虛擬網路](https://docs.microsoft.com/zh-tw/azure/azure-functions/functions-networking-options)
- [Storage Account 私人端點](https://docs.microsoft.com/zh-tw/azure/storage/common/storage-private-endpoints)
