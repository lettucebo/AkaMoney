/**
 * Short-link URL construction.
 *
 * The Admin API's `short_url` is only guaranteed to be the bare short code
 * (`formatUrlResponse` in src/backend/src/services/url.ts is always called
 * without a base URL), so it must never be used as an href or clipboard value.
 * The functional target is always rebuilt from the trustworthy `short_code`
 * plus the configured short host, defaulting to production.
 *
 * The *displayed* host stays the production brand host regardless of
 * configuration, so a local development port is never shown in the UI.
 */
import { buildShortUrl, resolveShortHost } from './format';

export const SHORT_LINK_DISPLAY_HOST = 'aka.money';

/** Resolves the configured functional short host, falling back to production. */
export function shortLinkHost(): string {
  return resolveShortHost(import.meta.env.VITE_SHORT_DOMAIN);
}

/** Builds the working short URL for a short code (href / clipboard target). */
export function shortLinkTarget(shortCode: string): string {
  return buildShortUrl(shortLinkHost(), shortCode);
}
