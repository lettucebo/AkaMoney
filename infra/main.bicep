/*
  AkaMoney 基礎設施部署主模板
  此模板部署 AkaMoney 短網址服務所需的所有 Azure 資源
*/

@description('環境名稱 (dev, test, prod)')
param environmentName string = 'dev'

@description('位置')
param location string = resourceGroup().location

@description('唯一的專案名稱')
param projectName string = 'akamoney'

// 組合資源名稱的變數
var baseName = '${projectName}-${environmentName}'
var apiAppName = '${baseName}-api'
var redirectAppName = '${baseName}-redirect'
var storageAccountName = replace('${baseName}storage', '-', '')
var appServicePlanName = '${baseName}-plan'
var staticWebAppName = '${baseName}-web'

// 部署 Azure App Service 計劃
module appServicePlan './modules/app-service-plan.bicep' = {
  name: 'appServicePlan'
  params: {
    name: appServicePlanName
    location: location
    sku: {
      name: 'Y1'
      tier: 'Dynamic'
    }
  }
}

// 部署 Storage Account
module storageAccount './modules/storage-account.bicep' = {
  name: 'storageAccount'
  params: {
    name: storageAccountName
    location: location
  }
}

// 部署 API Function App
module apiFunctionApp './modules/function-app.bicep' = {
  name: 'apiFunctionApp'
  params: {
    name: apiAppName
    location: location
    appServicePlanId: appServicePlan.outputs.id
    storageAccountName: storageAccount.outputs.name
    storageAccountKey: storageAccount.outputs.primaryKey
    appSettings: {
      'TableStorageConnection': 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.outputs.name};AccountKey=${storageAccount.outputs.primaryKey};EndpointSuffix=core.windows.net'
      'DefaultRedirectUrl': 'https://${staticWebAppName}.azurewebsites.net'
    }
  }
}

// 部署重定向 Function App
module redirectFunctionApp './modules/function-app.bicep' = {
  name: 'redirectFunctionApp'
  params: {
    name: redirectAppName
    location: location
    appServicePlanId: appServicePlan.outputs.id
    storageAccountName: storageAccount.outputs.name
    storageAccountKey: storageAccount.outputs.primaryKey
    appSettings: {
      'TableStorageConnection': 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.outputs.name};AccountKey=${storageAccount.outputs.primaryKey};EndpointSuffix=core.windows.net'
      'DefaultRedirectUrl': 'https://${staticWebAppName}.azurewebsites.net'
    }
  }
}

// 部署靜態網站
module staticWebApp './modules/static-web-app.bicep' = {
  name: 'staticWebApp'
  params: {
    name: staticWebAppName
    location: location
    apiUrl: 'https://${apiAppName}.azurewebsites.net'
    redirectUrl: 'https://${redirectAppName}.azurewebsites.net'
  }
}

// 輸出重要資訊
output apiUrl string = 'https://${apiAppName}.azurewebsites.net'
output redirectUrl string = 'https://${redirectAppName}.azurewebsites.net'
output webUrl string = staticWebApp.outputs.url
output storageAccountName string = storageAccount.outputs.name
