/*
  App Service Plan 模組 (支援 FlexConsumption 計劃)
*/

@description('App Service Plan 名稱')
param name string

@description('位置')
param location string = resourceGroup().location

@description('App Service Plan SKU')
param sku object

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: name
  location: location
  sku: sku
  properties: {
    reserved: true // Linux App Service Plan
  }
}

output id string = appServicePlan.id
output name string = appServicePlan.name
