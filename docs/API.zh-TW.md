[English](API.md) | 繁體中文

# AkaMoney API 參考文件

## 範圍與基礎 URL

AkaMoney 對外提供兩個 HTTP 服務：

| 服務 | 執行環境 | 基礎 URL 角色 | 驗證 |
| --- | --- | --- | --- |
| 管理 API Worker | Cloudflare Workers 上的 Hono | 管理、分析、儲存、清理 | 依路由而定 |
| 轉址 Worker | Cloudflare Workers 上的 Hono | 公開短網址解析 | 無 |

儲存庫本身沒有硬編碼唯一正式網域。以下範例使用 `https://api.example.com` 與 `https://go.example.com` 之類的占位值。

## 線上協定慣例

- 受保護的管理 API 請求使用 Microsoft Entra ID 簽發的 bearer token。
- 所有持久化時間戳都使用 epoch 毫秒。
- 總覽統計的日期篩選使用 `YYYY-MM-DD` 格式的 UTC 含首尾日期。
- 管理 API 目前回傳的 `short_url` 是裸短碼，不是完整絕對 URL。
- 5xx responses 會被 sanitize 且保持 generic；不得包含 stack traces、raw exception details、tokens 或供應商診斷。4xx responses 可以保留安全的驗證細節。

```http
Authorization: Bearer TOKEN_VALUE
```

## 驗證矩陣

| 路由 | 驗證類型 | 目前行為 |
| --- | --- | --- |
| `GET /health`（管理端） | 公開 | 永遠不需驗證 |
| `POST /api/shorten` | 可選驗證 | 可匿名呼叫；若 bearer token 有效，會把新短網址綁到已驗證的 Entra 使用者；若可選 token 無效，請求會忽略該 token 並以匿名方式繼續 |
| `GET /api/urls` | 受保護 | 必須帶 Entra bearer token |
| `GET /api/urls/:id` | 受保護 | 必須帶 Entra bearer token |
| `PUT /api/urls/:id` | 受保護 | 必須帶 Entra bearer token |
| `DELETE /api/urls/:id` | 受保護 | 必須帶 Entra bearer token |
| `GET /api/analytics/:shortCode` | 受保護 | 必須帶 Entra bearer token |
| `GET /api/public/analytics/:shortCode` | 公開 | 僅回傳受限欄位 |
| `GET /api/stats/overall` | 受保護 | 必須帶 Entra bearer token |
| `POST /api/admin/cleanup` | 受保護 | 必須帶 Entra bearer token；目前沒有角色檢查 |
| `GET /api/storage/config` | 受保護 | 必須帶 Entra bearer token |
| `POST /api/storage/upload` | 受保護 | 必須帶 Entra bearer token |
| `GET /api/storage/files/:key{.+}` | 受保護 | 必須帶 Entra bearer token |
| `GET /api/storage/files` | 受保護 | 必須帶 Entra bearer token |
| `DELETE /api/storage/files/:key{.+}` | 受保護 | 必須帶 Entra bearer token |
| `OPTIONS *`（轉址端） | 公開 | CORS 預檢輔助路由 |
| `GET /health`（轉址端） | 公開 | 永遠不需驗證 |
| `GET /:shortCode` | 公開 | 永遠不需驗證 |

## 共用 Payload 形狀

### URL 資源

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `string` | 由伺服器產生 |
| `short_code` | `string` | 建立時以不分大小寫方式檢查唯一性 |
| `original_url` | `string` | 必須能解析為 `http:` 或 `https:` |
| `short_url` | `string` | 目前實作回傳裸短碼 |
| `title` | `string \| undefined` | 當資料庫值為 `NULL` 時省略 |
| `description` | `string \| undefined` | 當資料庫值為 `NULL` 時省略 |
| `image_url` | `string \| undefined` | 有儲存連結預覽圖時才會出現 |
| `created_at` | `number` | Epoch 毫秒 |
| `updated_at` | `number` | Epoch 毫秒 |
| `expires_at` | `number \| undefined` | Epoch 毫秒；為 `NULL` 時省略 |
| `is_active` | `boolean` | 由資料庫中的 `INTEGER` 旗標轉換而來 |
| `click_count` | `number` | `urls` 表上的反正規化計數器 |

### `CreateUrlRequest`

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `original_url` | `string` | 是 | 必須是 `http` 或 `https` URL |
| `short_code` | `string` | 是 | 先 `trim()`，再套用 `^[a-zA-Z0-9-_]{3,20}$` 驗證 |
| `title` | `string` | 否 | 省略或 falsy 時會存成 `NULL` |
| `description` | `string` | 否 | 省略或 falsy 時會存成 `NULL` |
| `image_url` | `string` | 否 | 省略或 falsy 時會存成 `NULL` |
| `expires_at` | `number` | 否 | Epoch 毫秒 |

```json
{
  "original_url": "https://example.com/articles/launch",
  "short_code": "launch-2026",
  "title": "Launch article",
  "description": "Campaign landing page",
  "image_url": "https://cdn.example.com/uploads/<user-id>/cover.png",
  "expires_at": 1798761600000
}
```

### `UpdateUrlRequest`

`updateUrl` 會把所有值不為 `undefined` 的欄位寫回資料庫。

- 略過某欄位：保留原值不變。
- 對 `title`、`description`、`image_url`、`expires_at` 傳 `null`：清空該欄位。
- `original_url` 不能用 `null` 清空；只能省略，或改成另一個有效 URL 字串。

```json
{
  "title": null,
  "description": "Updated copy",
  "image_url": null,
  "expires_at": null,
  "is_active": false
}
```

### Analytics 形狀

`GET /api/analytics/:shortCode` 會回傳：

- `url`：上面的 URL 資源形狀
- `total_clicks`：從 `click_records` 計出的總數
- `clicks_by_date`：只涵蓋最近 30 天的稀疏日期 map
- `clicks_by_country`：前 10 名國家，稀疏
- `clicks_by_device`：裝置類型計數，稀疏
- `clicks_by_browser`：前 5 名瀏覽器，稀疏
- `recent_clicks`：最多 20 筆最近原始點擊紀錄

`GET /api/public/analytics/:shortCode` 刻意只回傳：

| 欄位 | 型別 |
| --- | --- |
| `short_code` | `string` |
| `total_clicks` | `number` |
| `created_at` | `number` |

### 總覽統計形狀

`GET /api/stats/overall` 會回傳：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `total_clicks` | `number` | 所選含首尾區間內的點擊數 |
| `active_links` | `number` | 該帳戶下仍為啟用狀態的連結數 |
| `total_links` | `number` | 該帳戶下的全部連結數 |
| `click_trend` | `Record<string, number>` | 稀疏的 `YYYY-MM-DD` map |
| `top_links` | `Array<{ short_code, original_url, click_count, title? }>` | service 輸出已依點擊數排序 |
| `country_distribution` | `Record<string, number>` | 稀疏 |
| `device_distribution` | `Record<string, number>` | 稀疏 |
| `date_range.start` | `string` | 含首尾的 UTC 日期 |
| `date_range.end` | `string` | 含首尾的 UTC 日期 |

### 儲存 API 形狀

| 路由 | 成功回應形狀 |
| --- | --- |
| `GET /api/storage/config` | `{ configured, provider, hasPublicUrl }` |
| `POST /api/storage/upload` | `{ key, url?, size?, contentType, originalName }` |
| `GET /api/storage/files/:key{.+}` | `{ key, size, lastModified?, contentType?, url? }` |
| `GET /api/storage/files` | `{ files: Array<{ key, size, lastModified?, contentType?, url? }>, hasMore, cursor? }` |
| `DELETE /api/storage/files/:key{.+}` | `{ message }` |

## 轉址 Worker 路由

### `OPTIONS *`

| 項目 | 行為 |
| --- | --- |
| 用途 | 公開 CORS 預檢輔助路由 |
| 成功 | `204 No Content`，空字串 body |
| 說明 | 轉址 Worker 也會在每個請求後附加 `Access-Control-Allow-Origin: *`、`Access-Control-Allow-Methods: GET, OPTIONS`、`Access-Control-Allow-Headers: Content-Type` |

### `GET /health`

| 項目 | 行為 |
| --- | --- |
| 成功 | `200 OK`，回傳 `{ status: "ok", service: "redirect", timestamp }` |
| 錯誤 | 只有 Worker 本身丟出非預期錯誤時，才會落到全域 `500` 處理器 |

### `GET /:shortCode`

| 項目 | 行為 |
| --- | --- |
| 查詢方式 | 對 D1 查 `LOWER(short_code) = LOWER(?)` 且 `is_active = 1` |
| 成功 | `302 Found` 轉址到 `original_url` |
| `404` | 找不到啟用中的短碼時回傳 |
| `410` | 找到網址但 `expires_at < Date.now()` 時回傳 |
| 點擊追蹤 | 透過 `executionCtx.waitUntil(...)` 非同步寫入點擊並增加 `urls.click_count`，避免延後轉址 |
| 錯誤 | 非預期失敗會落到 Worker 層級的 `500` JSON 錯誤處理器 |

## 管理 Worker 路由

### `GET /health`

| 項目 | 行為 |
| --- | --- |
| 成功 | `200 OK`，回傳 `{ status: "ok", service: "admin-api", timestamp }` |
| 錯誤 | 只有非預期 Worker 失敗才會出現 `500` |

### `POST /api/shorten`

| 項目 | 行為 |
| --- | --- |
| 驗證 | 可選 |
| Request body | `CreateUrlRequest` |
| 成功 | `201 Created`，回傳 URL 資源 |
| 目前驗證錯誤行為 | 缺少 `original_url` 會回 `400`；其他安全的驗證或衝突錯誤可回語意化 4xx 並附驗證細節。非預期失敗會回 sanitized generic 5xx response。 |
| DB 設定失敗 | 當 `DB` 綁定不存在時回傳 sanitized `500`；不回傳 stack trace 或 raw exception details。 |
| 說明 | 目前程式碼實際上把 `short_code` 視為必填，雖然舊文件曾寫成可選 |

### `GET /api/urls`

| 項目 | 行為 |
| --- | --- |
| 驗證 | 必填 |
| 查詢參數 | `page` 預設 `1`；`limit` 預設 `20` |
| 分頁行為 | 值會用 `parseInt(...)` 解析後直接往下傳，不會額外 clamp；格式錯誤時可能引發資料庫錯誤並變成 `500` |
| 成功 | `200 OK`，回傳 `{ data, pagination }` |
| 擁有權模型 | 只回傳 `user_id` 等於目前 Entra 使用者 ID 的資料列 |
| 錯誤 | 缺少驗證會回 `401`；缺少 `DB` 會回 `500`；其他 service 或 D1 失敗會回 `500` |

### `GET /api/urls/:id`

| 項目 | 行為 |
| --- | --- |
| 驗證 | 必填 |
| 成功 | `200 OK`，回傳 URL 資源 |
| 目前回應缺漏 | 此 route 以 inline 方式組裝回應，即使資料列有值也不會包含 `image_url` |
| `404` | 指定 URL ID 不存在時回傳 |
| `403` | 該資料列存在，但 `user_id` 屬於其他使用者時回傳 |
| 錯誤 | 缺少驗證會回 `401`；缺少 `DB` 會回 `500`；其他非預期失敗會回 `500` |

### `PUT /api/urls/:id`

| 項目 | 行為 |
| --- | --- |
| 驗證 | 必填 |
| Request body | `UpdateUrlRequest` |
| 成功 | `200 OK`，回傳更新後的 URL 資源 |
| 目前錯誤行為 | 安全的找不到、禁止存取與驗證失敗可回 4xx；非預期失敗會回 sanitized generic 5xx response。 |
| `null` 與 `undefined` | `null` 會清空 nullable 欄位；省略欄位則保留原值 |

### `DELETE /api/urls/:id`

| 項目 | 行為 |
| --- | --- |
| 驗證 | 必填 |
| 成功 | `200 OK`，回傳 `{ message: "URL deleted successfully" }` |
| 目前錯誤行為 | 安全的找不到與禁止存取失敗可回 4xx；非預期失敗會回 sanitized generic 5xx response。 |

### `GET /api/analytics/:shortCode`

| 項目 | 行為 |
| --- | --- |
| 驗證 | 必填 |
| 成功 | `200 OK`，回傳受保護的 analytics 形狀 |
| `404` | 短碼無法解析成啟用中的 URL 時回傳 |
| 目前擁有權錯誤行為 | 擁有權檢查在 service 層進行；安全的 forbidden 失敗可回 4xx，非預期失敗會回 sanitized generic 5xx response。 |
| 區間行為 | `clicks_by_date` 只涵蓋最近 30 天，且不會補零日期 |

### `GET /api/public/analytics/:shortCode`

| 項目 | 行為 |
| --- | --- |
| 驗證 | 公開 |
| 成功 | `200 OK`，僅回傳 `{ short_code, total_clicks, created_at }` |
| `404` | 短碼無法解析成啟用中的 URL 時回傳 |
| 說明 | 此路由不會暴露 `recent_clicks`、國家／裝置／瀏覽器分佈，也不會回傳目標網址 |

### `GET /api/stats/overall`

| 項目 | 行為 |
| --- | --- |
| 驗證 | 必填 |
| 查詢參數 | 可選 `startDate` 與 `endDate`，格式為 `YYYY-MM-DD` |
| UTC 含首尾行為 | 路由會把 `startDate` 擴成 `T00:00:00.000Z`，把 `endDate` 擴成 `T23:59:59.999Z` 再查詢 |
| 成對規則 | 兩個日期必須一起提供，或一起省略 |
| 預設區間 | 兩者都省略時，使用目前 UTC 月份 |
| 成功 | `200 OK`，回傳總覽統計形狀 |
| `400` | 只提供單邊日期、日期格式錯誤、或 `startDate > endDate` 時回傳 |
| 錯誤 | 其他失敗回 `500` |

### `POST /api/admin/cleanup`

| 項目 | 行為 |
| --- | --- |
| 驗證 | 必填 |
| 查詢參數 | 可選 `days`，預設 `365` |
| 成功 | `200 OK`，回傳 `{ message, deleted, cutoffDate, retentionDays }` |
| `400` | `days` 不是正整數，或大於 `3650` 時回傳 |
| 權限說明 | 程式碼註解提到未來可加上 admin 角色檢查，但目前任何已驗證使用者都能觸發 cleanup |
| 錯誤 | Service 失敗時回傳 sanitized generic 5xx response，不包含 stack trace 或 raw exception details。 |

### `GET /api/storage/config`

| 項目 | 行為 |
| --- | --- |
| 驗證 | 必填 |
| 成功 | `200 OK`，回傳儲存設定旗標 |
| `configured` 的意思 | 只有在目前選定 provider 需要的 binding / secret 都存在時才為 `true` |
| `hasPublicUrl` 的意思 | 代表 provider 選定後，再套用 `CDN_URL` 優先權後，是否成功解析到公開 URL |

### `POST /api/storage/upload`

| 項目 | 行為 |
| --- | --- |
| 驗證 | 必填 |
| Request body | `multipart/form-data`，必須包含 `file` 欄位 |
| MIME allowlist | `image/jpeg`、`image/png`、`image/gif`、`image/webp`、`image/svg+xml` |
| 大小上限 | `10 MB` |
| 產生的 key | `uploads/<user-id>/<timestamp>-<uuid>.<ext>` |
| 成功 | `201 Created`，回傳 `{ key, url?, size?, contentType, originalName }` |
| `400` | 缺少檔案、不支援的 MIME type、或檔案超過 `10 MB` |
| `500` | 儲存服務未設定，或上傳處理失敗 |
| 公開 URL 說明 | `url` 是可選欄位，因為 provider 可能沒有可解析的公開 URL |

以下使用 Windows 命令提示字元的續行語法。請將 `TOKEN_VALUE` 替換為 Microsoft Entra 存取權杖。

```bat
curl -X POST "https://api.example.com/api/storage/upload" ^
  -H "Authorization: Bearer TOKEN_VALUE" ^
  -F "file=@cover.png"
```

POSIX 等效指令：

```bash
curl -X POST "https://api.example.com/api/storage/upload" -H "Authorization: Bearer TOKEN_VALUE" -F "file=@cover.png"
```

### `GET /api/storage/files/:key{.+}`

| 項目 | 行為 |
| --- | --- |
| 驗證 | 必填 |
| 路由形狀 | `key` 是 catch-all 片段，因此可以包含 `/` |
| 擁有權規則 | `key` 必須以 `uploads/<user-id>/` 開頭 |
| 成功 | `200 OK`，回傳 metadata 與可選 `url` |
| `403` | `key` 不屬於目前使用者前綴時回傳 |
| `404` | `key` 屬於目前使用者前綴，但物件不存在時回傳 |
| `500` | 儲存服務未設定，或 provider 存取失敗 |

### `GET /api/storage/files`

| 項目 | 行為 |
| --- | --- |
| 驗證 | 必填 |
| 查詢參數 | 可選 `limit`、可選 `cursor` |
| `limit` 行為 | 預設 `50`；`<= 0` 或非數字時退回 `50`；大於 `100` 時 clamp 到 `100` |
| 前綴範圍 | 永遠只列出 `uploads/<user-id>/...` |
| 成功 | `200 OK`，回傳 `{ files, hasMore, cursor? }` |
| `500` | 儲存服務未設定，或 provider 列表操作失敗 |

### `DELETE /api/storage/files/:key{.+}`

| 項目 | 行為 |
| --- | --- |
| 驗證 | 必填 |
| 擁有權規則 | `key` 必須以 `uploads/<user-id>/` 開頭 |
| 成功 | `200 OK`，回傳 `{ message: "File deleted successfully" }` |
| `403` | `key` 不屬於目前使用者前綴時回傳 |
| `500` | 儲存服務未設定，或 provider 刪除失敗 |

## 目前錯誤封包說明

- `authMiddleware` 對缺少／無效 bearer header 與無效或過期的 Entra token 會回 `401`。
- 5xx responses 會被 sanitize 且保持 generic；不包含 stack traces、raw exception details、tokens 或供應商診斷。
- 4xx responses 可以保留安全的驗證細節，例如不會揭露 secrets 的 invalid input messages。

## 相關文件

- [專案 README](../README.zh-TW.md)
- [架構](ARCHITECTURE.zh-TW.md)
- [驗證](AUTHENTICATION.zh-TW.md)
- [資料庫](DATABASE.zh-TW.md)
- [儲存](STORAGE.zh-TW.md)
