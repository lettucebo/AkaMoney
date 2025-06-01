/*
  虛擬網路模組
  用於建立並配置 AkaMoney 的虛擬網路和子網路
*/

@description('虛擬網路名稱')
param name string

@description('位置')
param location string = resourceGroup().location

@description('虛擬網路位址前綴')
param addressPrefix string = '10.0.0.0/16'

// 虛擬網路資源
resource virtualNetwork 'Microsoft.Network/virtualNetworks@2023-05-01' = {
  name: name
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        addressPrefix
      ]
    }
    subnets: [
      {
        name: 'default'
        properties: {
          addressPrefix: '10.0.0.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
          privateLinkServiceNetworkPolicies: 'Enabled'
        }
      }
      {
        name: 'function-subnet'
        properties: {
          addressPrefix: '10.0.1.0/24'
          delegations: [
            {
              name: 'Microsoft.Web.serverFarms'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
            {
              name: 'Microsoft.App.environments'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
          serviceEndpoints: [
            {
              service: 'Microsoft.Storage'
              locations: [
                '*'
              ]
            }
          ]
          privateEndpointNetworkPolicies: 'Enabled'
          privateLinkServiceNetworkPolicies: 'Enabled'
        }
      }
      {
        name: 'pe-subnet'
        properties: {
          addressPrefix: '10.0.2.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
          privateLinkServiceNetworkPolicies: 'Enabled'
        }
      }
    ]
  }
}

// 輸出
output id string = virtualNetwork.id
output name string = virtualNetwork.name
output defaultSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', name, 'default')
output functionSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', name, 'function-subnet')
output peSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', name, 'pe-subnet')
