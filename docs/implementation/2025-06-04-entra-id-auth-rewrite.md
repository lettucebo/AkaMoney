# 2025-06-04 Entra ID Auth Rewrite Implementation Plan

## 背景
現有登入驗證機制（Azure Entra ID）存在無法修復的 BUG，需全面重構，確保前後端皆以 Microsoft Entra ID 為唯一驗證方式，並移除所有 mock/development 模式。

## 目標
- 前端與後端皆僅支援 Microsoft Entra ID 驗證。
- 移除所有模擬登入、匿名模式。
- 確保 JWT 驗證流程正確，並與 API 權限一致。
- Infra 設定與文件同步更新。

## 分階段實作計畫

### 1. 前端（akamoney-frontend）
- [x] 移除 mock/development authentication 相關程式碼。
- [x] 重寫 `authService.js`，僅支援 Entra ID 驗證，流程簡化。
- [x] 確認 router 與 views（如 Login.vue）皆正確導向 Entra ID 登入。
- [x] 確認 access token 取得與 API 呼叫流程正確。
- [x] 更新 .env 範例，明確標示 clientId、tenantId、api scope。

### 2. 後端（AkaMoney.Functions）
- [x] 強制啟用 Entra ID JWT 驗證，移除匿名模式。
- [x] 檢查/重構 Program.cs，確保僅允許已驗證請求。
- [ ] 確認 API 權限設定與 Entra ID App Registration 一致。
- [ ] 撰寫單元測試與整合測試，驗證授權流程。

### 3. Infra
- [ ] 檢查/更新 Function App、Static Web App、API 權限、redirectUri、clientId、tenantId 設定。
- [ ] 確認 bicep 參數與 local.settings.json、前端 .env 一致。

### 4. 文件同步
- [x] 更新 /docs/implementation 與 README.md。
- [x] 於 CHANGELOG.md 記錄重大變更。
- [ ] 若 infra 有調整，補充 ADR。

### 5. 測試
- [ ] 撰寫/更新單元測試、整合測試。
- [ ] 針對登入、API 授權、token 驗證進行 E2E 測試。

## 參考
- [Azure Entra ID 官方文件](https://learn.microsoft.com/azure/active-directory/develop/)
- [MSAL.js 官方文件](https://learn.microsoft.com/azure/active-directory/develop/tutorial-v2-javascript-spa)
- [Azure Functions Entra ID 驗證](https://learn.microsoft.com/azure/azure-functions/functions-bindings-http-webhook-trigger?tabs=csharp#authorization-keys)

---
本計畫將分階段建立 Github Issue 並逐步 commit，確保每個步驟皆可追蹤與回溯。
