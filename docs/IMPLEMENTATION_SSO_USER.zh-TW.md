[English](IMPLEMENTATION_SSO_USER.md) | 繁體中文

# SSO 使用者自動建立 — 歷史實作紀錄

> **歷史設計紀錄。** 本文件說明 SSO 使用者自動建立在當初開發時的設計與思路，*並非* 目前
> 執行期驗證的權威描述——若需權威說明，請一律參考 [驗證](AUTHENTICATION.zh-TW.md)。
> 此處描述的行為已對照 migration `0002`／`0003`、user service 與 auth middleware 驗證過，但請
> 將其視為背景脈絡，而非維運指南。

## 範圍與狀態

在這項工作之前，SSO 登入只會驗證傳入的權杖，並將解碼後的 claims 存入請求 context；`users`
資料表始終為空。此變更讓每次成功的 SSO 登入都會持久化（建立或更新）`users` 中對應的一列。
以下紀錄它如何建置、為何如此設計，並誠實描述持久化失敗時的退回行為。

## 實作了什麼

- 在 `users` 資料表上建立通用的 SSO 身分模型（`sso_provider`、`sso_id`）。
- 於 user service 實作具冪等性的 `upsertUser()`：首次登入建立使用者，後續登入更新少量欄位。
- 將 `upsertUser()` 整合進 `authMiddleware` 與 `optionalAuthMiddleware`。
- 更新型別，讓持久化後的 user id 與 role 能在請求 context 中流通。

## 結構變更：Migration 0002 與 0003

Migration `0002` 新增通用 SSO 欄位，重建非唯一 email index，但此時欄位層級的 `UNIQUE`
constraint 仍然存在；它也在 `(sso_provider, sso_id)` 上建立一個**部分**唯一索引：

```sql
ALTER TABLE users ADD COLUMN sso_provider TEXT;
ALTER TABLE users ADD COLUMN sso_id TEXT;

DROP INDEX IF EXISTS idx_users_email;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_sso_provider_id
  ON users(sso_provider, sso_id)
  WHERE sso_provider IS NOT NULL AND sso_id IS NOT NULL;
```

SQLite 的 `ON CONFLICT` 無法指向**部分**索引，因此 migration `0003` 重建資料表、移除欄位層級
的 `email` 唯一性，改用真正的 `UNIQUE(sso_provider, sso_id)` 約束，並加上 `CHECK` 讓兩個
SSO 欄位維持「同為 `NULL`」或「同時設值」。它只複製已符合該 check 的列，因此不一致的列會使
migration 中止，而非破壞資料：

```sql
CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT,
  entra_id TEXT UNIQUE,
  name TEXT,
  role TEXT DEFAULT 'user',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER,
  is_active INTEGER DEFAULT 1,
  sso_provider TEXT,
  sso_id TEXT,
  UNIQUE(sso_provider, sso_id),
  CHECK (
    (sso_provider IS NULL AND sso_id IS NULL)
    OR
    (sso_provider IS NOT NULL AND sso_id IS NOT NULL)
  )
);
-- 複製有效列、卸除舊表、將 users_new 更名為 users、重建索引
```

## Upsert 行為

`upsertUser()`（`src/backend/src/services/user.ts`）會先驗證輸入，接著執行單一原子的
`INSERT ... ON CONFLICT (sso_provider, sso_id) DO UPDATE`。首次登入以 `nanoid` id、預設角色與
登入時間戳插入新列；回訪登入則更新 `email`、`name`、`last_login_at` 與 `updated_at`，同時保留
`role`、`sso_provider`、`sso_id` 與 `created_at`。使用單一原子語句可避免先讀後寫的競態：

```sql
INSERT INTO users (
  id, email, name, sso_provider, sso_id,
  created_at, updated_at, last_login_at, is_active, role
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
ON CONFLICT (sso_provider, sso_id) DO UPDATE SET
  email = excluded.email,
  name = excluded.name,
  last_login_at = excluded.last_login_at,
  updated_at = excluded.updated_at
RETURNING *;
```

## Auth Middleware 整合

在 `src/backend/src/middleware/auth.ts` 中，兩個 middleware 都會在權杖驗證後呼叫
`upsertUser()`，以 `'entra'` 作為供應者、以權杖的 object id 作為 `sso_id`。成功時會將資料庫的
user id（`dbUserId`）與儲存的 `role` 補充進請求 context。

## 型別變更

`src/backend/src/types/index.ts` 反映了結構：`User` 介面帶有 `sso_provider` 與 `sso_id`，而
`JWTPayload` 新增可選的 `dbUserId`，讓下游 handler 能從 context 讀取持久化後的身分。

## 設計理由

- **採用通用 SSO 欄位而非各供應者專屬欄位**，可在新增供應者時維持結構穩定——接上另一個身分
  來源不需要 migration。
- **`(sso_provider, sso_id)` 的複合唯一性**可避免重複身分，同時允許同一 email 存在於不同供應者。
- **`CHECK`／非空成對**可避免只填一半的 SSO 狀態；`0002` 的部分索引歷史也解釋了為何 `0003`
  必須為 `ON CONFLICT` 重建資料表。

## 目前行為與失敗退回

持久化採盡力而為，且刻意設計為非致命。若 `upsertUser()` 拋出例外，auth middleware 會記錄
錯誤，並退回使用已驗證的權杖 payload，**但不包含** `dbUserId` 或資料庫 `role`；
`optionalAuthMiddleware` 則單純繼續執行、不在 context 設定使用者。換言之，資料庫小故障會使
補充資訊退化，但不會阻擋一個權杖本身有效的請求。因此需要 `dbUserId` 或 `role` 的下游程式碼
必須容忍它們不存在。

## 測試

user service 及其 middleware 整合，由 `src/backend/src/services/__tests__/` 下的 Vitest 套件
（`user.test.ts`、`user.integration.test.ts`）與 `src/backend/src/middleware/__tests__/auth.test.ts`
涵蓋，測試首次登入建立、回訪登入更新，以及失敗退回路徑。以 `npm run test:backend` 執行。

## 相關文件

- [README](../README.zh-TW.md)
- [架構](ARCHITECTURE.zh-TW.md)
- [驗證](AUTHENTICATION.zh-TW.md)
