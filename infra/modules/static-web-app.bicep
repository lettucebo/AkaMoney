/*
  Static Web App 模組
*/

@description('Static Web App 名稱')
param name string

@description('位置')
param location string = resourceGroup().location

@description('API URL')
param apiUrl string

@description('重定向 URL')
param redirectUrl string

resource staticWebApp 'Microsoft.Web/staticSites@2022-09-01' = {
  name: name
  location: location
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
  sku: {
    name: 'Free'
    tier: 'Free'
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
