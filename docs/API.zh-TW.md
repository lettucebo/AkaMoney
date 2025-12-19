# AkaMoney API 文件

[English](API.md) | 繁體中文

## 服務架構

AkaMoney 使用分離式服務架構：

| 服務 | 基礎 URL | 驗證 |
|------|----------|------|
| **重定向服務** | `https://go.aka.money` | ❌ 無需驗證（公開存取） |
| **管理 API** | `https://api.aka.money` | ✅ 需要 JWT |

## 身份驗證

大多數管理 API 端點需要 JWT 身份驗證。在 Authorization 標頭中包含 JWT 權杖：

```
Authorization: Bearer <your_jwt_token>
```

---

## 重定向服務端點

基礎 URL：`https://go.aka.money`（或您的重定向 worker URL）

> **注意**：重定向服務為公開存取，無需驗證。

### 健康檢查
```http
GET /health
```

**回應：**
```json
{
  "status": "ok",
  "service": "redirect",
  "timestamp": 1702834567890
}
```

### 重定向到原始網址
```http
GET /:shortCode
```

**回應：** 302 重定向到原始網址

**錯誤回應：**
- 404：找不到短網址
- 410：短網址已過期

---

## 管理 API 端點

基礎 URL：`https://api.aka.money`（或您的管理 API worker URL）

> **注意**：大多數端點需要 JWT 驗證。

### 健康檢查
```http
GET /health
```

**回應：**
```json
{
  "status": "ok",
  "service": "admin-api",
  "timestamp": 1702834567890
}
```

### 建立短網址（公開）
```http
POST /api/shorten
Content-Type: application/json
```

**請求主體：**
```json
{
  "original_url": "https://example.com/very-long-url",
  "short_code": "my-link",  // 選用：自訂短代碼
  "title": "我的連結",        // 選用：標題
  "description": "描述"  // 選用：描述
}
```

**回應：** 201 Created
```json
{
  "id": "abc123",
  "short_code": "my-link",
  "original_url": "https://example.com/very-long-url",
  "short_url": "my-link",
  "title": "我的連結",
  "created_at": 1702834567890,
  "updated_at": 1702834567890,
  "is_active": true,
  "click_count": 0
}
```

**錯誤回應：**
- 400：無效的網址或短代碼格式
- 409：短代碼已存在

#### 取得公開分析
```http
GET /api/public/analytics/:shortCode
```

**回應：** 200 OK
```json
{
  "short_code": "my-link",
  "total_clicks": 42,
  "created_at": 1702834567890
}
```

### 受保護端點（需要 JWT）

#### 列出使用者網址
```http
GET /api/urls?page=1&limit=20
Authorization: ******
```

**查詢參數：**
- `page`（選用）：頁碼，預設 1
- `limit`（選用）：每頁項目數，預設 20，最大 100

**回應：** 200 OK
```json
{
  "data": [
    {
      "id": "abc123",
      "short_code": "my-link",
      "original_url": "https://example.com",
      "short_url": "my-link",
      "title": "我的連結",
      "created_at": 1702834567890,
      "updated_at": 1702834567890,
      "is_active": true,
      "click_count": 42
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

#### 取得特定網址
```http
GET /api/urls/:id
Authorization: ******
```

**回應：** 200 OK
```json
{
  "id": "abc123",
  "short_code": "my-link",
  "original_url": "https://example.com",
  "short_url": "my-link",
  "title": "我的連結",
  "description": "我的描述",
  "created_at": 1702834567890,
  "updated_at": 1702834567890,
  "expires_at": 1735834567890,
  "is_active": true,
  "click_count": 42
}
```

#### 更新網址
```http
PUT /api/urls/:id
Authorization: ******
Content-Type: application/json
```

**請求主體：**
```json
{
  "original_url": "https://example.com/updated",  // 選用
  "title": "更新後的標題",                        // 選用
  "description": "更新後的描述",            // 選用
  "is_active": false,                              // 選用
  "expires_at": 1735834567890                      // 選用
}
```

**回應：** 200 OK
```json
{
  "id": "abc123",
  "short_code": "my-link",
  "original_url": "https://example.com/updated",
  "short_url": "my-link",
  "title": "更新後的標題",
  "updated_at": 1702834600000,
  "is_active": false,
  "click_count": 42
}
```

#### 刪除網址
```http
DELETE /api/urls/:id
Authorization: ******
```

**回應：** 200 OK
```json
{
  "message": "URL deleted successfully"
}
```

#### 取得分析
```http
GET /api/analytics/:shortCode
Authorization: ******
```

**回應：** 200 OK
```json
{
  "url": {
    "id": "abc123",
    "short_code": "my-link",
    "original_url": "https://example.com",
    "short_url": "my-link",
    "created_at": 1702834567890,
    "click_count": 42
  },
  "total_clicks": 42,
  "clicks_by_date": {
    "2024-12-17": 10,
    "2024-12-18": 15,
    "2024-12-19": 17
  },
  "clicks_by_country": {
    "US": 20,
    "GB": 10,
    "CA": 12
  },
  "clicks_by_device": {
    "mobile": 25,
    "desktop": 15,
    "tablet": 2
  },
  "clicks_by_browser": {
    "chrome": 30,
    "safari": 8,
    "firefox": 4
  },
  "recent_clicks": [
    {
      "id": "click123",
      "clicked_at": 1702834567890,
      "country": "US",
      "city": "New York",
      "device_type": "mobile",
      "browser": "chrome",
      "os": "ios"
    }
  ]
}
```

## 錯誤回應

所有錯誤回應遵循此格式：

```json
{
  "error": "錯誤類型",
  "message": "詳細錯誤訊息"
}
```

### 常見 HTTP 狀態碼

- `200 OK`：請求成功
- `201 Created`：資源建立成功
- `400 Bad Request`：無效的請求參數
- `401 Unauthorized`：缺少或無效的身份驗證
- `404 Not Found`：找不到資源
- `409 Conflict`：資源已存在
- `410 Gone`：資源已過期
- `500 Internal Server Error`：伺服器錯誤

## 速率限制

目前尚未實施速率限制。建議在生產環境中實施速率限制：

- 公開端點：每個 IP 每分鐘 100 個請求
- 已驗證端點：每個使用者每分鐘 1000 個請求

## CORS

API 支援 CORS，配置如下：

- 允許的來源：可在 `src/backend/src/middleware/cors.ts` 中配置
- 允許的方法：GET、POST、PUT、DELETE、OPTIONS
- 允許的標頭：Content-Type、Authorization
- 憑證：支援

## 短代碼格式

短代碼必須遵循以下規則：
- 長度：3-20 個字元
- 允許的字元：a-z、A-Z、0-9、連字號（-）、底線（_）
- 模式：`^[a-zA-Z0-9-_]{3,20}$`

## 網址驗證

原始網址必須：
- 是有效的網址
- 使用 HTTP 或 HTTPS 協定
- 格式正確

## 點擊追蹤

當存取短網址時：
1. 系統記錄點擊元資料（IP、使用者代理、引用來源、國家、設備、瀏覽器、作業系統）
2. 點擊計數遞增
3. 使用者被重定向到原始網址
4. 所有資料都以非同步方式儲存以進行分析

## 資料保留

- 網址：無限期儲存，除非刪除或過期
- 點擊記錄：無限期儲存
- 使用者資料：在帳戶活動期間儲存

## 最佳實踐

1. **使用 HTTPS**：生產環境中始終使用 HTTPS
2. **驗證輸入**：縮短前始終驗證網址
3. **處理錯誤**：實施適當的錯誤處理
4. **快取回應**：在可能的情況下快取靜態資料
5. **監控使用情況**：追蹤 API 使用情況並設定警報
6. **安全權杖**：安全地儲存 JWT 權杖
7. **速率限制**：為生產環境實施速率限制
8. **日誌記錄**：記錄重要事件以進行除錯

## 使用範例

### JavaScript/TypeScript
```typescript
const response = await fetch('https://api.aka.money/api/shorten', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': '******'
  },
  body: JSON.stringify({
    original_url: 'https://example.com/very-long-url',
    short_code: 'my-link'
  })
});

const data = await response.json();
console.log(data.short_url);
```

### cURL
```bash
curl -X POST https://api.aka.money/api/shorten \
  -H "Content-Type: application/json" \
  -H "Authorization: ******" \
  -d '{"original_url": "https://example.com"}'
```

### Python
```python
import requests

response = requests.post(
    'https://api.aka.money/api/shorten',
    headers={
        'Content-Type': 'application/json',
        'Authorization': '******'
    },
    json={
        'original_url': 'https://example.com',
        'short_code': 'my-link'
    }
)

data = response.json()
print(data['short_url'])
```

## 支援

如有問題：
- 查看[設定指南](SETUP.zh-TW.md)
- 閱讀[完整文件](../README.zh-TW.md)
- 在 GitHub 上提出 Issue
- 查看 [Cloudflare Workers 文件](https://developers.cloudflare.com/workers/)
