/*
  Storage Account 模組
*/

@description('Storage Account 名稱')
param name string

@description('位置')
param location string = resourceGroup().location

@description('SKU 名稱')
param skuName string = 'Standard_LRS'

@description('是否建立表格')
param createTables bool = true

var tableNames = [
  'shorturls'
  'clickinfo'
]

resource storageAccount 'Microsoft.Storage/storageAccounts@2022-09-01' = {
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
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2022-09-01' = {
  parent: storageAccount
  name: 'default'
}

resource tables 'Microsoft.Storage/storageAccounts/tableServices/tables@2022-09-01' = [for tableName in tableNames: if (createTables) {
  parent: tableService
  name: tableName
}]

output name string = storageAccount.name
output id string = storageAccount.id
output primaryKey string = listKeys(storageAccount.id, storageAccount.apiVersion).keys[0].value
