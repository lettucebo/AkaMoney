[English](TESTING.md) | 繁體中文

# 測試指南

本文件提供 AkaMoney 程式庫中執行測試、產生覆蓋率報告、進行型別檢查以及 CI/CD 驗證管線的完整指引。

## 概覽與測試策略

AkaMoney 在所有三個套件（`src/frontend`、`src/backend` 與 `src/redirect`）中皆採用 [Vitest](https://vitest.dev/) 進行快速且一致的單元測試與整合測試。

- **前端**：測試運行於 `happy-dom` 虛擬瀏覽器環境中，並搭配 `@vue/test-utils` 與 Pinia 測試工具。
- **後端**：測試運行於 `node` 環境，使用 Vitest 的進程分流（`pool: 'forks'`）來隔離 Worker 處理器、中介軟體、JWT 加解密操作與 D1/R2 服務層。
- **重定向**：測試運行於輕量級 `node` 環境中，驗證 302 重定向邏輯與點擊遙測記錄。

---

## 測試執行指令

### 根目錄協調腳本

在專案根目錄下，您可以循序執行所有三個套件的測試：

```bash
# 執行前端、後端與重定向的所有測試套件
npm test

# 執行所有測試套件並產生 V8 覆蓋率報告
npm run test:coverage

# 從根目錄執行特定子專案的測試套件
npm run test:frontend
npm run test:backend
npm run test:redirect

# 從根目錄執行特定子專案的覆蓋率測試
npm run test:coverage:frontend
npm run test:coverage:backend
npm run test:coverage:redirect
```

### 各套件獨立腳本

您也可以直接進入各子服務目錄下執行測試：

#### 前端 (`src/frontend`)
```bash
cd src/frontend

# 執行單次測試
npm test

# 啟動互動式監聽模式 (watch mode)
npm run test:watch

# 執行測試並產生覆蓋率報告
npm run test:coverage
```

前端測試會載入 Vite 環境檔。若被忽略的 `.env` 或 `.env.local` 改寫了 `VITE_SHORT_DOMAIN`，預期 `https://aka.money` 的短網址斷言可能在應用程式碼未變更時失敗。可用單次測試覆寫，不需編輯或揭露本地檔案：

```powershell
# PowerShell
$env:VITE_SHORT_DOMAIN='https://aka.money'; npm test; Remove-Item Env:\VITE_SHORT_DOMAIN
```

```bash
# POSIX shell
VITE_SHORT_DOMAIN=https://aka.money npm test
```

#### 後端管理 API (`src/backend`)
```bash
cd src/backend

# 執行單次測試
npm test

# 啟動互動式監聽模式 (watch mode)
npm run test:watch

# 執行測試並產生覆蓋率報告
npm run test:coverage
```

#### 重定向服務 (`src/redirect`)
```bash
cd src/redirect

# 執行單次測試
npm test

# 啟動互動式監聽模式 (watch mode)
npm run test:watch

# 執行測試並產生覆蓋率報告
npm run test:coverage
```

### 單一檔案與過濾測試執行

若要執行單一測試檔案或依名稱過濾特定測試，可直接使用 `npx vitest run`：

```bash
# 執行前端單一測試檔案
cd src/frontend
npx vitest run src/components/dashboard/__tests__/UrlTable.test.ts

# 執行後端單一測試檔案
cd src/backend
npx vitest run src/services/__tests__/url.test.ts

# 執行重定向服務單一測試檔案
cd src/redirect
npx vitest run src/__tests__/services.test.ts

# 執行符合名稱條件的特定測試案例 (-t / --testNamePattern)
cd src/backend
npx vitest run -t "should create short url"
```

---

## 型別檢查與 Linting 現況

### 型別檢查指令

目前只有前端提供框架感知、可直接使用的臨時型別檢查指令：

```bash
# 前端型別檢查
cd src/frontend
npx vue-tsc --noEmit
```

### Linting 與 CI 範疇說明

- **無 Typecheck 腳本**：目前所有套件皆未定義獨立的 `typecheck` 腳本。CI 透過 Wrangler dry-run build 驗證後端與重新導向 Worker 的編譯。
- **無 Lint 腳本**：目前在根目錄或任何子套件的 `package.json` 中**皆未定義** lint 腳本（例如 ESLint 或 Prettier 執行指令）。
- **CI 範疇說明**：持續整合管線（`.github/workflows/ci.yml`）**不會**單獨執行 `typecheck` 或 `lint` 腳本。CI 是透過 `npm run test:coverage` 與編譯建置（`npm run build`）來確保程式碼正確性。

---

## CI 測試管線 (.github/workflows/ci.yml)

### Matrix 與環境配置

持續整合管線在向 `main` 或 `master` 分支發送 Push 或 Pull Request 時觸發：
- **執行環境**：`ubuntu-latest`
- **Node.js**：`24.x`（透過 `actions/setup-node@v4` 管理並啟用 npm 快取）
- **依賴安裝**：只執行一次根目錄 `npm ci`，依照唯一的根目錄 `package-lock.json` 解析三個 workspace 套件。

### CI 工作步驟

CI 管線執行下列驗證步驟：

```yaml
# CI 驗證管線步驟摘要
- name: Install workspace dependencies
  run: npm ci

- name: Run test suites with coverage
  run: |
    npm run test:coverage -w akamoney-backend
    npm run test:coverage -w akamoney-frontend
    npm run test:coverage -w akamoney-redirect

- name: Compile and build (frontend & dry-run workers)
  run: |
    npm run build -w akamoney-frontend
    npm run build -w akamoney-backend
    npm run build -w akamoney-redirect
```

各套件產生的測試覆蓋率報告會被封裝並上傳為 GitHub Actions Artifacts（`backend-coverage-report`、`frontend-coverage-report`、`redirect-coverage-report`），保留期限為 30 天。

---

## 程式碼覆蓋率設定與門檻

覆蓋率由 `@vitest/coverage-v8` 進行計算。各套件的涵蓋範圍與門檻設定如下：

### 前端覆蓋率範疇

設定於 `src/frontend/vite.config.ts`：

```typescript
// src/frontend/vite.config.ts
test: {
  globals: true,
  environment: 'happy-dom',
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html', 'lcov'],
    include: ['src/**/*.ts'],
    exclude: [
      'src/**/*.d.ts',
      'src/main.ts',
      'src/router/**',
      'src/services/api.ts',
      'src/services/auth.ts',
      'src/**/__tests__/**'
    ],
    thresholds: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80
    }
  }
}
```

### 後端覆蓋率範疇

設定於 `src/backend/vitest.config.ts`：

```typescript
// src/backend/vitest.config.ts
test: {
  globals: true,
  environment: 'node',
  pool: 'forks',
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html', 'lcov'],
    include: ['src/**/*.ts'],
    exclude: [
      'src/**/*.d.ts',
      'src/index.ts',
      'src/**/__tests__/**'
    ],
    thresholds: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80
    }
  }
}
```

### 重定向服務覆蓋率範疇

設定於 `src/redirect/vitest.config.ts`：

```typescript
// src/redirect/vitest.config.ts
test: {
  globals: true,
  environment: 'node',
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
    exclude: [
      'node_modules/',
      '**/*.d.ts',
      '**/*.test.ts',
      'vitest.config.ts',
    ],
  },
}
```

*（附註：重定向服務主要驗證單元重定向邏輯；前端與後端目前皆強制要求 80% 覆蓋率門檻）。*

---

## 相關文件

- [開發指南](DEVELOPMENT.zh-TW.md)
- [部署指南](DEPLOYMENT.zh-TW.md)
- [問題排解指南](TROUBLESHOOTING.zh-TW.md)
- [資料庫文件](DATABASE.zh-TW.md)
- [API 文件](API.zh-TW.md)
- [專案 README](../README.zh-TW.md)
