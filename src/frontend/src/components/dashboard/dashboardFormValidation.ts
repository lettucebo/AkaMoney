/**
 * Client-side validation for the dashboard's create/edit forms.
 *
 * These rules mirror the backend's authoritative checks (see
 * `src/backend/src/services/url.ts` `isValidShortCode` and the storage
 * upload route's allow-list) so the user gets an immediate, friendly error
 * instead of a round-trip failure - but the backend remains the source of
 * truth and is not modified here.
 */

const SHORT_CODE_PATTERN = /^[a-zA-Z0-9_-]{3,20}$/;

/** Returns a Traditional Chinese error message, or `null` when the alias is valid. */
export function validateShortCode(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return '請輸入短代碼';
  }
  if (!SHORT_CODE_PATTERN.test(trimmed)) {
    return '短代碼需為 3–20 個字元，僅限英文字母、數字、連字號（-）與底線（_）。';
  }
  return null;
}

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Returns a Traditional Chinese error message, or `null` when the file is acceptable. */
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return '檔案格式不支援，僅接受 JPEG、PNG、GIF、WebP 與 SVG。';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return '檔案過大，上限為 10MB。';
  }
  return null;
}
