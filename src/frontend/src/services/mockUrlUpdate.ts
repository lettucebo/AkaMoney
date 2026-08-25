import type { UpdateUrlRequest, UrlResponse } from '@/types';

/**
 * Applies an `UpdateUrlRequest` to a mock URL with the real API's exact semantics.
 *
 * `updateUrl` (src/backend/src/services/url.ts) only emits a `SET column = ?`
 * clause for fields whose value is not `undefined`, so an omitted key is a no-op
 * and a defined `null` is an explicit "clear this column". `formatUrlResponse`
 * then maps a cleared (SQL NULL) column back to `undefined` in the response,
 * which is why cleared fields come back as `undefined` here too.
 *
 * Spreading the request wholesale would break that parity, because an explicitly
 * `undefined` property still overwrites the target key when spread.
 */
export function applyMockUrlUpdate(
  current: UrlResponse,
  data: UpdateUrlRequest,
  now: number = Date.now()
): UrlResponse {
  const next: UrlResponse = { ...current, updated_at: now };

  if (data.original_url !== undefined) {
    next.original_url = data.original_url;
  }
  if (data.title !== undefined) {
    next.title = data.title ?? undefined;
  }
  if (data.description !== undefined) {
    next.description = data.description ?? undefined;
  }
  if (data.image_url !== undefined) {
    next.image_url = data.image_url ?? undefined;
  }
  if (data.expires_at !== undefined) {
    next.expires_at = data.expires_at ?? undefined;
  }
  if (data.is_active !== undefined) {
    next.is_active = data.is_active;
  }

  return next;
}
