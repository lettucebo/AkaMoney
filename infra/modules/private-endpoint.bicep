/*
  私人端點模組
  用於為服務建立私人端點和私人 DNS 區域
*/

@description('私人端點名稱')
param name string

@description('位置')
param location string = resourceGroup().location

@description('子網路 ID')
param subnetId string

@description('私人連結服務連接 ID')
param privateLinkServiceId string

@description('群組 ID 列表')
param groupIds array

@description('私人 DNS 區域名稱')
param privateDnsZoneName string

@description('虛擬網路 ID')
param vnetId string

// 私人端點資源
resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-05-01' = {
  name: name
  location: location
  properties: {
    privateLinkServiceConnections: [
      {
        name: name
        properties: {
          privateLinkServiceId: privateLinkServiceId
          groupIds: groupIds
        }
      }
    ]
    subnet: {
      id: subnetId
    }
  }
}

// 私人 DNS 區域資源
resource privateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: privateDnsZoneName
  location: 'global'
}

// 私人 DNS 區域與虛擬網路的連結
resource virtualNetworkLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: privateDnsZone
  name: '${privateDnsZone.name}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnetId
    }
  }
}

// 私人 DNS 區域群組 - 整合私人端點與 DNS 區域
resource privateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-05-01' = {
  parent: privateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config'
        properties: {
          privateDnsZoneId: privateDnsZone.id
        }
      }
    ]
  }
}

// 輸出
output id string = privateEndpoint.id
output name string = privateEndpoint.name
