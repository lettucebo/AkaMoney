[English](DATABASE.md) | 繁體中文

# AkaMoney 資料庫參考文件

## 總覽

AkaMoney 使用單一 Cloudflare D1 資料庫，且由兩個 Worker 共用：

- 管理 API Worker 負責連結、使用者、分析查詢、儲存 metadata 查詢與保留清理
- 轉址 Worker 負責解析啟用中的短碼，也會寫入點擊遙測

所有持久化時間戳都以 epoch 毫秒儲存。

## 綁定拓樸

### 共用的 `DB` Binding

兩個 Worker 程式碼都預期存在名為 `DB` 的 D1 綁定：

- `src/backend/wrangler.toml`
- `src/redirect/wrangler.toml`

正因為共用這個 binding，連結狀態、點擊追蹤、公開轉址與管理分析才能保持一致。

### 擁有權邊界

Schema 本身是共用的，但擁有權規則在應用程式碼中：

- `urls.user_id` 用來限制管理端存取範圍
- `click_records.url_id` 與 `click_records.short_code` 把遙測資料綁回某個短網址
- `users` 儲存 Admin API 用的 Entra 身分 metadata

## Schema 演進

### Migration `0001_initial_schema.sql`

初始 schema 建立：

- 建立 `urls`
- 建立 `click_records`
- 建立 `users`
- 建立常用查詢路徑的索引

這個 migration 的重要索引：

- `idx_urls_short_code`
- `idx_urls_user_id`
- `idx_urls_created_at`
- `idx_clicks_url_id`
- `idx_clicks_short_code`
- `idx_clicks_clicked_at`
- `idx_users_email`
- `idx_users_entra_id`

### Migration `0002_add_sso_provider.sql`

SSO 擴充：

- 新增 `sso_provider`
- 新增 `sso_id`
- 移除並重建原本就非唯一的 `idx_users_email`；此階段欄位層級的 `UNIQUE` constraint 仍然存在
- 為 `(sso_provider, sso_id)` 加上 partial unique index
- 保留 `entra_id` 以維持相容性

對應說明文件：[0002_add_sso_provider.md](../src/backend/migrations/0002_add_sso_provider.md)

### Migration `0003_fix_sso_unique_constraint.sql`

為了 SQLite / D1 upsert 相容性而重建 users 表：

- 以表層級 `UNIQUE(sso_provider, sso_id)` 重新建立 `users`
- 在重建資料表時移除舊的欄位層級 `email` 唯一性
- 新增 `CHECK` constraint，要求兩個 SSO 欄位必須同時為 null 或同時非 null
- 把一致的舊資料搬到重建後的表中
- 重建 `idx_users_email` 與 `idx_users_entra_id`

對應說明文件：[0003_fix_sso_unique_constraint.md](../src/backend/migrations/0003_fix_sso_unique_constraint.md)

### Migration `0004_add_image_url.sql`

短網址預覽圖支援：

- 對 `urls` 新增 `image_url`

這個 migration 目前在儲存庫中沒有對應的 markdown 說明檔。

## 目前資料表

### `urls`

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `TEXT` | 主鍵 |
| `short_code` | `TEXT` | Schema 層級唯一性是區分大小寫的，但建立與轉址查詢會在程式碼中額外做不分大小寫檢查 |
| `original_url` | `TEXT` | 必填的目的 URL |
| `user_id` | `TEXT` | 可為 null 的擁有者參照；匿名建立的短網址會保留 null |
| `title` | `TEXT` | Nullable |
| `description` | `TEXT` | Nullable |
| `image_url` | `TEXT` | 由 migration 0004 新增 |
| `created_at` | `INTEGER` | Epoch 毫秒 |
| `updated_at` | `INTEGER` | Epoch 毫秒 |
| `expires_at` | `INTEGER` | Nullable epoch 毫秒 |
| `is_active` | `INTEGER` | `1` 或 `0` |
| `click_count` | `INTEGER` | 由轉址 Worker 增量更新的反正規化計數器 |

### `click_records`

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `TEXT` | 主鍵 |
| `url_id` | `TEXT` | 指向 `urls(id)` 的外鍵，帶 `ON DELETE CASCADE` |
| `short_code` | `TEXT` | 提供給 analytics 查詢的快取副本 |
| `clicked_at` | `INTEGER` | Epoch 毫秒 |
| `ip_address` | `TEXT` | Nullable |
| `user_agent` | `TEXT` | Nullable |
| `referer` | `TEXT` | Nullable |
| `country` | `TEXT` | Nullable |
| `city` | `TEXT` | Nullable |
| `device_type` | `TEXT` | Nullable |
| `browser` | `TEXT` | Nullable |
| `os` | `TEXT` | Nullable |

### `users`

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `TEXT` | 主鍵 |
| `email` | `TEXT` | 有索引，但不再唯一 |
| `password_hash` | `TEXT` | 欄位仍存在，但正式驗證流程未使用 |
| `entra_id` | `TEXT` | 為了相容性保留的舊唯一欄位 |
| `name` | `TEXT` | Nullable |
| `role` | `TEXT` | 預設 `"user"` |
| `created_at` | `INTEGER` | Epoch 毫秒 |
| `updated_at` | `INTEGER` | Epoch 毫秒 |
| `last_login_at` | `INTEGER` | Nullable epoch 毫秒 |
| `is_active` | `INTEGER` | `1` 或 `0` |
| `sso_provider` | `TEXT` | Nullable；與 `sso_id` 一起構成表層級唯一約束 |
| `sso_id` | `TEXT` | Nullable；與 `sso_provider` 一起構成表層級唯一約束 |

## 共用 Worker 行為

### 管理 API Worker

管理 Worker 會執行：

- 所有短網址 CRUD 寫入
- Entra 使用者 upsert
- analytics 與 stats 讀取
- 每日與手動的保留清理

### 轉址 Worker

轉址 Worker 會執行：

- 對啟用中的短碼做不分大小寫讀取
- 向 `click_records` 插入資料
- 對 `urls` 做 `click_count` 增量更新

這表示轉址路徑在資料庫層級上並非只讀，即使有些設定註解把它描述成 read-only。

## 保留與清理

- 點擊紀錄保留期預設為 `365` 天
- 管理 Worker 的 cron 每天 `02:00 UTC` 執行
- 相同清理邏輯也對外提供 `POST /api/admin/cleanup`

Cleanup 會刪除 `clicked_at` 早於計算 cutoff timestamp 的 `click_records` 資料列。

## 安全的本地與遠端工作流程

請從 `src/backend` 目錄執行 D1 指令，並使用 binding 名稱 `DB`，不要依賴過時的 npm script 目標。

```bash
cd src/backend
npx wrangler d1 migrations apply DB --local --config wrangler.local.toml
npx wrangler d1 execute DB --local --config wrangler.local.toml --command "SELECT COUNT(*) AS url_count FROM urls"
```

```bash
cd src/backend
npx wrangler d1 migrations apply DB --remote --config wrangler.toml
npx wrangler d1 execute DB --remote --config wrangler.toml --command "SELECT COUNT(*) AS url_count FROM urls"
```

已追蹤的 `wrangler.toml` 中 `database_id` 是空值；手動執行遠端指令前必須先填入。Release workflow 會自動注入正式環境 ID。

### 為什麼不建議使用儲存庫中的 `db:*` Scripts

`src/backend/package.json` 內的 `db:*` scripts 仍然把目標寫成 `akamoney`，但 Worker 設定實際綁定的資料庫名稱是 `akamoney-clicks`。在這兩者對齊前，請優先使用上面的明確 `DB`-binding 工作流程。

## 本地與遠端注意事項

### `--local`

- 使用綁在 `wrangler.local.toml` 上的本地 D1 狀態
- 適合先安全驗證 migration 與臨時查詢
- 不能證明正式資料一定乾淨，也不能證明正式憑證一定正確

### `--remote`

- 直接指向部署中 Worker binding 背後的真實 Cloudflare D1 資料庫
- 應視為會影響正式環境的操作
- 在執行破壞性手動操作或 schema 變更前，應先跑備份／匯出流程

## 相關文件

- [專案 README](../README.zh-TW.md)
- [架構](ARCHITECTURE.zh-TW.md)
- [驗證](AUTHENTICATION.zh-TW.md)
- [儲存](STORAGE.zh-TW.md)
- [安裝與設定](SETUP.zh-TW.md)
