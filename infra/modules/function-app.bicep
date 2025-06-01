// filepath: c:\Users\tzyu\Source\Repos\AkaMoney\infra\modules\function-app.bicep
/*
  Function App 模組 (FlexConsumption)
*/

@description('Function App 名稱')
param name string

@description('位置')
param location string = resourceGroup().location

@description('App Service Plan ID')
param appServicePlanId string

@description('儲存體帳戶名稱')
param storageAccountName string

@description('部署容器名稱')
param deploymentContainerName string = 'functiondeployment'

@description('應用程式設定')
param appSettings object = {}

// 取得儲存體帳戶的參考
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

// 組合應用程式設定
var combinedAppSettings = union({
  AzureWebJobsStorage__accountName: storageAccountName
  FUNCTIONS_EXTENSION_VERSION: '~4'
  // 已移除 FUNCTIONS_WORKER_RUNTIME，因為 FlexConsumption 計劃不支援此設定
  // 已移除 WEBSITE_RUN_FROM_PACKAGE，因為 FlexConsumption 計劃不支援此設定
}, appSettings)

// 部署 Function App
resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: name
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlanId
    httpsOnly: true
    functionAppConfig: {
      runtime: {
        name: 'dotnet-isolated'
        version: '8.0'
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 100
        instanceMemoryMB: 2048
      }
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageAccount.properties.primaryEndpoints.blob}${deploymentContainerName}'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
    }
    siteConfig: {
      appSettings: [for key in items(combinedAppSettings): {
        name: key.key
        value: key.value
      }]
      minTlsVersion: '1.2'
      // 注意：移除了 ftpsState 和 linuxFxVersion，因為它們在 FlexConsumption 計劃中不支援
    }
  }
}

// 輸出
output id string = functionApp.id
output name string = functionApp.name
output url string = 'https://${functionApp.name}.azurewebsites.net'
output principalId string = functionApp.identity.principalId
