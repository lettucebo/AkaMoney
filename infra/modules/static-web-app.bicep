/*
  Static Web App 模組
  使用接近 East Asia 的區域
*/

@description('Static Web App 名稱')
param name string

@description('位置，選擇接近 East Asia 的區域')
@allowed([
  'eastasia'
  'southeastasia'
  'centralus'
  'eastus2'
  'westeurope'
  'westus2'
])
param location string = 'eastasia'

@description('API URL')
param apiUrl string

@description('重定向 URL')
param redirectUrl string

@allowed([
  'Free'
  'Standard'
])
@description('SKU 名稱')
param skuName string = 'Free'

@description('SKU 層級')
param skuTier string = skuName

resource staticWebApp 'Microsoft.Web/staticSites@2022-09-01' = {
  name: name
  location: location
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    buildProperties: {
      skipGithubActionWorkflowGeneration: true
    }
  }
  sku: {
    name: skuName
    tier: skuTier
  }

  resource appSettings 'config' = {
    name: 'appsettings'
    properties: {
      VUE_APP_API_URL: apiUrl
      VUE_APP_REDIRECT_URL: redirectUrl
      VUE_APP_CLIENT_ID: 'placeholder-client-id'
      VUE_APP_TENANT_ID: 'placeholder-tenant-id'
      VUE_APP_API_CLIENT_ID: 'placeholder-api-client-id'
    }
  }
}

output id string = staticWebApp.id
output name string = staticWebApp.name
output url string = staticWebApp.properties.defaultHostname
