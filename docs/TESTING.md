English | [繁體中文](TESTING.zh-TW.md)

# Testing Guide

This document provides complete instructions for executing tests, generating coverage reports, performing type checking, and understanding CI/CD validation pipelines across the AkaMoney codebase.

## Overview and Test Philosophy

AkaMoney uses [Vitest](https://vitest.dev/) across all three packages (`src/frontend`, `src/backend`, and `src/redirect`) to ensure fast, consistent unit and integration testing.

- **Frontend**: Tests run in a `happy-dom` virtual browser environment with `@vue/test-utils` and Pinia testing utilities.
- **Backend**: Tests run in a `node` environment using Vitest forks (`pool: 'forks'`) to isolate worker handlers, middleware, JWT operations, and D1/R2 service layers.
- **Redirect**: Tests run in a lightweight `node` environment to validate redirect logic and click telemetry.

---

## Test Execution Commands

### Root Orchestrated Scripts

From the repository root, you can run tests across all three packages sequentially:

```bash
# Run all test suites across frontend, backend, and redirect
npm test

# Run all test suites with V8 coverage reports
npm run test:coverage

# Run individual subproject test suites from root
npm run test:frontend
npm run test:backend
npm run test:redirect

# Run individual subproject coverage suites from root
npm run test:coverage:frontend
npm run test:coverage:backend
npm run test:coverage:redirect
```

### Per-Package Scripts

You can also run tests directly within each service directory:

#### Frontend (`src/frontend`)
```bash
cd src/frontend

# Run tests once
npm test

# Run tests in interactive watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

Frontend tests load Vite environment files. If an ignored `.env` or `.env.local` changes `VITE_SHORT_DOMAIN`, short-link assertions that expect `https://aka.money` can fail even though the application code is unchanged. Use a one-command test override without editing or exposing the local file:

```powershell
# PowerShell
$env:VITE_SHORT_DOMAIN='https://aka.money'; npm test; Remove-Item Env:\VITE_SHORT_DOMAIN
```

```bash
# POSIX shells
VITE_SHORT_DOMAIN=https://aka.money npm test
```

#### Backend Admin API (`src/backend`)
```bash
cd src/backend

# Run tests once
npm test

# Run tests in interactive watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

#### Redirect Service (`src/redirect`)
```bash
cd src/redirect

# Run tests once
npm test

# Run tests in interactive watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Single-File and Filtered Test Execution

To execute a specific test file or filter by test name, use Vitest directly with `npx vitest run`:

```bash
# Execute a single test file in frontend
cd src/frontend
npx vitest run src/components/dashboard/__tests__/UrlTable.test.ts

# Execute a single test file in backend
cd src/backend
npx vitest run src/services/__tests__/url.test.ts

# Execute a single test file in redirect service
cd src/redirect
npx vitest run src/__tests__/services.test.ts

# Run a specific test matching a name pattern (-t / --testNamePattern)
cd src/backend
npx vitest run -t "should create short url"
```

---

## Type Checking and Linting Status

### Type Checking Commands

Only the frontend currently has a framework-aware, directly supported ad-hoc type-check command:

```bash
# Frontend type checking
cd src/frontend
npx vue-tsc --noEmit
```

### Linting and CI Scope Clarification

- **No Typecheck Script**: No package currently defines a standalone `typecheck` script. CI validates backend and redirect Worker compilation through their Wrangler dry-run builds.
- **No Lint Script**: There is currently **no lint script** (e.g. ESLint or Prettier runner) defined in `package.json` at the root or within any subpackage.
- **CI Scope**: The continuous integration pipeline (`.github/workflows/ci.yml`) does **not** execute standalone `typecheck` or `lint` scripts. It enforces correctness through `npm run test:coverage` and compilation builds (`npm run build`).

---

## CI Test Pipeline (.github/workflows/ci.yml)

### Matrix and Environment Setup

Continuous integration is triggered on pushes and pull requests to `main` and `master`:
- **Runner**: `ubuntu-latest`
- **Node.js**: `24.x` (managed via `actions/setup-node@v4` with npm cache)
- **Dependency Installation**: Runs a single root `npm ci`, resolving all three workspace packages against the one root `package-lock.json`.

### CI Job Steps

The CI pipeline runs the following verification sequence:

```yaml
# CI Verification Pipeline Summary
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

Coverage reports from each package are preserved and uploaded as GitHub Actions artifacts (`backend-coverage-report`, `frontend-coverage-report`, `redirect-coverage-report`) with a 30-day retention period.

---

## Code Coverage Configuration and Thresholds

Coverage is measured using `@vitest/coverage-v8`. Configuration scopes and thresholds are defined per package:

### Frontend Coverage Scope

Configured in `src/frontend/vite.config.ts`:

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

### Backend Coverage Scope

Configured in `src/backend/vitest.config.ts`:

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

### Redirect Coverage Scope

Configured in `src/redirect/vitest.config.ts`:

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

*(Note: The redirect service tests unit redirect logic; explicit 80% thresholds are currently enforced on Frontend and Backend).*

---

## Related Documents

- [Development Guide](DEVELOPMENT.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [Database Documentation](DATABASE.md)
- [API Documentation](API.md)
- [Project README](../README.md)
