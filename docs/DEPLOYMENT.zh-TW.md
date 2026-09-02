[English](DEPLOYMENT.md) | 繁體中文

# 部署指南

本文件說明 AkaMoney 的正式環境部署架構、GitHub Actions CI/CD 發布工作流程（`.github/workflows/release.yml`）、雲端資源自動佈建、密鑰配置、資料庫遷移及手動部署替代程序。

## 架構與發布概覽

AkaMoney 部署於 Cloudflare 開發者平台，由三個獨立服務所組成：

| 元件 | 目標平台 | 正式環境專案/服務名稱 | 路由/網域 |
|------|----------|----------------------|-----------|
| **前端 UI** | Cloudflare Pages | `akamoney-admin` | `admin.aka.money`（或 `*.pages.dev`） |
| **管理 API** | Cloudflare Workers | `akamoney-admin-api` | `api.aka.money`（或 `*.workers.dev`） |
| **重定向服務** | Cloudflare Workers | `akamoney-redirect` | `go.aka.money`（或 `*.workers.dev`） |

---

## 自動化 CI/CD 發布管線 (.github/workflows/release.yml)

正式環境發布透過 `.github/workflows/release.yml` 的 GitHub Actions 進行自動化。

### 工作流程觸發條件

發布管線只支援兩種觸發條件：

```yaml
on:
  push:
    tags:
      - '*.*.*'
  workflow_dispatch:
    inputs:
      release_ref:
        description: 'Commit to deploy: the literal "main", or an exact 40-character commit SHA already on main'
        required: true
        default: 'main'
        type: string
      confirm_production:
        description: 'Type DEPLOY_PRODUCTION exactly to confirm a production deployment'
        required: true
        type: string
```

1. **Tag Push (`push: tags: ['*.*.*']`)**：標準正式環境發布路徑（例如 `git tag 1.3.0 && git push origin 1.3.0`）。此 glob 僅為粗略前置過濾；`prepare-release` 另外要求 tag 必須是精確的 `MAJOR.MINOR.PATCH`（不得有 `v` 前綴或任何後綴），且該 commit 必須位於 `main` 上。
2. **手動觸發 (`workflow_dispatch`)**：必須從 `main` 分支啟動。`release_ref` 只接受字面值 `main` 或已存在於 `main` 的完整 40 字元 commit SHA；`confirm_production` 必須完全輸入 `DEPLOY_PRODUCTION`。

合併 Pull Request 不會部署任何東西：`main` 沒有 push 觸發條件，Pull Request 事件也完全無法啟動此工作流程。原本以標籤驅動的路徑（`pull_request_target` 觸發加上 `run-release` 標籤，會在持有 Cloudflare、Azure、Entra 與 Sentry 憑證的工作中建置並部署**未合併的 PR head commit**）已完全移除（issue #140）。

只有具備本存放庫寫入權限的帳號才能推送 tag 或手動觸發，且 `production` 部署仍需等待該 environment 的必要審核者核准。

### 發布信任邊界

`prepare-release` 是一個不持有任何憑證的工作，負責決定本次發布要部署哪一個 commit：

- 它**只**會將 `main` 檢出到 `.release-policy`（`fetch-depth: 0`）。此工作永遠不會把被發布的 ref 當成可執行程式碼檢出，因此 tag 或手動觸發無法自備審查自己的驗證器。
- 它執行受信任的 `.release-policy/.github/scripts/resolve-release-ref.mjs`。所有事件值（`github.event_name`、`github.ref_type`、`github.ref_name`、`github.sha` 與兩個 dispatch 輸入）都只透過 `env:` 傳入不經 shell 的 Node 程式碼；git 一律以固定 argv 陣列呼叫，任何 ref 名稱或輸入都不會被 shell 展開。
- 驗證器會以完整歷史 fetch `origin/main`（必要時將 shallow clone 展開），以 `^{commit}` 解析 annotated tag，將解析結果與 GitHub 回報的事件 SHA 交叉比對，使用 `git cat-file -e` 確認物件存在，並要求 `git merge-base --is-ancestor` 判定該 commit 位於 `origin/main` 上。「不是祖先」（exit 1）與 git 執行失敗（exit >1）會分開回報，避免基礎設施錯誤被誤判為政策結論。
- 此工作唯一的輸出就是不可變的 commit SHA。`build`、`deploy-admin-api` 與 `deploy-redirect` 都只檢出該 SHA；`deploy-frontend` 不檢出任何應用程式原始碼，只部署 `build` 由該 SHA 產生的 artifact。所有部署摘要也都回報該 SHA，而非原始事件 ref。
- 每個部署工作會先檢出已驗證的 commit，再加上來自 `main` 的受信任 `.release-policy` clone，並以 runner 預先安裝的 Node，在 `actions/setup-node`、`npm ci`（會執行被發布 commit 的 lifecycle scripts）與任何讀取 secret 的步驟**之前**，以 recheck 模式重新執行驗證器——因此在祖先關係重新確認前，連 npm cache 都不會以被選定的原始碼樹為索引鍵。這關閉了等待審核期間的偏移窗口。`deploy-frontend` 雖然只部署預先建置的 artifact、且完全不檢出應用程式原始碼，仍會在下載 artifact 或接觸憑證前執行相同的受信任檢出與 recheck。
- `concurrency: { group: release-production, cancel-in-progress: false }` 讓發布序列化，且不會中途取消進行中的部署。

`prepare-release` 沒有 environment、沒有任何 secret，權限僅 `contents: read`。`build` 同樣不持有任何部署憑證；正式環境 secrets 只出現在三個受審核者保護的 `environment: production` 工作中。

上述不變條件由 `src/backend/src/__tests__/release-ref-security.test.ts` 的測試強制驗證：測試會對臨時 git 儲存庫實際執行驗證器（惡意 tag、惡意 dispatch 輸入、annotated tag、非主線 commit、git 失敗），並檢查工作流程結構。

### 正式環境 Environment 保護政策

三個部署工作都宣告 `environment: production`，因此 GitHub environment 保護是信任邊界在平台端的另一半。預期設定如下：

| 設定 | 預期值 | 原因 |
|------|--------|------|
| 必要審核者 | 維護者（`lettucebo`） | 每次正式環境部署都必須有人確認。 |
| 部署 branch／tag 政策 | 自訂政策：branch `main` **與** tag `*.*.*` | 從其他 ref 觸發的手動執行或 tag 無法取得該 environment，即使該 ref 改寫了工作流程也一樣。 |
| Protected-branches 模式 | 不使用 | 本存放庫沒有任何 branch protection 規則，該模式會導致所有 ref 都不被允許。 |

**已驗證的目前狀態（2026-09-02）**：必要審核者（`lettucebo`）已設定、`prevent_self_review` 為 `false`、`can_admins_bypass` 為 `true`，而 `deployment_branch_policy` 為 `null`——上表的部署 branch／tag 政策**尚未套用**。在套用之前，ref 限制只由工作流程內部的檢查負責。

套用此政策屬於**經審查後由維護者／控制者執行的動作**，僅靠本次工作流程變更並不會自動設定。請先檢視現況再套用——environment 的 `PUT` 會整份取代設定，因此必須一併送出 `reviewers`，否則必要審核者會被移除：

```bash
# 1. 唯讀檢視目前狀態。
gh api repos/lettucebo/AkaMoney/environments/production

# 2. 啟用自訂部署政策，同時保留必要審核者。
#    environment-policy.json：
#    {
#      "wait_timer": 0,
#      "prevent_self_review": false,
#      "reviewers": [{ "type": "User", "id": 891383 }],
#      "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
#    }
gh api --method PUT repos/lettucebo/AkaMoney/environments/production --input environment-policy.json

# 3. 只允許發布用的 ref：預設分支與 SemVer 形狀的 tag。
gh api --method POST repos/lettucebo/AkaMoney/environments/production/deployment-branch-policies \
  -f name='main' -f type='branch'
gh api --method POST repos/lettucebo/AkaMoney/environments/production/deployment-branch-policies \
  -f name='*.*.*' -f type='tag'

# 4. 驗證。
gh api repos/lettucebo/AkaMoney/environments/production
gh api repos/lettucebo/AkaMoney/environments/production/deployment-branch-policies
```

`prevent_self_review` 刻意維持 `false`：維護者是唯一審核者，若開啟將導致所有發布都無法核准。這個取捨記錄在下方限制中，而不是隱瞞。

### 發布控制的已知限制

以下是確實存在且已記錄的落差，並非已解決的問題：

- **必要審核者是確認機制，而非獨立授權。** `production` environment 的審核者就是唯一的維護者，允許自我核准（`prevent_self_review: false`），且存放庫管理員可略過 environment 保護（`can_admins_bypass: true`）。
- **歷史工作流程。** 若對歷史 commit 新建一個 SemVer tag，執行的是**該 commit 當時**的工作流程檔案，包含本次強化之前的版本。tag pattern 與審核者都無法辨識工作流程的新舊，維護者必須自行拒絕這類執行。
- **信任同存放庫的寫入者。** 任何具寫入權限者都能推送 tag 或手動觸發；本存放庫目前沒有 branch protection 或 rulesets，因此這類帳號本來就能修改 `main`。本次修復移除的是**外部／未合併 PR head** 程式碼的執行路徑，並未嘗試限制受信任的寫入者。
- **Repository 範圍的 secrets。** `CLOUDFLARE_API_TOKEN` 與 `AZURE_STORAGE_SAS_TOKEN` 目前仍是 repository secrets，因此本存放庫中任何工作流程執行都可讀取，不僅限於 `environment: production` 的工作；目前只有 `SENTRY_AUTH_TOKEN` 是 environment 範圍。要遷移其餘 secrets 必須由維護者提供或重新產生替代值（GitHub secret 值為只寫，無法讀回複製），因此刻意**不**自動執行——僅憑名稱存在就刪除 repository 版本，可能直接讓正式環境部署失效。

### 管線執行順序與資源佈建

工作流程包含五個互相協調的 Job：

1. **`prepare-release` Job**（無 environment、無 secrets）：
   - 將 `main` 檢出至 `.release-policy`，並依上述規則驗證事件。
   - 輸出不可變、已確認位於主線的 commit SHA，供後續所有工作使用。

2. **`build` Job**：
   - 檢出已驗證的 commit SHA。
   - 於根目錄、後端、前端與重定向目錄安裝依賴。
   - 注入前端建置期環境變數（`VITE_ENTRA_ID_CLIENT_ID`、`VITE_ENTRA_ID_TENANT_ID`、`VITE_ENTRA_ID_REDIRECT_URI`、`VITE_API_URL`、`VITE_APP_NAME`、`VITE_SHORT_DOMAIN`、`VITE_ARCHIVED_REDIRECT_URL`）。
   - 建置前端靜態資源（`src/frontend/dist/`）並上傳 `frontend-dist` artifact。
   - 針對後端與重定向服務執行部署乾跑檢查（`wrangler deploy --dry-run`）。

3. **`deploy-admin-api` Job**（目標環境：`production`）：
   - 檢出已驗證的 commit，加上受信任的 `.release-policy` clone，並在安裝依賴或讀取任何 secret 之前重新確認主線祖先關係。
   - 在任何 Cloudflare 呼叫前驗證 `SENTRY_BACKEND_DSN`，並將 `src/backend/wrangler.toml` 的 `ENVIRONMENT` 寫死為 `"production"`，同時確認結果剛好只有一筆 production 指派。
   - 自動檢查 D1 資料庫 `akamoney-clicks` 是否存在；若不存在則透過 `wrangler d1 create` 自動建立。
   - 透過 `wrangler d1 list --json` 動態取得 D1 UUID 並注入至 `src/backend/wrangler.toml`：
     ```bash
     sed -i 's/^[[:space:]]*database_id[[:space:]]*=[[:space:]]*""/database_id = "'"${CLOUDFLARE_D1_DATABASE_ID}"'"/' src/backend/wrangler.toml
     ```
   - 檢查 R2 儲存貯體 `akamoney-storage` 是否存在；若不存在則透過 `wrangler r2 bucket create` 自動建立。
   - 注入 Worker 環境變數（`[vars]`）與 Worker Secrets（`wrangler secret put`）。
   - 透過 `cloudflare/wrangler-action@v3` 部署 Worker。

4. **`deploy-redirect` Job**（目標環境：`production`）：
   - 執行與 `deploy-admin-api` 相同的已驗證檢出與主線 recheck。
   - 在任何 Cloudflare 呼叫前驗證 `SENTRY_REDIRECT_DSN`，並將 `src/redirect/wrangler.toml` 的 `ENVIRONMENT` 寫死為 `"production"`。
   - 取得 `akamoney-clicks` 的 D1 資料庫 ID 並注入至 `src/redirect/wrangler.toml`。
   - 透過 `cloudflare/wrangler-action@v3` 部署重定向服務 Worker。

5. **`deploy-frontend` Job**（目標環境：`production`）：
   - 只檢出受信任的 `.release-policy` clone，並在接觸 artifact 或任何憑證前重新確認主線祖先關係；此工作永遠不檢出應用程式原始碼。
   - 下載 `frontend-dist` 建置產物。
   - 上傳並隨後刪除 hidden source maps（詳見 [Monitoring](MONITORING.zh-TW.md)）。
   - 確保 Pages 專案 `akamoney-admin` 存在（若無則透過 `wrangler pages project create` 建立）。
   - 透過 `wrangler pages deploy dist --project-name=akamoney-admin` 部署至 Cloudflare Pages。


---

## 環境設定：GitHub Secrets 與 Variables

請於 GitHub 存放庫的 **Settings > Secrets and variables > Actions** 中進行設定：

### Workflow Secrets

- `CLOUDFLARE_API_TOKEN`：具備 Workers、Pages、D1 與 R2 權限之 Cloudflare API Token（需包含 `Edit Cloudflare Workers`、`D1:Edit`、`R2:Edit`、`Pages:Edit` 權限）。目前存放為 **repository** secret。
- `SENTRY_AUTH_TOKEN`：**必要的 production environment secret。** 僅供受保護的前端部署工作上傳 source maps。請勿存為 repository secret，並應要求 production environment reviewer 核准。
- `ENTRA_ID_CLIENT_SECRET`：*（選填）* Release workflow 只會在此值存在時注入；runtime backend 不會讀取此值，也不會執行 SSO 權杖交換。目前**兩種範圍都未設定**；若日後要新增，請建立為 `production` environment secret。
- `AZURE_STORAGE_SAS_TOKEN`：*（選填）* Azure Blob Storage SAS 權杖（僅在 `STORAGE_PROVIDER=azure` 時需要）。目前存放為 **repository** secret。

> **Secret 範圍的據實說明**：目前只有 `SENTRY_AUTH_TOKEN` 屬於 `production` environment 範圍；`CLOUDFLARE_API_TOKEN` 與 `AZURE_STORAGE_SAS_TOKEN` 是 repository secrets。工作流程只會在宣告 `environment: production` 的工作中引用部署 secrets，但 repository secret 仍可被本存放庫中任何工作流程執行讀取。要把其餘 secrets 遷移到 environment 範圍，需要維護者提供替代值，因為 GitHub secret 值無法讀回複製。

### 必要與選填 Variables

- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 帳號 ID。
- `CLOUDFLARE_D1_DATABASE_ID`：*（選填）* 若需手動覆寫 D1 UUID 時填寫。
- `ENTRA_ID_TENANT_ID`：Microsoft Entra ID 租用戶識別碼（Tenant ID）。
- `ENTRA_ID_CLIENT_ID`：Microsoft Entra ID 應用程式（用戶端）識別碼（Client ID）。
- `ENTRA_ID_REDIRECT_URI`：前端重定向網址（例如 `https://admin.aka.money`）。
- `VITE_API_URL`：後端管理 API 基礎網址（例如 `https://api.aka.money`）。
- `VITE_SENTRY_DSN`：前端正式環境建置所需的公開 DSN。
- `VITE_SENTRY_REPLAY_ENABLED`：設為 `true` 啟用錯誤工作階段 Replay，設為 `false` 則停用。判斷時會去除前後空白並忽略大小寫。
- `SENTRY_BACKEND_DSN`：注入管理 API Worker 的必要公開 DSN。
- `SENTRY_REDIRECT_DSN`：注入重新導向 Worker 的必要公開 DSN。
- `SHORT_DOMAIN`：產生之縮短網址網域（例如 `https://aka.money` 或 `https://go.aka.money`）。
- `STORAGE_PROVIDER`：`"r2"`（預設）或 `"azure"`。
- `AZURE_STORAGE_ACCOUNT` 與 `AZURE_STORAGE_CONTAINER`：*（選填）* Azure 儲存帳戶與容器名稱。
Worker 的 `ENVIRONMENT` **不是** repository variable。已追蹤設定維持 `"development"`，避免本機執行被誤認為正式環境；兩個部署工作都會在任何 Cloudflare 變更前將其取代為 `ENVIRONMENT = "production"`，且必須剛好產生一筆 production 指派，否則停止。

發布流程會在前端建置前驗證前端 DSN；兩個 Worker 的 DSN 則會在各自部署工作進行任何 Cloudflare 或設定變更前驗證。三條路徑遇到缺少或格式無效的值時都會停止。前端 source maps 只會在受保護的 `production` environment 上傳，並在 Pages 部署前刪除；Vite 建置只有在具備 `GITHUB_ACTIONS` 或 `SENTRY_AUTH_TOKEN` 時才會產生 map，因此手動本機建置不可能發布 hidden map。

### 廢棄/未接入變數說明

發布工作流程中包含部分早期鷹架殘留的變數注入步驟：
- `D1_ANALYTICS_ACCOUNT_ID`、`D1_ANALYTICS_DATABASE_ID`、`D1_ANALYTICS_API_TOKEN`
- `VITE_ARCHIVED_REDIRECT_URL` / `ARCHIVED_REDIRECT_URL`

> **維護者注意事項**：上述變數在 `src/frontend`、`src/backend` 與 `src/redirect` 原始碼中**並未被使用**。請勿因工作流程中存在該變數而假設系統已實作 Analytics API 或已歸檔網址重定向等功能。

---

## 排程任務：點擊紀錄自動清理 Cron

管理 API Worker（`src/backend`）內建定時清理排程，定義於 `src/backend/wrangler.toml`：

```toml
[triggers]
crons = ["0 2 * * *"]  # 每日 UTC 02:00（台灣時間 10:00）執行
```

- **執行邏輯**：`src/backend/src/index.ts` 導出 `scheduled` 處理常式，呼叫 `cleanupOldClickRecords(env.DB, 365)`。
- **保留期限**：自動清除 `click_records` 資料表中超過 365 天的歷史點擊紀錄，防止資料庫空間無限膨脹。

---

## 部署中的資料庫遷移

資料庫遷移 SQL 檔案位於 `src/backend/migrations/`。若要在部署時更新正式環境結構：

```bash
cd src/backend
npx wrangler d1 migrations apply DB --remote --config wrangler.toml
```

*（注意：請確認 D1 資料庫名稱 `akamoney-clicks` 與線上 D1 實例名稱一致）。*

---

## 手動部署替代方案

若需要使用 Wrangler CLI 進行手動部署：

### 1. 手動部署管理 API

以下指令會修改已追蹤的 `wrangler.toml` 設定。請勿提交環境專用修改；建議優先使用會注入正式資料庫 ID 的 release workflow。手動部署時也必須自行設定 `ENVIRONMENT = "production"` 與非空 `SENTRY_DSN`：已追蹤設定提供的是 `"development"` 與空 DSN，只有 release workflow 會取代它們。

```bash
cd src/backend

# 先在 wrangler.toml 填入空白的 database_id 與正式環境變數。
# 透過設定好的 binding 執行遠端資料庫遷移。
npx wrangler d1 migrations apply DB --remote --config wrangler.toml

# 僅在 STORAGE_PROVIDER=azure 時設定 Azure 儲存憑證
npx wrangler secret put AZURE_STORAGE_SAS_TOKEN

# 部署 Worker
npx wrangler deploy
```

### 2. 手動部署重定向服務

```bash
cd src/redirect

# 部署重定向 Worker
npx wrangler deploy
```

### 3. 手動部署前端

```bash
cd src/frontend

# 帶入環境變數建置前端資產
VITE_API_URL="https://api.aka.money" \
VITE_SHORT_DOMAIN="https://go.aka.money" \
VITE_ENTRA_ID_CLIENT_ID="<your-client-id>" \
VITE_ENTRA_ID_TENANT_ID="<your-tenant-id>" \
VITE_ENTRA_ID_REDIRECT_URI="https://admin.aka.money" \
npm run build

# 部署至 Cloudflare Pages
npx wrangler pages deploy dist --project-name=akamoney-admin
```

除非設定 `GITHUB_ACTIONS` 或 `SENTRY_AUTH_TOKEN`，否則手動建置不會產生 source maps，因此可直接發布 `dist/`；代價是手動部署的前端錯誤在 Sentry 不會還原成原始碼位置。若要手動上傳 maps，請在建置時提供 Sentry 上傳權杖，並於部署前確認 `dist/` 內沒有任何 `.map` 檔。

---

## 驗證、可觀測性與版本回退

### 部署後冒煙測試

使用 `curl` 驗證各端點健康狀態：

```bash
# 1. 驗證管理 API 健康檢查
curl -s https://api.aka.money/health

# 2. 驗證重定向服務健康檢查
curl -s https://go.aka.money/health

# 3. 測試網址重定向（預期回應 HTTP 302）
curl -I https://go.aka.money/demo1
```

### 即時日誌追蹤

使用 `wrangler tail` 串流即時 Worker 運行日誌：

```bash
# 追蹤管理 API 日誌
npx wrangler tail akamoney-admin-api

# 追蹤重定向服務日誌
npx wrangler tail akamoney-redirect
```

### 版本回退策略

若發布版本發生異常：

```bash
# 回退 Cloudflare Pages（前端）
npx wrangler pages deployment list --project-name=akamoney-admin
npx wrangler pages deployment rollback <DEPLOYMENT_ID> --project-name=akamoney-admin

# 回退 Cloudflare Workers（後端 / 重定向）
npx wrangler deployments list --name akamoney-admin-api
npx wrangler rollback <DEPLOYMENT_ID> --name akamoney-admin-api
```

或者，亦可直接登入 Cloudflare 控制台，在 **Workers & Pages > Deployments** 介面中執行一鍵回退。

---

## 相關文件

- [開發指南](DEVELOPMENT.zh-TW.md)
- [測試指南](TESTING.zh-TW.md)
- [問題排解指南](TROUBLESHOOTING.zh-TW.md)
- [資料庫文件](DATABASE.zh-TW.md)
- [API 文件](API.zh-TW.md)
- [專案 README](../README.zh-TW.md)
