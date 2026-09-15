/**
 * Visual status derivation for a single URL row.
 *
 * Search, status filtering and sorting are performed by the Admin API against
 * the whole account (`GET /api/urls` accepts `search`/`status`/`sort`), so no
 * client-side filtering lives here any more - only the per-row status badge.
 *
 * The SQL predicates in `src/backend/src/services/urlListQuery.ts` mirror this
 * function exactly, including treating a falsy `expires_at` as "never expires".
 */
import type { UrlResponse } from '@/types';

export type LinkStatus = 'on' | 'off' | 'exp';

/**
 * Derives a 3-state visual status from `is_active` + `expires_at`.
 *
 * An expired-but-unarchived link is neither 使用中 nor 已封存: the redirect
 * worker answers 410 for it, so it gets its own status.
 */
export function getLinkStatus(url: UrlResponse, now: number = Date.now()): LinkStatus {
  if (!url.is_active) {
    return 'off';
  }
  // A falsy expiry means "no expiry" everywhere else in the system (the redirect
  // worker tests `url.expires_at && ...`), so `0` must not read as expired here.
  if (typeof url.expires_at === 'number' && url.expires_at !== 0 && url.expires_at < now) {
    return 'exp';
  }
  return 'on';
}
