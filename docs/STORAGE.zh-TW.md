[English](STORAGE.md) | 繁體中文

# AkaMoney 儲存參考文件

## 總覽

管理 API 透過 `src/backend/src/services/storage` 內的 `StorageProvider` 抽象層操作物件儲存。目前支援：

- Cloudflare R2（預設）
- Azure Blob Storage（可選）

轉址 Worker 不會使用物件儲存。

## Provider 選擇

### 執行期規則

Storage factory 依下列順序解析 provider：

1. `STORAGE_PROVIDER` 選擇 `r2` 或 `azure`
2. 若未設定，預設值是 `r2`
3. `CDN_URL` 會覆蓋兩個 provider 的 provider-specific public URL

### 程式碼實際消費的設定

目前只有下列執行期輸入會被程式碼真正讀取：

| 輸入 | 類型 | 使用位置 | 說明 |
| --- | --- | --- | --- |
| `STORAGE_PROVIDER` | env var | Factory | `r2` 或 `azure`，不分大小寫 |
| `BUCKET` | Worker binding | R2 provider | R2 模式必填 |
| `R2_PUBLIC_URL` | env var | R2 provider | 可選的公開 base URL |
| `AZURE_STORAGE_ACCOUNT` | env var | Azure provider | Azure 模式必填 |
| `AZURE_STORAGE_CONTAINER` | env var | Azure provider | Azure 模式必填 |
| `AZURE_STORAGE_SAS_TOKEN` | env var | Azure provider | Azure 模式必填 |
| `AZURE_PUBLIC_URL` | env var | Azure provider | 可選的明確公開 URL |
| `CDN_URL` | env var | 兩種 provider | 覆蓋 `R2_PUBLIC_URL` 與 `AZURE_PUBLIC_URL` |

只出現在範例檔、但執行期程式碼沒有讀取的變數，不應視為實際 consumed configuration。例如後端實際讀的是 `BUCKET` binding，而不是 `R2_BUCKET_NAME`。

```env
STORAGE_PROVIDER=r2
R2_PUBLIC_URL=https://storage.example.com
AZURE_STORAGE_ACCOUNT=<azure-account>
AZURE_STORAGE_CONTAINER=<azure-container>
AZURE_STORAGE_SAS_TOKEN=<azure-sas-token>
AZURE_PUBLIC_URL=https://blob.example.com/container
CDN_URL=https://cdn.example.com
```

## Provider 行為

### R2

- 需要 `BUCKET` Worker binding
- 透過 `bucket.put(...)` 上傳
- 透過 `bucket.list(...)` 列表
- 只有在設定 `CDN_URL` 或 `R2_PUBLIC_URL` 時，才會回傳公開 URL

若 `CDN_URL` 與 `R2_PUBLIC_URL` 都不存在，上傳仍會成功，但 API 回應中的 `url` 會是 `undefined`。

### Azure Blob Storage

- 需要 `AZURE_STORAGE_ACCOUNT`、`AZURE_STORAGE_CONTAINER` 與 `AZURE_STORAGE_SAS_TOKEN`
- 透過直接 REST 呼叫操作 Azure Blob Storage
- 若有設定 `AZURE_PUBLIC_URL` 就優先使用它
- 否則退回不帶 SAS token 的 container URL

這個 fallback URL 只有在 container 本身可公開讀取時才真正可用。若 container 不是公開的，上傳仍然可能成功，但回傳的 URL 不會是可靠的公開資產 URL。

## 管理 API 端點

| 路由 | 驗證 | 用途 |
| --- | --- | --- |
| `GET /api/storage/config` | 必填 | 回報目前選定 provider 是否已配置完成 |
| `POST /api/storage/upload` | 必填 | 上傳一張圖片 |
| `GET /api/storage/files/:key{.+}` | 必填 | 讀取單一檔案 key 的 metadata |
| `GET /api/storage/files` | 必填 | 列出目前使用者前綴下的檔案 |
| `DELETE /api/storage/files/:key{.+}` | 必填 | 刪除單一檔案 key |

## 上傳規則

### 接受的 MIME Types

上傳路由只允許：

- `image/jpeg`
- `image/png`
- `image/gif`
- `image/webp`
- `image/svg+xml`

### 大小上限

目前路由會強制檔案最大為 `10 MB`。

### Key 產生方式

所有上傳檔案都會寫進使用者專屬前綴：

- `uploads/<user-id>/<timestamp>-<uuid>.<extension>`

副檔名來自已驗證的 MIME type，而不是只看原始檔名。

### 寫入的 Metadata

管理 API 上傳時會額外附加 custom metadata：

- `originalName`
- `uploadedBy`
- `uploadedAt`

## 檔案擁有權與 Catch-All Key

檔案 metadata 與刪除路由都使用 catch-all 路徑模式 `:key{.+}`。這代表：

- key 可以包含 `/`
- 後端會把解析後的 key 與 `uploads/<user-id>/` 比對
- 呼叫者不能讀取或刪除自己前綴之外的檔案

## 公開 URL 要求

儲存 API 即使沒有 public URL 仍可運作，但若要讓管理體驗完整可用，實際上仍需要 public URL：

- 上傳後的圖片 URL 會被寫回短網址記錄的 `image_url`
- 前端預覽與編輯流程需要可用 URL 才能顯示圖片
- `GET /api/storage/config` 透過 `hasPublicUrl` 告知 UI 目前 provider 是否具備公開 URL

實務上：

- 若想無論 provider 為何都共用同一個公開主機名，請設定 `CDN_URL`
- 若使用 R2，則設定 `R2_PUBLIC_URL`
- 若使用 Azure，則設定 `AZURE_PUBLIC_URL`，或提供可公開存取的 Azure container 路徑

## 儲存回應說明

### `GET /api/storage/config`

會回傳：

- `configured`：目前選定 provider 的必需 binding / secret 是否齊全
- `provider`：解析後的 provider 名稱
- `hasPublicUrl`：在套用 `CDN_URL` 優先權後，是否成功解析到公開 URL

### `POST /api/storage/upload`

會回傳：

- `key`
- `url?`
- `size?`
- `contentType`
- `originalName`

以下使用 Windows 命令提示字元的續行語法。請將 `TOKEN_VALUE` 替換為 Microsoft Entra 存取權杖。

```bat
curl -X POST "https://api.example.com/api/storage/upload" ^
  -H "Authorization: Bearer TOKEN_VALUE" ^
  -F "file=@banner.webp"
```

POSIX 等效指令：

```bash
curl -X POST "https://api.example.com/api/storage/upload" -H "Authorization: Bearer TOKEN_VALUE" -F "file=@banner.webp"
```

### `GET /api/storage/files/:key{.+}`

只回傳 metadata：

- `key`
- `size`
- `lastModified?`
- `contentType?`
- `url?`

### `GET /api/storage/files`

- `limit` 預設為 `50`
- `limit` 最大會 clamp 到 `100`
- 列表範圍固定限制在 `uploads/<user-id>/...`
- 回傳 `hasMore` 與可選的分頁 `cursor`

### `DELETE /api/storage/files/:key{.+}`

只回傳成功訊息，不會代理回傳被刪除物件的內容。

## 相關文件

- [專案 README](../README.zh-TW.md)
- [API 參考](API.zh-TW.md)
- [架構](ARCHITECTURE.zh-TW.md)
- [驗證](AUTHENTICATION.zh-TW.md)
- [資料庫](DATABASE.zh-TW.md)
