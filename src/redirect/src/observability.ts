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
 */
const URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/\S+/gi;
const BEARER_TOKEN_PATTERN = /\bbearer\s+\S+/gi;
const IPV4_ADDRESS_PATTERN = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;

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
 * Maximal run of credential-key characters. The character class is the one the
 * superseded credential pattern accepted inside a key, so a token is exactly the
 * text that pattern could have treated as a key.
 */
const ASSIGNMENT_KEY_TOKEN_PATTERN = /[\w.-]+/g;

/** Optional whitespace, consumed from a fixed offset and never re-split. */
const WHITESPACE_RUN_PATTERN = /\s*/y;

/**
 * The value grammar of the superseded credential pattern without its leading
 * `\s*`, which the scanner skips separately: one nonempty value, plus the
 * semicolon continuation that keeps every later `name=value` pair of a cookie
 * header inside the same replacement. Dropping the leading `\s*` changes
 * nothing, because `[^\s;]` can never match a whitespace character the greedy
 * `\s*` gave back.
 */
const ASSIGNMENT_VALUE_PATTERN = /[^\s;]+(?:\s*;\s*[^\s;=]+=[^\s;]*)*/y;

/**
 * The key half of the superseded credential pattern, anchored to a whole token.
 * The keyword may carry a prefix or a suffix joined by `_`, `.` or `-`
 * (`x_api_key`, `client_secret`, `Set-Cookie`), and neither is length limited.
 *
 * Anchoring is what removes the super-linear cost. The prefix and suffix groups
 * still overlap on the connectors, so the engine still re-splits them — but only
 * inside one token it has already consumed, and never at a new start offset. A
 * run of keyword near misses such as `pwd.pwd.pwd.` used to make the unanchored
 * pattern retry the keyword alternation at every split point of every suffix of
 * the run; here each token is tested once.
 */
const CREDENTIAL_KEY_PATTERN =
  /^(?:[\w.-]*[_.-])?(?:authorization|cookie|token|secret|password|passwd|pwd|api[_-]?key|apikey|access[_-]?key|session|csrf)(?:[_.-][\w.-]*)?$/i;

/** Half-open `[start, end)` range of a message that must be replaced. */
export interface SensitiveAssignmentInterval {
  readonly start: number;
  readonly end: number;
}

/**
 * Deterministic counters that make the linearity of the scan assertable without
 * relying on wall-clock time. `inspectedCharacters` counts every character the
 * scanner consumes, including the ones a rejected delimiter or value lookahead
 * causes the next token search to re-read; `keyCharacters` counts the characters
 * handed to the anchored key predicate. Because tokens are maximal and disjoint,
 * both are bounded by a small multiple of the message length.
 */
export interface SensitiveAssignmentScanMetrics {
  readonly inspectedCharacters: number;
  readonly keyEvaluations: number;
  readonly keyCharacters: number;
}

export interface SensitiveAssignmentScan {
  readonly intervals: readonly SensitiveAssignmentInterval[];
  readonly metrics: SensitiveAssignmentScanMetrics;
}

/**
 * Single left-to-right pass that collects the credential assignments to redact.
 *
 * Each step consumes a maximal key token, looks past optional whitespace for a
 * `:` or `=`, and tests the whole token against the anchored predicate. A
 * sensitive key consumes its value and continuation and yields one interval; a
 * benign key, or a sensitive key with no value, resumes immediately *after* the
 * delimiter rather than after the value, so a nested or following assignment
 * (`rejected: authorization=…`, `foo=bar; token=…`, `params=id=1&token=…`)
 * remains an independent candidate.
 *
 * The cursor advances by at least one character per step and never moves
 * backwards, so the scan is linear in the message length and always terminates.
 * Intervals are produced in ascending order and cannot overlap.
 */
export function scanSensitiveAssignments(message: string): SensitiveAssignmentScan {
  const intervals: SensitiveAssignmentInterval[] = [];
  let inspectedCharacters = 0;
  let keyEvaluations = 0;
  let keyCharacters = 0;
  let cursor = 0;

  while (cursor < message.length) {
    ASSIGNMENT_KEY_TOKEN_PATTERN.lastIndex = cursor;

    const token = ASSIGNMENT_KEY_TOKEN_PATTERN.exec(message);

    if (token === null) {
      inspectedCharacters += message.length - cursor;
      break;
    }

    const keyStart = token.index;
    const keyEnd = ASSIGNMENT_KEY_TOKEN_PATTERN.lastIndex;

    inspectedCharacters += keyEnd - cursor;

    WHITESPACE_RUN_PATTERN.lastIndex = keyEnd;
    WHITESPACE_RUN_PATTERN.exec(message);

    const delimiterIndex = WHITESPACE_RUN_PATTERN.lastIndex;
    const delimiter = message.charAt(delimiterIndex);

    inspectedCharacters += delimiterIndex - keyEnd + 1;

    if (delimiter !== ':' && delimiter !== '=') {
      // Not an assignment. The token is maximal, so the next candidate key can
      // only begin after it.
      cursor = keyEnd;
      continue;
    }

    keyEvaluations += 1;
    keyCharacters += keyEnd - keyStart;

    if (!CREDENTIAL_KEY_PATTERN.test(token[0])) {
      cursor = delimiterIndex + 1;
      continue;
    }

    WHITESPACE_RUN_PATTERN.lastIndex = delimiterIndex + 1;
    WHITESPACE_RUN_PATTERN.exec(message);

    const valueStart = WHITESPACE_RUN_PATTERN.lastIndex;

    ASSIGNMENT_VALUE_PATTERN.lastIndex = valueStart;

    const value = ASSIGNMENT_VALUE_PATTERN.exec(message);

    if (value === null) {
      // A sensitive key with an empty value hides nothing, so it is left in the
      // diagnostic exactly as the superseded pattern left it.
      inspectedCharacters += valueStart - delimiterIndex;
      cursor = delimiterIndex + 1;
      continue;
    }

    const valueEnd = ASSIGNMENT_VALUE_PATTERN.lastIndex;

    inspectedCharacters += valueEnd - delimiterIndex;
    intervals.push({ start: keyStart, end: valueEnd });
    cursor = valueEnd;
  }

  return { intervals, metrics: { inspectedCharacters, keyEvaluations, keyCharacters } };
}

/**
 * Replaces every scanned credential assignment with one marker in a single
 * output pass. Text outside the intervals is preserved byte for byte, including
 * the character in front of a key, which the superseded pattern had to capture
 * and re-emit.
 */
export function redactSensitiveAssignments(message: string): string {
  const { intervals } = scanSensitiveAssignments(message);

  if (intervals.length === 0) {
    return message;
  }

  let redacted = '';
  let copied = 0;

  for (const { start, end } of intervals) {
    redacted += `${message.slice(copied, start)}${REDACTION_PLACEHOLDER}`;
    copied = end;
  }

  return `${redacted}${message.slice(copied)}`;
}

/**
 * Ordered redaction steps. Order matters: IPv6 literals are tokenized first, and
 * URLs and bearer tokens are removed before the generic assignment scan, so a
 * credential cannot survive inside a longer match.
 */
const MESSAGE_REDACTION_STEPS: readonly ((message: string) => string)[] = [
  redactIpv6Literals,
  (message) => message.replace(URL_PATTERN, () => REDACTION_PLACEHOLDER),
  (message) => message.replace(BEARER_TOKEN_PATTERN, () => REDACTION_PLACEHOLDER),
  redactSensitiveAssignments,
  (message) => message.replace(IPV4_ADDRESS_PATTERN, () => REDACTION_PLACEHOLDER),
];

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

  const message = MESSAGE_REDACTION_STEPS.reduce(
    (scanned, redact) => redact(scanned),
    raw.slice(0, MAX_SCANNED_ERROR_MESSAGE_LENGTH)
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
