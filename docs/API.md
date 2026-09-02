English | [繁體中文](API.zh-TW.md)

# AkaMoney API Reference

## Scope and Base URLs

AkaMoney exposes two HTTP services:

| Service | Runtime | Base URL role | Authentication |
| --- | --- | --- | --- |
| Admin API Worker | Hono on Cloudflare Workers | Management, analytics, storage, cleanup | Mixed by route |
| Redirect Worker | Hono on Cloudflare Workers | Public short-link resolution | None |

The repository does not hard-code a single deployment hostname. The examples below use placeholders such as `https://api.example.com` and `https://go.example.com`.

## Wire-Level Conventions

- Authenticated Admin API requests use a bearer token issued by Microsoft Entra ID.
- Persisted timestamps are epoch milliseconds.
- Overall-stats date filters use inclusive UTC calendar dates in `YYYY-MM-DD` format.
- The Admin API currently returns `short_url` as the bare short code, not a full absolute URL.
- 5xx responses are sanitized and generic; they must not include stack traces, raw exception details, tokens, or provider diagnostics. 4xx responses may retain safe validation details.

```http
Authorization: Bearer TOKEN_VALUE
```

## Authentication Matrix

| Route | Auth class | Current behavior |
| --- | --- | --- |
| `GET /health` (admin) | Public | Always unauthenticated |
| `POST /api/shorten` | Optional auth | Accepts anonymous calls; valid bearer token associates the new URL with the authenticated Entra user; invalid optional token is ignored and the request proceeds anonymously |
| `GET /api/urls` | Protected | Requires Entra bearer token |
| `GET /api/urls/:id` | Protected | Requires Entra bearer token |
| `PUT /api/urls/:id` | Protected | Requires Entra bearer token |
| `DELETE /api/urls/:id` | Protected | Requires Entra bearer token |
| `GET /api/analytics/:shortCode` | Protected | Requires Entra bearer token |
| `GET /api/public/analytics/:shortCode` | Public | Limited shape only |
| `GET /api/stats/overall` | Protected | Requires Entra bearer token |
| `POST /api/admin/cleanup` | Protected | Requires Entra bearer token; no role check is enforced today |
| `GET /api/storage/config` | Protected | Requires Entra bearer token |
| `POST /api/storage/upload` | Protected | Requires Entra bearer token |
| `GET /api/storage/files/:key{.+}` | Protected | Requires Entra bearer token |
| `GET /api/storage/files` | Protected | Requires Entra bearer token |
| `DELETE /api/storage/files/:key{.+}` | Protected | Requires Entra bearer token |
| `OPTIONS *` (redirect) | Public | CORS preflight helper |
| `GET /health` (redirect) | Public | Always unauthenticated |
| `GET /:shortCode` | Public | Always unauthenticated |

## Shared Payload Shapes

### URL Resource

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Generated server-side |
| `short_code` | `string` | Case-insensitive uniqueness check on create |
| `original_url` | `string` | Must parse as `http:` or `https:` |
| `short_url` | `string` | Current implementation returns the bare short code |
| `title` | `string \| undefined` | Omitted when stored value is `NULL` |
| `description` | `string \| undefined` | Omitted when stored value is `NULL` |
| `image_url` | `string \| undefined` | Present when a link preview image has been stored |
| `created_at` | `number` | Epoch milliseconds |
| `updated_at` | `number` | Epoch milliseconds |
| `expires_at` | `number \| undefined` | Epoch milliseconds; omitted when `NULL` |
| `is_active` | `boolean` | Derived from the `INTEGER` database flag |
| `click_count` | `number` | Denormalized counter on `urls` |

### `CreateUrlRequest`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `original_url` | `string` | Yes | Must be an `http` or `https` URL |
| `short_code` | `string` | Yes | Trimmed, then validated against `^[a-zA-Z0-9-_]{3,20}$` |
| `title` | `string` | No | Stored as `NULL` when omitted or falsy |
| `description` | `string` | No | Stored as `NULL` when omitted or falsy |
| `image_url` | `string` | No | Stored as `NULL` when omitted or falsy |
| `expires_at` | `number` | No | Epoch milliseconds |

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

`updateUrl` writes every field whose value is not `undefined`.

- Omit a property to leave the stored value unchanged.
- Send `null` for `title`, `description`, `image_url`, or `expires_at` to clear that column.
- `original_url` cannot be cleared with `null`; it must be omitted or replaced with another valid URL string.

```json
{
  "title": null,
  "description": "Updated copy",
  "image_url": null,
  "expires_at": null,
  "is_active": false
}
```

### Analytics Shapes

`GET /api/analytics/:shortCode` returns:

- `url`: the URL resource shape above
- `total_clicks`: total count from `click_records`
- `clicks_by_date`: sparse date map for the last 30 days only
- `clicks_by_country`: top 10 countries, sparse
- `clicks_by_device`: sparse device-type counts
- `clicks_by_browser`: top 5 browsers, sparse
- `recent_clicks`: up to 20 most recent raw click records

`GET /api/public/analytics/:shortCode` intentionally returns only:

| Field | Type |
| --- | --- |
| `short_code` | `string` |
| `total_clicks` | `number` |
| `created_at` | `number` |

### Overall Stats Shape

`GET /api/stats/overall` returns:

| Field | Type | Notes |
| --- | --- | --- |
| `total_clicks` | `number` | Count within the selected inclusive range |
| `active_links` | `number` | Active links across the user account |
| `total_links` | `number` | Total links across the user account |
| `click_trend` | `Record<string, number>` | Sparse `YYYY-MM-DD` map |
| `top_links` | `Array<{ short_code, original_url, click_count, title? }>` | Sorted in service output by click count |
| `country_distribution` | `Record<string, number>` | Sparse |
| `device_distribution` | `Record<string, number>` | Sparse |
| `date_range.start` | `string` | Inclusive UTC date |
| `date_range.end` | `string` | Inclusive UTC date |

### Storage Shapes

| Route | Success shape |
| --- | --- |
| `GET /api/storage/config` | `{ configured, provider, hasPublicUrl }` |
| `POST /api/storage/upload` | `{ key, url?, size?, contentType, originalName }` |
| `GET /api/storage/files/:key{.+}` | `{ key, size, lastModified?, contentType?, url? }` |
| `GET /api/storage/files` | `{ files: Array<{ key, size, lastModified?, contentType?, url? }>, hasMore, cursor? }` |
| `DELETE /api/storage/files/:key{.+}` | `{ message }` |

## Redirect Worker Routes

### `OPTIONS *`

| Item | Behavior |
| --- | --- |
| Purpose | Public CORS preflight helper |
| Success | `204 No Content` with an empty body |
| Notes | Redirect Worker also appends `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, OPTIONS`, and `Access-Control-Allow-Headers: Content-Type` after each request |

### `GET /health`

| Item | Behavior |
| --- | --- |
| Success | `200 OK` with `{ status: "ok", service: "redirect", timestamp }` |
| Errors | Falls through to the global `500` handler only if the Worker itself throws |

### `GET /:shortCode`

| Item | Behavior |
| --- | --- |
| Lookup | Queries D1 for `LOWER(short_code) = LOWER(?)` and `is_active = 1` |
| Success | `302 Found` redirect to `original_url` |
| `404` | Returned when no active short code is found |
| `410` | Returned when the URL exists but `expires_at < Date.now()` |
| Click tracking | `executionCtx.waitUntil(...)` records the click and increments `urls.click_count` asynchronously so the redirect is not delayed |
| Errors | Unexpected failures fall into the Worker-level `500` JSON error handler |

## Admin Worker Routes

### `GET /health`

| Item | Behavior |
| --- | --- |
| Success | `200 OK` with `{ status: "ok", service: "admin-api", timestamp }` |
| Errors | Only unexpected Worker failures produce `500` |

### `POST /api/shorten`

| Item | Behavior |
| --- | --- |
| Auth | Optional |
| Request body | `CreateUrlRequest` |
| Success | `201 Created` with the URL resource |
| Current validation behavior | Missing `original_url` returns `400`; other safe validation or conflict errors may return semantic 4xx responses with validation details. Unexpected failures return sanitized generic 5xx responses. |
| DB configuration failure | Returns a sanitized `500` when `DB` is missing; no stack trace or raw exception details are returned. |
| Notes | `short_code` is required by current code even though older docs described it as optional |

### `GET /api/urls`

| Item | Behavior |
| --- | --- |
| Auth | Required |
| Query parameters | `page` default `1`; `limit` default `20` |
| Pagination behavior | Values are parsed with `parseInt(...)` and passed through without clamping; malformed values can propagate into a database error and produce `500` |
| Success | `200 OK` with `{ data, pagination }` |
| Ownership model | Returns only rows whose `user_id` matches the authenticated Entra user ID |
| Errors | Missing auth yields `401`; missing `DB` yields `500`; unexpected service or D1 failures yield `500` |

### `GET /api/urls/:id`

| Item | Behavior |
| --- | --- |
| Auth | Required |
| Success | `200 OK` with the URL resource |
| Current response omission | The route builds its response inline and does not include `image_url`, even when the database row has one |
| `404` | Returned when the URL ID does not exist |
| `403` | Returned when the row exists but `user_id` belongs to another user |
| Errors | Missing auth yields `401`; missing `DB` yields `500`; unexpected failures yield `500` |

### `PUT /api/urls/:id`

| Item | Behavior |
| --- | --- |
| Auth | Required |
| Request body | `UpdateUrlRequest` |
| Success | `200 OK` with the updated URL resource |
| Current error behavior | Safe not-found, forbidden, and validation failures may surface as 4xx responses; unexpected failures return sanitized generic 5xx responses. |
| Null vs undefined | `null` clears nullable columns; omitted properties leave existing values untouched |

### `DELETE /api/urls/:id`

| Item | Behavior |
| --- | --- |
| Auth | Required |
| Success | `200 OK` with `{ message: "URL deleted successfully" }` |
| Current error behavior | Safe not-found and forbidden failures may surface as 4xx responses; unexpected failures return sanitized generic 5xx responses. |

### `GET /api/analytics/:shortCode`

| Item | Behavior |
| --- | --- |
| Auth | Required |
| Success | `200 OK` with the protected analytics shape |
| `404` | Returned when the short code does not resolve to an active URL |
| Current ownership error behavior | Ownership checks happen in the service layer; safe forbidden failures may surface as 4xx responses, while unexpected failures return sanitized generic 5xx responses. |
| Range behavior | `clicks_by_date` covers only the last 30 days and omits zero-value dates |

### `GET /api/public/analytics/:shortCode`

| Item | Behavior |
| --- | --- |
| Auth | Public |
| Success | `200 OK` with `{ short_code, total_clicks, created_at }` only |
| `404` | Returned when the short code does not resolve to an active URL |
| Notes | This route does not expose `recent_clicks`, country/device/browser breakdowns, or the destination URL |

### `GET /api/stats/overall`

| Item | Behavior |
| --- | --- |
| Auth | Required |
| Query parameters | Optional `startDate` and `endDate` in `YYYY-MM-DD` |
| Inclusive UTC behavior | The route expands `startDate` to `T00:00:00.000Z` and `endDate` to `T23:59:59.999Z` before querying |
| Pairing rule | Both dates must be present together or both omitted |
| Default range | When both are omitted, the current UTC month is used |
| Success | `200 OK` with the overall stats shape |
| `400` | Returned for one-sided date ranges, invalid date format, or `startDate > endDate` |
| Errors | Other failures return `500` |

### `POST /api/admin/cleanup`

| Item | Behavior |
| --- | --- |
| Auth | Required |
| Query parameter | Optional `days`, default `365` |
| Success | `200 OK` with `{ message, deleted, cutoffDate, retentionDays }` |
| `400` | Returned when `days` is not a positive integer or is greater than `3650` |
| Access control note | The code comments mention a future admin-role check, but today any authenticated user can trigger cleanup |
| Errors | Service failures return sanitized generic 5xx responses without stack traces or raw exception details. |

### `GET /api/storage/config`

| Item | Behavior |
| --- | --- |
| Auth | Required |
| Success | `200 OK` with storage configuration flags |
| Meaning of `configured` | `true` only when the currently selected provider has the bindings/secrets that its factory requires |
| Meaning of `hasPublicUrl` | Reflects whether the factory resolved a public URL after provider selection and `CDN_URL` precedence |

### `POST /api/storage/upload`

| Item | Behavior |
| --- | --- |
| Auth | Required |
| Request body | `multipart/form-data` with a `file` part |
| MIME allowlist | `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml` |
| Max size | `10 MB` |
| Generated key | `uploads/<user-id>/<timestamp>-<uuid>.<ext>` |
| Success | `201 Created` with `{ key, url?, size?, contentType, originalName }` |
| `400` | Returned for missing file, unsupported MIME type, or files over `10 MB` |
| `500` | Returned when storage is not configured or upload processing fails |
| Public URL note | `url` is optional because the provider may not have a resolved public URL |

The following uses Windows Command Prompt continuation syntax. Replace `TOKEN_VALUE` with a Microsoft Entra access token.

```bat
curl -X POST "https://api.example.com/api/storage/upload" ^
  -H "Authorization: Bearer TOKEN_VALUE" ^
  -F "file=@cover.png"
```

POSIX equivalent:

```bash
curl -X POST "https://api.example.com/api/storage/upload" -H "Authorization: Bearer TOKEN_VALUE" -F "file=@cover.png"
```

### `GET /api/storage/files/:key{.+}`

| Item | Behavior |
| --- | --- |
| Auth | Required |
| Route shape | Catch-all key segment; the key may contain slashes |
| Ownership rule | The key must start with `uploads/<user-id>/` |
| Success | `200 OK` with metadata plus `url?` |
| `403` | Returned for keys outside the caller's prefix |
| `404` | Returned when the key is inside the caller's prefix but the object does not exist |
| `500` | Returned when storage is not configured or provider access fails |

### `GET /api/storage/files`

| Item | Behavior |
| --- | --- |
| Auth | Required |
| Query parameters | Optional `limit`, optional `cursor` |
| Limit behavior | Defaults to `50`; values `<= 0` or non-numeric fall back to `50`; values above `100` are clamped to `100` |
| Prefix scope | Always lists only `uploads/<user-id>/...` |
| Success | `200 OK` with `{ files, hasMore, cursor? }` |
| `500` | Returned when storage is not configured or provider listing fails |

### `DELETE /api/storage/files/:key{.+}`

| Item | Behavior |
| --- | --- |
| Auth | Required |
| Ownership rule | The key must start with `uploads/<user-id>/` |
| Success | `200 OK` with `{ message: "File deleted successfully" }` |
| `403` | Returned for keys outside the caller's prefix |
| `500` | Returned when storage is not configured or provider deletion fails |

## Current Error Envelope Notes

- `authMiddleware` returns `401` for missing/invalid bearer headers and invalid or expired Entra tokens.
- 5xx responses are sanitized and generic; they do not include stack traces, raw exception details, tokens, or provider diagnostics.
- 4xx responses may retain safe validation details, such as invalid input messages, when they do not reveal secrets.

## Related Documents

- [README](../README.md)
- [Architecture](ARCHITECTURE.md)
- [Authentication](AUTHENTICATION.md)
- [Database](DATABASE.md)
- [Storage](STORAGE.md)
