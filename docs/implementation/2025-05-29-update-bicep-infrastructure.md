# 更新 Bicep 基礎架構以支援 Azure FlexConsumption 計劃

日期: 2025-05-29

## 概述

本實作計畫描述了更新 Azure Bicep 基礎設施部署檔案的變更，以支援 Azure Functions FlexConsumption 計劃。FlexConsumption 是 Azure Functions 的新型託管計劃，可以實現動態擴展、使用受控識別連線到資源、支援虛擬網路整合，並提供更靈活的計費模型。同時，此更新也整合了先前分離的 API 和重定向功能應用程式。

## 背景

Azure 最近推出了 FlexConsumption 計劃，作為一種新型的 Azure Functions 託管選項，這種計劃結合了無伺服器的彈性和額外的功能：

1. 動態擴展能力（甚至可以縮減到零實例）
2. 使用受控識別連線到其他 Azure 服務
3. 虛擬網路整合支援
4. 改善冷啟動時間
5. 更靈活的計費模型

同時，我們之前的程式碼結構已經將 API 和重定向功能合併到單一專案中，但基礎設施部署檔案尚未反映這些變更。

## 實作步驟

1. **更新 App Service Plan 模組**
   - 將 API 版本升級到 `2023-12-01`
   - 配置 SKU 為 `FC1` (FlexConsumption)
   - 確保正確設定 Linux 環境

2. **更新儲存體帳戶模組**
   - 添加功能以創建必要的 blob 容器用於 Function App 部署
   - 新增 `blobEndpoint` 輸出以供 Function App 配置使用
   - 更新 API 版本

3. **建立角色分配模組**
   - 新增新模組 `role-assignment.bicep`，用於授予 Function App 受控識別存取儲存體的權限
   - 使用 `Storage Blob Data Owner` 角色

4. **大幅更新 Function App 模組**
   - 添加 `functionAppConfig` 部分以支援 FlexConsumption 所需配置
   - 設定運行時間、記憶體和擴展限制
   - 配置部署儲存體，使用 blob 容器作為部署源
   - 使用系統分配的受控識別進行儲存體訪問
   - 更新應用程式設定以使用新的連接字串格式

5. **更新靜態網頁應用程式模組**
   - 擴展支援的區域列表
   - 維持在 'eastasia' 區域的部署

## Expected Results

- A simplified Bicep deployment that accurately reflects the current code structure
- A single Function App deployment that handles both API and redirect functionality
- Reduced Azure resources, resulting in simpler management and potentially lower costs
- Consistent infrastructure-as-code that aligns with the actual implementation

## Notes

- This change is backward-compatible with existing URLs by maintaining the same routing structure
- The single function app approach provides better resource utilization
