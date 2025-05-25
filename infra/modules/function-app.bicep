/*
  Function App 模組
*/

@description('Function App 名稱')
param name string

@description('位置')
param location string = resourceGroup().location

@description('App Service Plan ID')
param appServicePlanId string

@description('儲存體帳戶名稱')
param storageAccountName string

@description('儲存體帳戶金鑰')
param storageAccountKey string

@description('應用程式設定')
param appSettings object = {}

var combinedAppSettings = union({
  AzureWebJobsStorage: 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageAccountKey};EndpointSuffix=core.windows.net'
  FUNCTIONS_EXTENSION_VERSION: '~4'
  FUNCTIONS_WORKER_RUNTIME: 'dotnet-isolated'
  WEBSITE_RUN_FROM_PACKAGE: '1'
}, appSettings)

resource functionApp 'Microsoft.Web/sites@2022-09-01' = {
  name: name
  location: location
  kind: 'functionapp'
  properties: {
    serverFarmId: appServicePlanId
    httpsOnly: true
    siteConfig: {
      appSettings: [for key in items(combinedAppSettings): {
        name: key.key
        value: key.value
      }]
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
  }

  identity: {
    type: 'SystemAssigned'
  }
}

output id string = functionApp.id
output name string = functionApp.name
output url string = 'https://${functionApp.name}.azurewebsites.net'
output principalId string = functionApp.identity.principalId
