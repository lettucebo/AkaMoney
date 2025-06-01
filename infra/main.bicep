/*
  AkaMoney 基礎設施部署主模板
  此模板部署 AkaMoney 短網址服務所需的所有 Azure 資源
*/

@description('環境名稱 (dev, test, prod)')
param environmentName string = 'prod'

@description('位置')
param location string = resourceGroup().location

@description('唯一的專案名稱')
param projectName string = 'akamoney'

@description('是否啟用私人端點和虛擬網路整合')
param enablePrivateNetworking bool = true

// 組合資源名稱的變數
var baseName = '${projectName}-${environmentName}'
var apiAppName = '${baseName}-api'
var storageAccountName = replace('${baseName}storage', '-', '')
var appServicePlanName = '${baseName}-plan'
var staticWebAppName = '${baseName}-web'
var deploymentContainerName = 'funcdeployment'
var vnetName = 'AkaMoney-vnet'

// 部署虛擬網路
module virtualNetwork './modules/virtual-network.bicep' = if (enablePrivateNetworking) {
  name: 'virtualNetwork'
  params: {
    name: vnetName
    location: location
  }
}

// 部署 Azure App Service 計劃 (FlexConsumption)
module appServicePlan './modules/app-service-plan.bicep' = {
  name: 'appServicePlan'
  params: {
    name: appServicePlanName
    location: location
    sku: {
      tier: 'FlexConsumption'
      name: 'FC1'
    }
  }
}

// 部署 Storage Account
module storageAccount './modules/storage-account.bicep' = {
  name: 'storageAccount'
  params: {
    name: storageAccountName
    location: location
    createDeploymentContainer: true
    deploymentContainerName: deploymentContainerName
    enablePrivateEndpoint: enablePrivateNetworking
  }
}

// 部署整合 API 和重定向功能的 Function App
module functionApp './modules/function-app.bicep' = {
  name: 'functionApp'
  params: {
    name: apiAppName
    location: location
    appServicePlanId: appServicePlan.outputs.id
    storageAccountName: storageAccount.outputs.name
    deploymentContainerName: deploymentContainerName
    enableVnetIntegration: enablePrivateNetworking
    subnetId: enablePrivateNetworking ? virtualNetwork.outputs.functionSubnetId : ''
    appSettings: {
      TableStorageConnection: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.outputs.name};AccountKey=${storageAccount.outputs.primaryKey};EndpointSuffix=core.windows.net'
      DefaultRedirectUrl: 'https://${staticWebAppName}.azurewebsites.net'
    }
  }
}

// 部署靜態網站
module staticWebApp './modules/static-web-app.bicep' = {
  name: 'staticWebApp'
  params: {
    name: staticWebAppName
    // 不傳遞 location 參數，使用模組中的預設值 'eastasia'
    apiUrl: 'https://${apiAppName}.azurewebsites.net'
    redirectUrl: 'https://${apiAppName}.azurewebsites.net'
  }
}

// 授予 Function App 存取 Storage Account 的權限 (Blob Data Owner 角色)
module roleAssignment './modules/role-assignment.bicep' = {
  name: 'roleAssignment'
  params: {
    principalId: functionApp.outputs.principalId
    storageAccountName: storageAccount.outputs.name
    roleDefinitionId: 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b' // Storage Blob Data Owner 角色
  }
}

// 部署 Blob Storage 私人端點
module blobPrivateEndpoint './modules/private-endpoint.bicep' = if (enablePrivateNetworking) {
  name: 'blobPrivateEndpoint'
  params: {
    name: '${storageAccountName}-blob-pe'
    location: location
    subnetId: virtualNetwork.outputs.peSubnetId
    privateLinkServiceId: storageAccount.outputs.id
    groupIds: [
      'blob'
    ]
    privateDnsZoneName: 'privatelink.blob.core.windows.net'
    vnetId: virtualNetwork.outputs.id
  }
  dependsOn: [
    storageAccount
  ]
}

// 部署 Table Storage 私人端點
module tablePrivateEndpoint './modules/private-endpoint.bicep' = if (enablePrivateNetworking) {
  name: 'tablePrivateEndpoint'
  params: {
    name: '${storageAccountName}-table-pe'
    location: location
    subnetId: virtualNetwork.outputs.peSubnetId
    privateLinkServiceId: storageAccount.outputs.id
    groupIds: [
      'table'
    ]
    privateDnsZoneName: 'privatelink.table.core.windows.net'
    vnetId: virtualNetwork.outputs.id
  }
  dependsOn: [
    storageAccount
  ]
}

// 部署 Queue Storage 私人端點
module queuePrivateEndpoint './modules/private-endpoint.bicep' = if (enablePrivateNetworking) {
  name: 'queuePrivateEndpoint'
  params: {
    name: '${storageAccountName}-queue-pe'
    location: location
    subnetId: virtualNetwork.outputs.peSubnetId
    privateLinkServiceId: storageAccount.outputs.id
    groupIds: [
      'queue'
    ]
    privateDnsZoneName: 'privatelink.queue.core.windows.net'
    vnetId: virtualNetwork.outputs.id
  }
  dependsOn: [
    storageAccount
  ]
}

// 部署 File Storage 私人端點
module filePrivateEndpoint './modules/private-endpoint.bicep' = if (enablePrivateNetworking) {
  name: 'filePrivateEndpoint'
  params: {
    name: '${storageAccountName}-file-pe'
    location: location
    subnetId: virtualNetwork.outputs.peSubnetId
    privateLinkServiceId: storageAccount.outputs.id
    groupIds: [
      'file'
    ]
    privateDnsZoneName: 'privatelink.file.core.windows.net'
    vnetId: virtualNetwork.outputs.id
  }
  dependsOn: [
    storageAccount
  ]
}

// 部署 Function App 私人端點
module functionAppPrivateEndpoint './modules/function-app-private-endpoint.bicep' = if (enablePrivateNetworking) {
  name: 'functionAppPrivateEndpoint'
  params: {
    name: '${apiAppName}-pe'
    location: location
    subnetId: virtualNetwork.outputs.peSubnetId
    functionAppId: functionApp.outputs.id
    vnetId: virtualNetwork.outputs.id
  }
  dependsOn: [
    functionApp
  ]
}

// 輸出重要資訊
output apiUrl string = 'https://${apiAppName}.azurewebsites.net'
output webUrl string = staticWebApp.outputs.url
output storageAccountName string = storageAccount.outputs.name
output vnetName string = enablePrivateNetworking ? virtualNetwork.outputs.name : 'No VNet Deployed'
output privateEndpointsEnabled bool = enablePrivateNetworking
