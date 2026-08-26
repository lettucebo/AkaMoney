[English](AUTHENTICATION.md) | 繁體中文

# AkaMoney 驗證參考文件

## 總覽

AkaMoney 的管理體驗使用 Microsoft Entra ID 進行驗證：

1. 前端在瀏覽器中使用 MSAL
2. Axios 把取得的 access token 當作 bearer token 送出
3. 管理 API 以 Entra JWKS、issuer 與 audience 驗證該 token
4. 後端把呼叫者 upsert 到 `users`

公開轉址路徑與公開的受限 analytics 路由則刻意維持無需驗證。

## 路由分類

| 分類 | 路由 |
| --- | --- |
| 公開 | 管理端 `GET /health`、管理端 `GET /api/public/analytics/:shortCode`、轉址端 `OPTIONS *`、轉址端 `GET /health`、轉址端 `GET /:shortCode` |
| 可選驗證 | 管理端 `POST /api/shorten` |
| 受保護 | 管理端 `GET /api/urls`、`GET /api/urls/:id`、`PUT /api/urls/:id`、`DELETE /api/urls/:id`、`GET /api/analytics/:shortCode`、`GET /api/stats/overall`、`POST /api/admin/cleanup`、`GET /api/storage/config`、`POST /api/storage/upload`、`GET /api/storage/files/:key{.+}`、`GET /api/storage/files`、`DELETE /api/storage/files/:key{.+}` |

## 前端驗證流程

### MSAL 初始化

`src/frontend/src/services/auth.ts` 只有在 `VITE_ENTRA_ID_CLIENT_ID` 已設定時，才會建立 `PublicClientApplication`。初始化流程會：

- 呼叫 `msalInstance.initialize()`
- 透過 `handleRedirectPromise()` 處理 redirect 完成
- 在 redirect 成功後設定 active account
- 若 Entra 有回傳 access token，就把它存進 `localStorage` 的 `auth_token`

### 啟動期間的競態保護

Pinia auth store 使用共用的 `initializePromise`，避免 router 或元件並行呼叫時重複初始化。這是目前用來防止 router 與 UI bootstrap 啟動競態的保護機制。

### 登入與 Redirect 處理

- 正常登入畫面會使用 `authStore.loginRedirect()`
- `loginRedirect()` 會要求 `openid`、`profile`、`email` 與 `api://<client-id>/access_as_user` scopes
- redirect 完成後，由 `initialize()` 收尾並建立 session

程式碼中仍保留 `authService.login()` 這個 popup 登入方法，但正式登入畫面使用的是 redirect 流程。

### 登出行為

登出只影響應用程式本身，不會完整登出 Microsoft 帳號：

- 在 `localStorage` 設定 `akamoney_explicit_logout`
- 移除 `auth_token`
- 清除目前的 MSAL active account 參照

這個 explicit logout flag 可以阻止應用程式在下次載入時悄悄重用已快取的 MSAL 帳號。

### Redirect 驗證

登入後跳轉會透過 `getValidatedRedirect(...)` 做淨化：

- 必須以 `/` 開頭
- 拒絕 protocol-relative 與 absolute URL
- 拒絕 `/login`
- 去除可用於 redirect trick 的控制字元

這樣能把登入流程限制在站內路由。

## 後端 Token 驗證

### 必要檢查

`src/backend/src/middleware/auth.ts` 會以下列條件驗證 Entra token：

- 依租戶建立的遠端 JWKS
- 接受的 issuer：
  - `https://login.microsoftonline.com/<tenant-id>/v2.0`
  - `https://sts.windows.net/<tenant-id>/`
- 接受的 audience：
  - `<client-id>`
  - `api://<client-id>`

```http
Authorization: Bearer <access-token>
```

### 必填中介層行為

`authMiddleware` 會回傳：

- `401`：`Authorization` header 缺失或格式錯誤
- `500`：`ENTRA_ID_TENANT_ID` 或 `ENTRA_ID_CLIENT_ID` 缺失
- `401`：token 無效或已過期

若 token 驗證成功，中介層會嘗試在 D1 中 upsert 使用者。若這個資料庫步驟失敗，驗證仍會繼續，只是 context 中不會帶入來自資料庫的角色欄位。

### 可選中介層行為

`optionalAuthMiddleware` 永遠不會拒絕請求：

- 沒有 bearer token -> 匿名繼續
- bearer token 無效 -> 仍然匿名繼續
- bearer token 有效 -> 驗證成功時才附加使用者 context

這也是為什麼 `POST /api/shorten` 能建立匿名短網址，同時在有登入時把短網址綁到對應使用者。

## 使用者 Upsert 與角色狀態

在 token 驗證成功後，後端會以以下參數呼叫 `upsertUser(...)`：

- `email`
- `name`
- `sso_provider = "entra"`
- `sso_id = <token 中的 oid 或 sub>`

`users` 表對新資料預設角色為 `"user"`。當 upsert 成功後，auth context 會再補上：

- 已驗證的 Entra 身分欄位
- `role`
- `dbUserId`

## 開發環境略過模式

### `VITE_SKIP_AUTH`

前端只有在以下兩個條件同時成立時，才會略過驗證：

```env
VITE_SKIP_AUTH=true
import.meta.env.DEV=true
```

啟用後：

- 不會真的執行 MSAL 登入
- 應用程式會使用假造的記憶體帳號
- `authService.getToken()` 會回傳 `dev-mock-token`
- `src/frontend/src/services/api.ts` 會從記憶體提供 mock 的短網址、analytics 與 storage 結果

### 重要限制

這個模式適合 UI 開發、截圖與測試，但無法驗證：

- 真實 Entra 登入
- 管理 Worker 的 bearer token 處理
- 依賴 D1 的擁有權檢查
- 真實 storage provider 行為

## 非正式環境 JWT Helper

`src/backend/src/services/jwt.ts` 內建了 HMAC JWT 產生與驗證功能，但正式的管理 API 不會呼叫它。線上驗證路徑使用的是 Entra token 驗證。

## 相關文件

- [專案 README](../README.zh-TW.md)
- [架構](ARCHITECTURE.zh-TW.md)
- [API 參考](API.zh-TW.md)
- [資料庫](DATABASE.zh-TW.md)
