/**
 * Shared primitives for redirect background observability.
 *
 * This module intentionally has no Sentry import so that the native console
 * function is captured at module evaluation, before any per-request Sentry
 * initialization patches the global console.
 */

type ConsoleErrorFunction = (...args: unknown[]) => void;

const capturedConsoleError: unknown = typeof console === 'undefined' ? undefined : console.error;

/**
 * The workerd `console.error` implementation as it existed at module evaluation.
 *
 * Calling this bound reference keeps background failures visible in local and
 * Cloudflare logs without re-entering `captureConsoleIntegration`, so a single
 * failure cannot produce a duplicate Sentry issue.
 */
export const nativeConsoleError: ConsoleErrorFunction =
  typeof capturedConsoleError === 'function'
    ? (capturedConsoleError as ConsoleErrorFunction).bind(console)
    : () => undefined;

export const BACKGROUND_ANALYTICS_ERROR_MESSAGE = 'Redirect background analytics failed';
export const BACKGROUND_OPERATION_TAG_KEY = 'background_operation';
export const BACKGROUND_CLICK_RECORDING_OPERATION = 'redirect.click_recording';
export const CLICK_RECORDING_OPERATION_NAME = 'recordClick';
export const MAX_REPORTED_ERROR_MESSAGE_LENGTH = 200;
export const MAX_REPORTED_ERROR_NAME_LENGTH = 64;
export const REDACTION_PLACEHOLDER = '[redacted]';

/**
 * Upper bound on the raw message length that is scanned for sensitive
 * substrings. Truncation to this bound happens *before* any scanning, so the
 * cost of every pattern below is bounded no matter how long the throwable's
 * message is, and it is wider than the reported length so a secret cannot be cut
 * in half and survive redaction.
 */
export const MAX_SCANNED_ERROR_MESSAGE_LENGTH = MAX_REPORTED_ERROR_MESSAGE_LENGTH * 5;

/**
 * Longest textual IPv6 address, `0000:0000:0000:0000:0000:ffff:255.255.255.255`.
 * Compression only shortens a literal, so a longer candidate can never be an
 * address and is skipped without validation.
 */
export const MAX_IPV6_ADDRESS_LENGTH = 45;

/**
 * A throwable message is the only free-form text that leaves the Worker. A
 * Cloudflare D1 or runtime error may echo a bound row value (visitor IP, user
 * agent, referer), a destination URL or a credential, so those shapes are
 * redacted before the message reaches Sentry or the native console.
 *
 * Order matters: URLs and bearer tokens are removed before the generic
 * `key=value` rule, so a credential cannot survive inside a longer match.
 */
const SENSITIVE_MESSAGE_PATTERNS: readonly RegExp[] = [
  /[a-z][a-z0-9+.-]*:\/\/\S+/gi,
  /\bbearer\s+\S+/gi,
  // A credential key may carry a prefix or suffix joined by `_`, `.` or `-`
  // (`x_api_key`, `client_secret`, `Set-Cookie`), and a cookie header carries
  // more `name=value` pairs after the first one.
  /(^|[^\w-])(?:[\w.-]*[_.-])?(?:authorization|cookie|token|secret|password|passwd|pwd|api[_-]?key|apikey|access[_-]?key|session|csrf)(?:[_.-][\w.-]*)?\s*[:=]\s*[^\s;]+(?:\s*;\s*[^\s;=]+=[^\s;]*)*/gi,
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/g,
];

/**
 * IPv6 literals are matched in two steps because a single expression that covers
 * compressed (`::1`), zoned (`fe80::1%eth0`) and IPv4-mapped
 * (`::ffff:203.0.113.9`) forms without also matching clock times or `a::b` scope
 * operators is neither readable nor cheap: overlapping optional halves let a
 * hostile colon run be re-split and re-tested until the scan costs seconds.
 *
 * Instead the message is tokenized into maximal runs of address characters. The
 * pattern is one character class with one quantifier, so each character is
 * consumed once and the scan is linear in the message length. Length-bounded
 * validation then decides, in `isIpv6Address`, whether a token is an address.
 */
const IPV6_TOKEN_PATTERN = /[0-9A-Za-z:._%-]+/g;

const IPV6_GROUP_PATTERN = /^[0-9a-f]{1,4}$/i;
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function isIpv6Address(address: string): boolean {
  const halves = address.split('::');

  if (halves.length > 2) {
    return false;
  }

  const isCompressed = halves.length === 2;
  const groups = halves
    .flatMap((half) => (half === '' ? [] : half.split(':')))
    .filter((group) => group !== '');
  let maxGroups = 8;

  if (groups.length > 0 && groups[groups.length - 1].includes('.')) {
    if (!IPV4_PATTERN.test(groups[groups.length - 1])) {
      return false;
    }

    groups.pop();
    maxGroups = 6;
  }

  if (groups.some((group) => !IPV6_GROUP_PATTERN.test(group))) {
    return false;
  }

  return isCompressed ? groups.length <= maxGroups - 1 : groups.length === maxGroups;
}

/**
 * A zone id (`%eth0`) is not part of the address, and a hostile token may repeat
 * or empty the separator, so every `%`-separated segment is validated and the
 * whole token is redacted when any segment is an address. Each segment is
 * checked only when it is short enough to be one, so the total work stays
 * proportional to the token length.
 */
function containsIpv6Address(token: string): boolean {
  return token
    .split('%')
    .some(
      (segment) =>
        segment.length <= MAX_IPV6_ADDRESS_LENGTH &&
        segment.includes(':') &&
        isIpv6Address(segment)
    );
}

function redactIpv6Literals(message: string): string {
  return message.replace(IPV6_TOKEN_PATTERN, (token) =>
    containsIpv6Address(token) ? REDACTION_PLACEHOLDER : token
  );
}

/**
 * Error names are only reported when they are short, plain identifiers. The
 * character class excludes `.`, `:`, `/`, `=`, `;`, `@` and whitespace, so a
 * hostile `name` cannot smuggle a URL, IP address, cookie or credential.
 */
const SAFE_ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

export const UNKNOWN_ERROR_NAME = 'UnknownError';

export interface ClickRecordingContext {
  shortCode: string;
  urlId: string;
}

export interface SafeErrorDetails {
  name: string;
  message: string;
}

export type ClickRecordingErrorReporter = (
  error: unknown,
  context: ClickRecordingContext
) => void | Promise<void>;

/**
 * Reads a property from an unknown throwable without letting a hostile getter
 * escape. A throwing getter must never reject the background `waitUntil`
 * promise.
 */
function readThrowableProperty(error: unknown, key: 'name' | 'message'): unknown {
  try {
    return (error as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/**
 * `instanceof` invokes the `getPrototypeOf` trap of a Proxy and the
 * `Symbol.hasInstance` method of `Error`, both of which can throw. The
 * classification itself therefore has to be contained.
 */
function isErrorInstance(value: unknown): boolean {
  try {
    return value instanceof Error;
  } catch {
    return false;
  }
}

export function toErrorName(error: unknown): string {
  if (!isErrorInstance(error)) {
    return UNKNOWN_ERROR_NAME;
  }

  const name = readThrowableProperty(error, 'name');

  if (
    typeof name === 'string' &&
    name.length <= MAX_REPORTED_ERROR_NAME_LENGTH &&
    SAFE_ERROR_NAME_PATTERN.test(name)
  ) {
    return name;
  }

  return UNKNOWN_ERROR_NAME;
}

/**
 * Only `Error.message` and raw string throwables are reported, and always
 * redacted and bounded. Plain objects, symbols and every other payload collapse
 * to an empty message so that an unexpected throwable cannot smuggle request
 * data, destination URLs, IP addresses or credentials into Sentry.
 */
export function toBoundedErrorMessage(error: unknown): string {
  const raw = isErrorInstance(error) ? readThrowableProperty(error, 'message') : error;

  if (typeof raw !== 'string' || raw.length === 0) {
    return '';
  }

  const message = SENSITIVE_MESSAGE_PATTERNS.reduce(
    (scanned, pattern) => scanned.replace(pattern, (match, prefix?: string) =>
      typeof prefix === 'string' ? `${prefix}${REDACTION_PLACEHOLDER}` : REDACTION_PLACEHOLDER
    ),
    redactIpv6Literals(raw.slice(0, MAX_SCANNED_ERROR_MESSAGE_LENGTH))
  );

  return message.length > MAX_REPORTED_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_REPORTED_ERROR_MESSAGE_LENGTH)}...`
    : message;
}

/**
 * Reduces an unknown throwable to the only two fields that may leave the
 * Worker. Never throws: the background `waitUntil` promise must always resolve.
 */
export function describeThrowable(error: unknown): SafeErrorDetails {
  try {
    return { name: toErrorName(error), message: toBoundedErrorMessage(error) };
  } catch {
    return { name: UNKNOWN_ERROR_NAME, message: '' };
  }
}

/**
 * Builds a brand new `Error` carrying only the normalized name and bounded
 * message. The original throwable is never handed to Sentry, so the SDK cannot
 * serialize a plain object, symbol or any other hostile payload.
 */
export function toSafeReportError(error: unknown): Error {
  const { name, message } = describeThrowable(error);
  const safeError = new Error(message);
  safeError.name = name;

  return safeError;
}
