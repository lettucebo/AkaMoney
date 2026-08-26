English | [繁體中文](AUTHENTICATION.zh-TW.md)

# AkaMoney Authentication Reference

## Overview

AkaMoney authenticates the management experience with Microsoft Entra ID:

1. the frontend uses MSAL in the browser
2. Axios sends the acquired access token as a bearer token
3. the Admin API verifies that token against Entra JWKS, issuer, and audience
4. the backend upserts the caller into `users`

The public redirect path and public limited analytics remain intentionally unauthenticated.

## Route Classes

| Class | Routes |
| --- | --- |
| Public | Admin `GET /health`, Admin `GET /api/public/analytics/:shortCode`, Redirect `OPTIONS *`, Redirect `GET /health`, Redirect `GET /:shortCode` |
| Optional auth | Admin `POST /api/shorten` |
| Protected | Admin `GET /api/urls`, `GET /api/urls/:id`, `PUT /api/urls/:id`, `DELETE /api/urls/:id`, `GET /api/analytics/:shortCode`, `GET /api/stats/overall`, `POST /api/admin/cleanup`, `GET /api/storage/config`, `POST /api/storage/upload`, `GET /api/storage/files/:key{.+}`, `GET /api/storage/files`, `DELETE /api/storage/files/:key{.+}` |

## Frontend Authentication Flow

### MSAL Initialization

`src/frontend/src/services/auth.ts` creates a `PublicClientApplication` only when `VITE_ENTRA_ID_CLIENT_ID` is configured. Initialization does the following:

- calls `msalInstance.initialize()`
- handles redirect completion with `handleRedirectPromise()`
- sets the active account after a successful redirect
- stores the access token in `localStorage` as `auth_token` when Entra returns one

### Race Guard During Bootstrap

The Pinia auth store uses a shared `initializePromise` so concurrent router or component calls do not run initialization twice. This is the current guard against startup races between the router and UI bootstrapping.

### Login and Redirect Handling

- the live login screen uses `authStore.loginRedirect()`
- `loginRedirect()` requests scopes `openid`, `profile`, `email`, and `api://<client-id>/access_as_user`
- after redirect completion, `initialize()` finalizes the session

The codebase still contains `authService.login()` for popup-based login, but the normal login view uses redirect-based login.

### Logout Behavior

Logout is app-local, not a full Microsoft-account sign-out:

- sets `akamoney_explicit_logout` in `localStorage`
- removes `auth_token`
- clears the active MSAL account reference

The explicit logout flag prevents the app from silently reusing cached MSAL accounts on the next page load.

### Redirect Validation

Post-login redirects are sanitized through `getValidatedRedirect(...)`:

- requires a leading `/`
- rejects protocol-relative and absolute URLs
- rejects `/login`
- strips control characters used for redirect tricks

This keeps the login flow on internal routes only.

## Backend Token Verification

### Required Checks

`src/backend/src/middleware/auth.ts` verifies Entra tokens with:

- tenant-specific remote JWKS
- accepted issuers:
  - `https://login.microsoftonline.com/<tenant-id>/v2.0`
  - `https://sts.windows.net/<tenant-id>/`
- accepted audiences:
  - `<client-id>`
  - `api://<client-id>`

```http
Authorization: Bearer <access-token>
```

### Required Middleware Behavior

`authMiddleware` returns:

- `401` for missing or malformed `Authorization` headers
- `500` when `ENTRA_ID_TENANT_ID` or `ENTRA_ID_CLIENT_ID` is missing
- `401` for invalid or expired tokens

If token verification succeeds, the middleware attempts to upsert the user in D1. If that database step fails, authentication still proceeds with the verified token payload, just without DB-derived role fields.

### Optional Middleware Behavior

`optionalAuthMiddleware` never rejects the request:

- no bearer token -> request proceeds anonymously
- invalid bearer token -> request still proceeds anonymously
- valid bearer token -> user context is attached when verification succeeds

This is why `POST /api/shorten` can create anonymous links while still associating links with signed-in users when possible.

## User Upsert and Role State

On successful token verification, the backend calls `upsertUser(...)` with:

- `email`
- `name`
- `sso_provider = "entra"`
- `sso_id = <oid or sub from token>`

The users table defaults new records to role `"user"`. The auth context adds:

- verified Entra identity fields
- `role`
- `dbUserId`

when the upsert succeeds.

## Development Bypass

### `VITE_SKIP_AUTH`

The frontend bypasses authentication only when both conditions are true:

```env
VITE_SKIP_AUTH=true
import.meta.env.DEV=true
```

When enabled:

- MSAL login is skipped
- the app uses a fake in-memory account
- `authService.getToken()` returns `dev-mock-token`
- `src/frontend/src/services/api.ts` serves mock URLs, mock analytics, and mock storage results from memory

### Important Limitation

This mode is useful for UI work, screenshots, and tests, but it cannot validate:

- real Entra login
- bearer-token handling in the Admin Worker
- D1-backed ownership checks
- real storage provider behavior

## Non-Production JWT Helper

`src/backend/src/services/jwt.ts` implements HMAC JWT generation and verification, but the production Admin API does not call it. The live authentication path uses Entra token verification instead.

## Related Documents

- [README](../README.md)
- [Architecture](ARCHITECTURE.md)
- [API Reference](API.md)
- [Database](DATABASE.md)
