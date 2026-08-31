# Backend Sentry follow-up report

## Follow-up: Sentry Logs activation (2026-09-01)

### SDK evidence

Installed SDK is `@sentry/cloudflare` 10.71.0:

```text
node_modules\@sentry\cloudflare\package.json:3:  "version": "10.71.0",
```

`consoleLoggingIntegration` in this install reads the resolved client option and exits during `setup` when logs are not explicitly enabled in the runtime:

```text
node_modules\@sentry\core\build\cjs\logs\console-integration.js:18:const _consoleLoggingIntegration = ((options = {}) => {
node_modules\@sentry\core\build\cjs\logs\console-integration.js:23:      const { enableLogs, normalizeDepth = 3, normalizeMaxBreadth = 1e3 } = client.getOptions();
node_modules\@sentry\core\build\cjs\logs\console-integration.js:24:      if (!enableLogs) {
node_modules\@sentry\core\build\cjs\logs\console-integration.js:25:        debugBuild.DEBUG_BUILD && debugLogger.debug.warn("`enableLogs` is not enabled, ConsoleLogs integration disabled");
node_modules\@sentry\core\build\cjs\logs\console-integration.js:26:        return;
```

Because the Cloudflare Worker options omitted `enableLogs`, configured DSNs would still initialize Sentry error/trace options but the requested Sentry Logs console integration would not activate. The fix adds `enableLogs: true` to the Worker options and asserts it in the focused options test.

### RED evidence

Command:

```powershell
Set-Location 'C:\Source\Repos\worktree\sentry-observability\src\backend'; npm test -- src/services/__tests__/sentry.test.ts
```

Output:

```text
> akamoney-backend@1.3.0 test
> vitest run src/services/__tests__/sentry.test.ts

 RUN  v4.1.11 C:/Source/Repos/worktree/sentry-observability/src/backend

 ❯ src/services/__tests__/sentry.test.ts (6 tests | 1 failed) 8ms
       ✓ removes credential request headers case-insensitively and preserves safe data 2ms
       ✓ removes cookie request header case-insensitively 0ms
       ✓ preserves events without request headers 0ms
       ✓ removes credential query strings from Sentry fetch breadcrumbs and span data 0ms
       × maps Env to Sentry options and installs log and handled-error console integrations 4ms
       ✓ omits empty DSN and defaults environment to development 0ms

 FAIL  src/services/__tests__/sentry.test.ts > Sentry service > createSentryOptions > maps Env to Sentry options and installs log and handled-error console integrations
AssertionError: expected undefined to be true // Object.is equality

- Expected:
true

+ Received:
undefined

 ❯ src/services/__tests__/sentry.test.ts:157:34
```

### GREEN evidence

Command:

```powershell
Set-Location 'C:\Source\Repos\worktree\sentry-observability\src\backend'; npm test -- src/services/__tests__/sentry.test.ts
```

Output:

```text
> akamoney-backend@1.3.0 test
> vitest run src/services/__tests__/sentry.test.ts

 RUN  v4.1.11 C:/Source/Repos/worktree/sentry-observability/src/backend

 ✓ src/services/__tests__/sentry.test.ts (6 tests) 6ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  03:17:40
   Duration  373ms (transform 55ms, setup 0ms, import 99ms, tests 6ms, environment 0ms)
```