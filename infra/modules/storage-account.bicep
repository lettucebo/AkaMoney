/*
  Storage Account 模組
*/

@description('Storage Account 名稱')
param name string

@description('位置')
param location string = resourceGroup().location

@description('SKU 名稱')
param skuName string = 'Standard_LRS'

@description('是否啟用私人端點')
param enablePrivateEndpoint bool = false

@description('是否建立表格')
param createTables bool = true

@description('是否建立部署容器')
param createDeploymentContainer bool = false

@description('部署容器名稱')
param deploymentContainerName string = 'functiondeployment'

var tableNames = [
  'shorturls'
  'clickinfo'
]

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: name
  location: location
  kind: 'StorageV2'
  sku: {
    name: skuName
  }
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    publicNetworkAccess: enablePrivateEndpoint ? 'Disabled' : 'Enabled'
    networkAcls: {
      defaultAction: enablePrivateEndpoint ? 'Deny' : 'Allow'
      bypass: 'AzureServices'
      virtualNetworkRules: enablePrivateEndpoint ? [
        {
          id: resourceId('Microsoft.Network/virtualNetworks/subnets', 'AkaMoney-vnet', 'function-subnet')
          action: 'Allow'
        }
      ] : []
    }
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource tables 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = [for tableName in tableNames: if (createTables) {
  parent: tableService
  name: tableName
}]

// Blob 服務
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

// 部署容器
resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = if (createDeploymentContainer) {
  parent: blobService
  name: deploymentContainerName
  properties: {
    publicAccess: 'None'
  }
}

output name string = storageAccount.name
output id string = storageAccount.id
@secure()
output primaryKey string = storageAccount.listKeys().keys[0].value
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob
output storageAccountId string = storageAccount.id
