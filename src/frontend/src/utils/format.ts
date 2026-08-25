/**
 * Presentation-layer formatting helpers.
 *
 * Every helper is deterministic: calendar output is assembled from explicit date
 * parts instead of `toLocale*` so rendering never depends on the host ICU locale.
 */

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const pad = (value: number): string => String(value).padStart(2, '0');

const isRenderableDate = (date: Date): boolean => !Number.isNaN(date.getTime());

/** Formats an integer with thousand separators, collapsing unusable input to `0`. */
export function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '0';
  }
  return NUMBER_FORMATTER.format(value);
}

/** Formats a number with at most `fractionDigits` decimals and no trailing zeros. */
export function formatDecimal(value: number | null | undefined, fractionDigits = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '0';
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: fractionDigits }).format(value);
}

/** Formats a ratio (0.125) as a signed percentage (`+12.5%`); blank when there is no ratio. */
export function formatSignedPercent(ratio: number | null | undefined): string {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) {
    return '';
  }
  const percent = formatDecimal(Math.abs(ratio) * 100, 1);
  if (ratio > 0) {
    return `+${percent}%`;
  }
  if (ratio < 0) {
    return `-${percent}%`;
  }
  return `${percent}%`;
}

/** Formats an epoch timestamp as `YYYY/MM/DD` in the viewer's timezone. */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  if (!isRenderableDate(date)) {
    return '';
  }
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

/** Formats an epoch timestamp as `YYYY/MM/DD HH:mm` in the viewer's timezone. */
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (!isRenderableDate(date)) {
    return '';
  }
  return `${formatTimestamp(timestamp)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Formats an API calendar string (`YYYY-MM-DD` or a full ISO timestamp) as `YYYY/MM/DD`.
 *
 * Malformed values are surfaced as a blank string rather than leaking `Invalid Date`
 * into the UI; the API is the only source of these values so they are treated as data.
 */
export function formatApiDate(value: string | null | undefined): string {
  if (typeof value !== 'string' || value.length === 0) {
    return '';
  }
  const calendarOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(calendarOnly ? `${value}T00:00:00.000Z` : value);
  if (!isRenderableDate(date)) {
    return '';
  }
  if (calendarOnly) {
    return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}`;
  }
  return formatTimestamp(date.getTime());
}

/** Truncates text to `maxLength` characters, appending an ellipsis when it was cut. */
export function truncate(text: string | null | undefined, maxLength: number): string {
  if (typeof text !== 'string' || text.length === 0) {
    return '';
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

/**
 * Normalises the configured short domain into a bare host.
 *
 * `VITE_SHORT_DOMAIN` is configured with a protocol in some environments, but the UI
 * always renders `host/code`. Falls back to the production host.
 */
export function resolveShortHost(rawDomain: string | null | undefined): string {
  const trimmed = typeof rawDomain === 'string' ? rawDomain.trim() : '';
  if (trimmed.length === 0) {
    return 'aka.money';
  }
  const withoutProtocol = trimmed.replace(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//, '');
  const withoutTrailingSlash = withoutProtocol.replace(/\/+$/, '');
  return withoutTrailingSlash.length === 0 ? 'aka.money' : withoutTrailingSlash;
}

/** Builds a clickable short URL from a bare host and short code. */
export function buildShortUrl(host: string, shortCode: string): string {
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return `${isLocal ? 'http' : 'https'}://${host}/${shortCode}`;
}

/** Formats a `Date` as the `YYYY-MM-DD` value expected by `<input type="date">`. */
export function toDateInputValue(date: Date): string {
  if (!isRenderableDate(date)) {
    return '';
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Formats a timestamp as the value expected by `<input type="datetime-local">`. */
export function toLocalDateTimeInputValue(timestamp: number): string {
  const date = new Date(timestamp);
  if (!isRenderableDate(date)) {
    return '';
  }
  return `${toDateInputValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface ApiErrorShape {
  response?: {
    data?: {
      message?: unknown;
    };
  };
}

/**
 * Reads the `response.data.message` an Axios error carries, without widening to `any`.
 * Anything else (network errors, thrown strings) resolves to the caller's fallback.
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) {
    return fallback;
  }
  const message = (error as ApiErrorShape).response?.data?.message;
  return typeof message === 'string' && message.length > 0 ? message : fallback;
}
