# FlexConsumption Function App 部署問題修復

日期：2025-05-29  
作者：GitHub Copilot

## 概述

修正 Azure Functions FlexConsumption 計劃部署失敗問題，問題是由於 Function App 配置中包含了在 FlexConsumption 計劃中不支援的屬性所導致。

## 背景

在嘗試部署 FlexConsumption Function App 時，我們遇到了以下錯誤：

```
The following list of 2 site configuration properties (Site.SiteConfig.FtpsState, Site.SiteConfig.LinuxFxVersion) for Flex Consumption sites is invalid. Please remove or rename them before retrying.
```

FlexConsumption 是一種較新的託管計劃，它有自己特定的設定和限制。與其他 Function App 計劃（如 Consumption 或 Premium）不同，FlexConsumption 計劃不支援 `ftpsState` 和 `linuxFxVersion` 這兩個配置屬性。

## 技術細節

FlexConsumption 計劃對 Function App 配置有特定的要求：

1. 不支援 `ftpsState` 設定 - FTP 存取由平台以不同方式管理
2. 不支援 `linuxFxVersion` 設定 - 運行時版本在 `functionAppConfig.runtime` 中設定
3. 不支援 `FUNCTIONS_WORKER_RUNTIME` 應用程式設定 - 運行時環境已在 `functionAppConfig.runtime` 中設定
4. 運行時設定必須在 `functionAppConfig` 區段定義，而非 `siteConfig`

## 實作步驟

1. 修改 `infra/modules/function-app.bicep` 檔案：
   - 保留了 `functionAppConfig` 區段中的運行時設定
   - 移除了 `siteConfig` 中的 `ftpsState` 屬性
   - 移除了 `siteConfig` 中的 `linuxFxVersion` 屬性
   - 移除了 `FUNCTIONS_WORKER_RUNTIME` 應用程式設定
   - 保留了其他重要配置，如應用程式設定和 TLS 版本

2. 格式修正：
   - 確保了 `.bicep` 檔案的格式正確
   - 添加了說明性註解

## 預期結果

- 成功部署 FlexConsumption Function App
- 保留所有必要的功能配置
- 遵循 Microsoft 對 FlexConsumption 計劃的最新建議

## 參考資料

- [Azure Functions 託管選項](https://learn.microsoft.com/zh-tw/azure/azure-functions/functions-scale)
- [Azure Functions FlexConsumption 計劃](https://azure.microsoft.com/zh-tw/updates/public-preview-azure-functions-on-dedicated-plan-with-flex-consumption-option/)
- [Bicep 函式應用程式部署](https://learn.microsoft.com/zh-tw/azure/templates/microsoft.web/sites?pivots=deployment-language-bicep)
