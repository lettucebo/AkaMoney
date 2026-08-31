# Redirect Sentry follow-up report

## Follow-up: Sentry Logs activation and OPTIONS coverage (2026-09-01)

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

Because the Cloudflare Worker options omitted `enableLogs`, configured DSNs would still initialize Sentry error/trace options but the requested Sentry Logs console integration would not activate. The fix adds `enableLogs: true` to the Worker options and asserts it in the focused options test. Redirect OPTIONS coverage was added for the existing `new Response(null, { status: 204 })` implementation to lock 204 status and CORS headers without changing status semantics.

### RED evidence

Command:

```powershell
Set-Location 'C:\Source\Repos\worktree\sentry-observability\src\redirect'; npm test -- src/__tests__/sentry.test.ts src/__tests__/index.test.ts
```

Output:

```text
> akamoney-redirect@1.3.0 test
> vitest run src/__tests__/sentry.test.ts src/__tests__/index.test.ts

 RUN  v4.1.11 C:/Source/Repos/worktree/sentry-observability/src/redirect

 ❯ src/__tests__/sentry.test.ts (7 tests | 1 failed) 14ms
     ✓ scrubs credential headers case-insensitively and preserves safe event fields 3ms
     ✓ scrubs transaction request headers using the same credential rules 0ms
     ✓ removes cookie maps populated from credential headers 0ms
     ✓ removes inherited request headers and IP from background analytics error events 0ms
     ✓ scrubs credential header attributes from streamed spans 0ms
     × builds Cloudflare Sentry options from Env with redirect-safe sampling and integrations 5ms
     ✓ defaults missing Sentry environment to development and keeps a configured DSN 0ms
 ✓ src/__tests__/index.test.ts (4 tests) 31ms

 FAIL  src/__tests__/sentry.test.ts > Sentry configuration > builds Cloudflare Sentry options from Env with redirect-safe sampling and integrations
AssertionError: expected undefined to be true // Object.is equality

- Expected:
true

+ Received:
undefined

 ❯ src/__tests__/sentry.test.ts:140:32
```

### GREEN evidence

Command:

```powershell
Set-Location 'C:\Source\Repos\worktree\sentry-observability\src\redirect'; npm test -- src/__tests__/sentry.test.ts src/__tests__/index.test.ts
```

Output:

```text
> akamoney-redirect@1.3.0 test
> vitest run src/__tests__/sentry.test.ts src/__tests__/index.test.ts

 RUN  v4.1.11 C:/Source/Repos/worktree/sentry-observability/src/redirect

 ✓ src/__tests__/sentry.test.ts (7 tests) 9ms
 ✓ src/__tests__/index.test.ts (4 tests) 29ms

 Test Files  2 passed (2)
      Tests  11 passed (11)
   Start at  03:17:42
   Duration  957ms (transform 122ms, setup 0ms, import 1.24s, tests 37ms, environment 0ms)
```