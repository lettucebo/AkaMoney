English | [繁體中文](STORAGE.zh-TW.md)

# AkaMoney Storage Reference

## Overview

The Admin API accesses object storage through the `StorageProvider` abstraction in `src/backend/src/services/storage`. The current implementation supports:

- Cloudflare R2 (default)
- Azure Blob Storage (optional)

The Redirect Worker does not use object storage.

## Provider Selection

### Runtime Rules

The storage factory resolves providers as follows:

1. `STORAGE_PROVIDER` selects `r2` or `azure`
2. when omitted, the default is `r2`
3. `CDN_URL` overrides provider-specific public URLs for both providers

### Consumed Configuration

Only the following runtime inputs are consumed by code today:

| Input | Type | Used by | Notes |
| --- | --- | --- | --- |
| `STORAGE_PROVIDER` | env var | Factory | `r2` or `azure`, case-insensitive |
| `BUCKET` | Worker binding | R2 provider | Required for R2 mode |
| `R2_PUBLIC_URL` | env var | R2 provider | Optional base public URL |
| `AZURE_STORAGE_ACCOUNT` | env var | Azure provider | Required for Azure mode |
| `AZURE_STORAGE_CONTAINER` | env var | Azure provider | Required for Azure mode |
| `AZURE_STORAGE_SAS_TOKEN` | env var | Azure provider | Required for Azure mode |
| `AZURE_PUBLIC_URL` | env var | Azure provider | Optional explicit public URL |
| `CDN_URL` | env var | Both providers | Overrides `R2_PUBLIC_URL` and `AZURE_PUBLIC_URL` |

Variables shown only in example files but not read by runtime code should not be treated as consumed configuration. For example, the backend code reads the `BUCKET` binding, not `R2_BUCKET_NAME`.

```env
STORAGE_PROVIDER=r2
R2_PUBLIC_URL=https://storage.example.com
AZURE_STORAGE_ACCOUNT=<azure-account>
AZURE_STORAGE_CONTAINER=<azure-container>
AZURE_STORAGE_SAS_TOKEN=<azure-sas-token>
AZURE_PUBLIC_URL=https://blob.example.com/container
CDN_URL=https://cdn.example.com
```

## Provider Behavior

### R2

- requires the `BUCKET` Worker binding
- uploads through `bucket.put(...)`
- lists via `bucket.list(...)`
- returns public URLs only when `CDN_URL` or `R2_PUBLIC_URL` is configured

If neither `CDN_URL` nor `R2_PUBLIC_URL` is present, upload still succeeds but `url` in API responses is `undefined`.

### Azure Blob Storage

- requires `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER`, and `AZURE_STORAGE_SAS_TOKEN`
- talks to Azure Blob Storage through direct REST calls
- uses `AZURE_PUBLIC_URL` when provided
- otherwise falls back to the container URL without the SAS token

That fallback URL is only practically usable when the container is publicly readable. If it is not public, upload can still succeed but the returned URL will not be a reliable public asset URL.

## Admin API Endpoints

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/storage/config` | Required | Report whether the selected provider is configured |
| `POST /api/storage/upload` | Required | Upload one image |
| `GET /api/storage/files/:key{.+}` | Required | Read metadata for one file key |
| `GET /api/storage/files` | Required | List files under the current user's prefix |
| `DELETE /api/storage/files/:key{.+}` | Required | Delete one file key |

## Upload Rules

### Accepted MIME Types

The upload route allows only:

- `image/jpeg`
- `image/png`
- `image/gif`
- `image/webp`
- `image/svg+xml`

### Maximum Size

The current route enforces a maximum file size of `10 MB`.

### Key Generation

Uploaded files are always written under a user-owned prefix:

- `uploads/<user-id>/<timestamp>-<uuid>.<extension>`

The extension is derived from the validated MIME type, not from the original filename alone.

### Stored Metadata

The Admin API adds custom metadata on upload:

- `originalName`
- `uploadedBy`
- `uploadedAt`

## File Ownership and Catch-All Keys

The file metadata and delete routes use the catch-all path pattern `:key{.+}`. That means:

- keys may contain slashes
- the backend compares the resolved key against `uploads/<user-id>/`
- callers cannot read or delete files outside their own prefix

## Public URL Requirement

The storage APIs can operate without a public URL, but the management experience is much more useful when a public URL exists:

- uploaded image URLs are later stored on shortened-link records as `image_url`
- the frontend preview and edit flows expect a usable URL when images should be visible
- `GET /api/storage/config` exposes `hasPublicUrl` so the UI can tell whether the provider currently has one

In practice:

- configure `CDN_URL` if you want one shared public hostname regardless of provider
- otherwise configure `R2_PUBLIC_URL` for R2
- or configure `AZURE_PUBLIC_URL` / a public Azure container path for Azure

## Storage Response Notes

### `GET /api/storage/config`

Returns:

- `configured`: whether the selected provider has the required bindings / secrets
- `provider`: resolved provider name
- `hasPublicUrl`: whether a public URL was resolved after `CDN_URL` precedence

### `POST /api/storage/upload`

Returns:

- `key`
- `url?`
- `size?`
- `contentType`
- `originalName`

The following uses Windows Command Prompt continuation syntax. Replace `TOKEN_VALUE` with a Microsoft Entra access token.

```bat
curl -X POST "https://api.example.com/api/storage/upload" ^
  -H "Authorization: Bearer TOKEN_VALUE" ^
  -F "file=@banner.webp"
```

POSIX equivalent:

```bash
curl -X POST "https://api.example.com/api/storage/upload" -H "Authorization: Bearer TOKEN_VALUE" -F "file=@banner.webp"
```

### `GET /api/storage/files/:key{.+}`

Returns metadata only:

- `key`
- `size`
- `lastModified?`
- `contentType?`
- `url?`

### `GET /api/storage/files`

- defaults `limit` to `50`
- clamps `limit` to `100`
- scopes listing to `uploads/<user-id>/...`
- returns `hasMore` plus an optional pagination `cursor`

### `DELETE /api/storage/files/:key{.+}`

Returns only a success message and does not proxy the deleted object content.

## Related Documents

- [README](../README.md)
- [API Reference](API.md)
- [Architecture](ARCHITECTURE.md)
- [Authentication](AUTHENTICATION.md)
- [Database](DATABASE.md)
