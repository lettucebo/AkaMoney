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

@description('子網路配置')
param subnets array = [
  {
    name: 'default'
    addressPrefix: '10.0.0.0/24'
    privateEndpointNetworkPolicies: 'Disabled'
    privateLinkServiceNetworkPolicies: 'Enabled'
  }
  {
    name: 'function-subnet'
    addressPrefix: '10.0.1.0/24'
    delegations: [
      {
        name: 'Microsoft.Web.serverFarms'
        properties: {
          serviceName: 'Microsoft.Web/serverFarms'
        }
      }
    ]
    privateEndpointNetworkPolicies: 'Enabled'
    privateLinkServiceNetworkPolicies: 'Enabled'
  }
  {
    name: 'pe-subnet'
    addressPrefix: '10.0.2.0/24'
    privateEndpointNetworkPolicies: 'Disabled'
    privateLinkServiceNetworkPolicies: 'Enabled'
  }
]

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
    subnets: [for subnet in subnets: {
      name: subnet.name
      properties: {
        addressPrefix: subnet.addressPrefix
        privateEndpointNetworkPolicies: contains(subnet, 'privateEndpointNetworkPolicies') ? subnet.privateEndpointNetworkPolicies : 'Enabled'
        privateLinkServiceNetworkPolicies: contains(subnet, 'privateLinkServiceNetworkPolicies') ? subnet.privateLinkServiceNetworkPolicies : 'Enabled'
        delegations: contains(subnet, 'delegations') ? subnet.delegations : []
      }
    }]
  }
}

// 輸出
output id string = virtualNetwork.id
output name string = virtualNetwork.name
output defaultSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', name, 'default')
output functionSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', name, 'function-subnet')
output peSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', name, 'pe-subnet')
