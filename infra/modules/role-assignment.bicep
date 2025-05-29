/*
  角色分配模組，用於授予 Function App 存取儲存體帳戶的權限
*/

@description('被授予權限的主體 ID (通常是 Function App 的 PrincipalId)')
param principalId string

@description('儲存體帳戶名稱')
param storageAccountName string

@description('角色定義 ID')
param roleDefinitionId string = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b' // Storage Blob Data Owner

// 獲取儲存體帳戶資源
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

// 建立角色分配
resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, principalId, roleDefinitionId)
  scope: storageAccount
  properties: {
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', roleDefinitionId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
