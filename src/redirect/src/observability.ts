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
const BEARER_TOKEN_PATTERN = /\bbearer\s+\S+/gi;
const IPV4_ADDRESS_PATTERN = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;

/**
 * The superseded URL pattern was `/[a-z][a-z0-9+.-]*:\/\/\S+/gi`. Its
 * `[a-z0-9+.-]*` overlaps its own leading `[a-z]`, so for a message with no
 * `://` the engine restarted at every letter, consumed the rest of the input
 * and gave it all back — quadratic work with no shared state between start
 * offsets (issue #156).
 *
 * These three classes reproduce that grammar one character at a time. They are
 * deliberately written without the `i` flag and without `u`: the superseded
 * pattern used `[a-z]`/`[a-z0-9+.-]` under `i`, and non-Unicode
 * case-insensitive canonicalization never folds a non-ASCII code unit onto an
 * ASCII one, so the accepted set is exactly ASCII. `\s` is the JavaScript
 * whitespace set, in which U+0085 is *not* whitespace while U+00A0 and U+FEFF
 * are; testing one code unit against `\s` keeps that semantics exact.
 */
const SCHEME_CHARACTER_PATTERN = /[A-Za-z0-9+.-]/;
const SCHEME_ALPHABETIC_PATTERN = /[A-Za-z]/;
const WHITESPACE_CHARACTER_PATTERN = /\s/;
const SCHEME_SEPARATOR = '://';

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

/** Half-open `[start, end)` range of a message that a rule replaces. */
export interface RedactionInterval {
  readonly start: number;
  readonly end: number;
}

/**
 * Ascending, non-overlapping ranges of every match of a global pattern, so a
 * rule can report where it matched instead of destroying the text it matched.
 * `accept` filters candidates that still need validation, which is how the
 * IPv6 tokenizer keeps a maximal-token scan linear.
 */
function scanPattern(
  pattern: RegExp,
  message: string,
  accept?: (match: string) => boolean
): RedactionInterval[] {
  const intervals: RedactionInterval[] = [];

  pattern.lastIndex = 0;

  let match = pattern.exec(message);

  while (match !== null) {
    if (match[0].length === 0) {
      // No pattern here can match empty, but a zero-length match would freeze
      // the loop, so the cursor is advanced defensively.
      pattern.lastIndex += 1;
    } else if (accept === undefined || accept(match[0])) {
      intervals.push({ start: match.index, end: match.index + match[0].length });
    }

    match = pattern.exec(message);
  }

  pattern.lastIndex = 0;

  return intervals;
}

function scanIpv6Literals(message: string): RedactionInterval[] {
  return scanPattern(IPV6_TOKEN_PATTERN, message, containsIpv6Address);
}

/**
 * Deterministic counter that makes the linearity of the URL scan assertable
 * without relying on wall-clock time. It sums the spans the finder advances
 * over — each search for `://`, each backward walk over a scheme run, and each
 * forward walk over a payload. All three kinds of span are disjoint across
 * iterations, so the total is bounded by a small multiple of the message
 * length.
 */
export interface UrlScanMetrics {
  readonly inspectedCharacters: number;
}

export interface UrlScan {
  readonly intervals: readonly RedactionInterval[];
  readonly metrics: UrlScanMetrics;
}

/**
 * Single left-to-right pass that collects the URLs to redact, producing exactly
 * the intervals the superseded pattern matched.
 *
 * The equivalence rests on one property of that pattern: because `:` is not a
 * scheme character, the greedy `[a-z0-9+.-]*` can only ever succeed at the end
 * of the *maximal* scheme run it starts in — backtracking it by one character
 * would require a `:` inside the run. So a match exists at offset `s` exactly
 * when `s` is alphabetic and the maximal run containing `s` is closed by
 * `://` with a non-whitespace payload, and the leftmost such `s` is the first
 * alphabetic character of that run. The finder therefore locates each `://`
 * once, walks back over the run once, and takes the first alphabetic character
 * it passed.
 *
 * The cursor is set to the end of a match (matching the non-overlap of a global
 * regular expression) or past the separator of a rejected candidate, so it
 * strictly increases and never moves backwards. A scheme run cannot contain
 * `:`, `/` or whitespace, so the runs walked backwards, the payloads walked
 * forwards and the searches for the next separator are all disjoint, and the
 * whole scan is linear in the message length instead of quadratic.
 */
export function scanUrls(message: string): UrlScan {
  const intervals: RedactionInterval[] = [];
  let inspectedCharacters = 0;
  let cursor = 0;

  while (cursor < message.length) {
    const separator = message.indexOf(SCHEME_SEPARATOR, cursor);

    if (separator < 0) {
      inspectedCharacters += message.length - cursor;
      break;
    }

    const payloadStart = separator + SCHEME_SEPARATOR.length;

    inspectedCharacters += payloadStart - cursor;

    let schemeStart = separator;
    let firstAlphabetic = -1;

    while (schemeStart > 0 && SCHEME_CHARACTER_PATTERN.test(message.charAt(schemeStart - 1))) {
      schemeStart -= 1;

      if (SCHEME_ALPHABETIC_PATTERN.test(message.charAt(schemeStart))) {
        firstAlphabetic = schemeStart;
      }
    }

    inspectedCharacters += separator - schemeStart;

    if (
      firstAlphabetic < 0 ||
      payloadStart >= message.length ||
      WHITESPACE_CHARACTER_PATTERN.test(message.charAt(payloadStart))
    ) {
      // Either no scheme or no payload: the superseded pattern could not match
      // at any offset that this separator closes, and the next candidate can
      // only begin after it.
      cursor = payloadStart;
      continue;
    }

    let end = payloadStart;

    while (end < message.length && !WHITESPACE_CHARACTER_PATTERN.test(message.charAt(end))) {
      end += 1;
    }

    inspectedCharacters += end - payloadStart;
    intervals.push({ start: firstAlphabetic, end });
    cursor = end;
  }

  return { intervals, metrics: { inspectedCharacters } };
}

/**
 * Maximal run of credential-key characters. The character class is the one the
 * superseded credential pattern accepted inside a key, so a token is exactly the
 * text that pattern could have treated as a key.
 */
const ASSIGNMENT_KEY_TOKEN_PATTERN = /[\w.-]+/g;

/**
 * One credential-key character. Used to walk back over the last key token a
 * value consumed, without letting a search restart at a new offset.
 */
const KEY_CHARACTER_PATTERN = /[\w.-]/;

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
export type SensitiveAssignmentInterval = RedactionInterval;

/**
 * Deterministic counters that make the linearity of the scan assertable without
 * relying on wall-clock time. `inspectedCharacters` sums the spans the scanner
 * advances over — each key token, each delimiter lookahead, each value, and
 * each backward walk over a value tail — counting a span again every time the
 * scan revisits it. It is a bound on the work rather than an exact tally of the
 * reads the regular expression engine performs inside a span.
 * `keyCharacters` counts the characters handed to the anchored key predicate.
 * Because the tokens and the parsed regions are maximal and disjoint, both are
 * bounded by a small multiple of the message length.
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

interface NestedAssignmentExtension {
  readonly end: number;
  readonly inspectedCharacters: number;
  readonly keyEvaluations: number;
  readonly keyCharacters: number;
}

/**
 * Extends the replacement of a sensitive assignment over a credential
 * assignment that its own value swallowed.
 *
 * A value ends either on a key token or on that token's `:`/`=` delimiter,
 * because the grammar stops at whitespace and its continuation arm accepts an
 * empty pair value. Both shapes leave a credential key inside the replacement
 * while its real value sits *after* it, and the scan then resumes past the key,
 * so the inner assignment was never a candidate of its own:
 *
 * - `token: token = <secret>` — the value is the inner key, the delimiter and
 *   the secret follow it (issue #153);
 * - `token: token=token= <secret>` — the value is a compact chain that ends on
 *   a delimiter;
 * - `token: token = a=b; token= <secret>` — the cookie continuation ends on a
 *   pair whose value is empty.
 *
 * Each step therefore looks at the *tail* of the value that was just parsed: it
 * walks back over the last key token, checks that a delimiter closes it, and
 * parses the value that follows. The extension applies only when that value
 * starts after the current end, so a nested value the maximal value grammar has
 * already consumed keeps the interval exactly as it was — which is what
 * preserves the documented semantics for every non-dangling shape.
 *
 * The end offset strictly increases, and both the backward walk and the forward
 * parse of an iteration stay inside a region that begins after the previous
 * iteration ended. No character is read more than a bounded number of times and
 * the loop cannot outlast the message.
 */
function extendOverNestedAssignments(
  message: string,
  valueStart: number,
  valueEnd: number
): NestedAssignmentExtension {
  let end = valueEnd;
  let parsedFrom = valueStart;
  let inspectedCharacters = 0;
  let keyEvaluations = 0;
  let keyCharacters = 0;

  for (;;) {
    const tail = message.charAt(end - 1);
    const endsOnDelimiter = tail === ':' || tail === '=';
    const nestedKeyEnd = endsOnDelimiter ? end - 1 : end;
    let nestedKeyStart = nestedKeyEnd;

    while (
      nestedKeyStart > parsedFrom &&
      KEY_CHARACTER_PATTERN.test(message.charAt(nestedKeyStart - 1))
    ) {
      nestedKeyStart -= 1;
    }

    inspectedCharacters += nestedKeyEnd - nestedKeyStart + 1;

    if (nestedKeyStart === nestedKeyEnd) {
      // The value does not end on a key token, so it cannot hide an assignment.
      break;
    }

    let nestedDelimiterIndex = nestedKeyEnd;

    if (!endsOnDelimiter) {
      WHITESPACE_RUN_PATTERN.lastIndex = end;
      WHITESPACE_RUN_PATTERN.exec(message);

      nestedDelimiterIndex = WHITESPACE_RUN_PATTERN.lastIndex;

      const nestedDelimiter = message.charAt(nestedDelimiterIndex);

      inspectedCharacters += nestedDelimiterIndex - end + 1;

      if (nestedDelimiter !== ':' && nestedDelimiter !== '=') {
        break;
      }
    }

    keyEvaluations += 1;
    keyCharacters += nestedKeyEnd - nestedKeyStart;

    if (!CREDENTIAL_KEY_PATTERN.test(message.slice(nestedKeyStart, nestedKeyEnd))) {
      break;
    }

    WHITESPACE_RUN_PATTERN.lastIndex = nestedDelimiterIndex + 1;
    WHITESPACE_RUN_PATTERN.exec(message);

    const nestedValueStart = WHITESPACE_RUN_PATTERN.lastIndex;

    if (nestedValueStart <= end) {
      break;
    }

    ASSIGNMENT_VALUE_PATTERN.lastIndex = nestedValueStart;

    const nestedValue = ASSIGNMENT_VALUE_PATTERN.exec(message);

    if (nestedValue === null) {
      // A nested key with an empty value hides nothing, so the interval stays
      // exactly the one the value grammar alone produced.
      inspectedCharacters += nestedValueStart - end;
      break;
    }

    inspectedCharacters += ASSIGNMENT_VALUE_PATTERN.lastIndex - end;
    parsedFrom = nestedValueStart;
    end = ASSIGNMENT_VALUE_PATTERN.lastIndex;
  }

  return { end, inspectedCharacters, keyEvaluations, keyCharacters };
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
 * A value that ends on a credential key, or on that key's delimiter, extends
 * the interval over the assignment the key opens (`token: token = …`), because
 * the value would otherwise swallow the inner key and expose the inner value.
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

    // A value that swallowed a credential key extends the replacement over the
    // assignment that key opens, so no secret survives behind an outer key.
    const nested = extendOverNestedAssignments(message, valueStart, valueEnd);

    inspectedCharacters += nested.inspectedCharacters;
    keyEvaluations += nested.keyEvaluations;
    keyCharacters += nested.keyCharacters;
    intervals.push({ start: keyStart, end: nested.end });
    cursor = nested.end;
  }

  return { intervals, metrics: { inspectedCharacters, keyEvaluations, keyCharacters } };
}

/**
 * Replaces every scanned credential assignment with one marker in a single
 * output pass. Text outside the intervals is preserved byte for byte, including
 * the character in front of a key, which the superseded pattern had to capture
 * and re-emit.
 *
 * The reporting path composes intervals rather than text, so this is no longer
 * a step of the pipeline: it is the reference form of the credential rule that
 * the differential oracle compares against the superseded pattern, and the
 * only place the replacement semantics of that rule are stated on their own.
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
 * One rendered UTF-16 code unit of the simulated pipeline, and the half-open
 * range of original source units it stands for.
 *
 * A copied unit represents exactly one source unit. A unit of a `[redacted]`
 * marker represents the whole span the replaced match covered, including every
 * source unit that an *earlier* marker inside that match already stood for.
 * That is what lets the simulation reproduce redactions the current textual
 * pipeline only performs because an earlier rule created the boundary a later
 * one needed — for example a URL replacement that gives an IPv4 run its
 * trailing `\b`.
 */
interface AnnotatedText {
  readonly text: string;
  readonly sourceStart: readonly number[];
  readonly sourceEnd: readonly number[];
  readonly synthetic: readonly boolean[];
}

function annotateSource(source: string): AnnotatedText {
  const sourceStart: number[] = [];
  const sourceEnd: number[] = [];
  const synthetic: boolean[] = [];

  for (let index = 0; index < source.length; index += 1) {
    sourceStart.push(index);
    sourceEnd.push(index + 1);
    synthetic.push(false);
  }

  return { text: source, sourceStart, sourceEnd, synthetic };
}

/**
 * Replaces every interval with one marker, exactly as `String.replace` would,
 * while carrying the provenance of the replaced units into the marker.
 *
 * Rendered units always cover the source in order and without gaps, so the
 * union of the provenance of a contiguous rendered range is the contiguous
 * range from its lowest source start to its highest source end.
 */
function applyAnnotatedRedaction(
  annotated: AnnotatedText,
  intervals: readonly RedactionInterval[]
): AnnotatedText {
  if (intervals.length === 0) {
    return annotated;
  }

  let text = '';
  const sourceStart: number[] = [];
  const sourceEnd: number[] = [];
  const synthetic: boolean[] = [];
  let copied = 0;

  const copyUnits = (from: number, to: number): void => {
    for (let index = from; index < to; index += 1) {
      sourceStart.push(annotated.sourceStart[index]);
      sourceEnd.push(annotated.sourceEnd[index]);
      synthetic.push(annotated.synthetic[index]);
    }
  };

  for (const interval of intervals) {
    text += annotated.text.slice(copied, interval.start);
    copyUnits(copied, interval.start);

    let from = Number.POSITIVE_INFINITY;
    let to = Number.NEGATIVE_INFINITY;

    for (let index = interval.start; index < interval.end; index += 1) {
      from = Math.min(from, annotated.sourceStart[index]);
      to = Math.max(to, annotated.sourceEnd[index]);
    }

    text += REDACTION_PLACEHOLDER;

    for (let offset = 0; offset < REDACTION_PLACEHOLDER.length; offset += 1) {
      sourceStart.push(from);
      sourceEnd.push(to);
      synthetic.push(true);
    }

    copied = interval.end;
  }

  text += annotated.text.slice(copied);
  copyUnits(copied, annotated.text.length);

  return { text, sourceStart, sourceEnd, synthetic };
}

/**
 * The redaction rules in their established order, run over an evolving
 * annotated text so that the result is byte-identical to the sequential
 * textual pipeline while every surviving unit still knows where it came from.
 * Order matters: IPv6 literals are tokenized first, and URLs and bearer tokens
 * are removed before the generic assignment scan, so a credential cannot
 * survive inside a longer match.
 */
function simulateSequentialRedaction(source: string): AnnotatedText {
  let annotated = annotateSource(source);

  annotated = applyAnnotatedRedaction(annotated, scanIpv6Literals(annotated.text));
  annotated = applyAnnotatedRedaction(annotated, scanUrls(annotated.text).intervals);
  annotated = applyAnnotatedRedaction(annotated, scanPattern(BEARER_TOKEN_PATTERN, annotated.text));
  annotated = applyAnnotatedRedaction(
    annotated,
    scanSensitiveAssignments(annotated.text).intervals
  );
  annotated = applyAnnotatedRedaction(annotated, scanPattern(IPV4_ADDRESS_PATTERN, annotated.text));

  return annotated;
}

/**
 * A reported message together with the original source units it still shows.
 * The indices are into the bounded source (`raw.slice(0,
 * MAX_SCANNED_ERROR_MESSAGE_LENGTH)`) and are what the privacy oracle checks:
 * they can only ever shrink relative to the previous pipeline.
 */
export interface BoundedMessageRender {
  readonly message: string;
  readonly visibleSourceIndices: readonly number[];
}

/**
 * Builds the reported message from the *original* bounded source rather than
 * from the text an earlier rule already destroyed.
 *
 * A source unit is copied only when both hold:
 *
 * 1. it survived the sequential pipeline above, inside that pipeline's own
 *    200-unit cutoff — so nothing that is hidden or truncated away today can
 *    become visible because overlapping redactions collapse (#157); and
 * 2. it is outside every credential assignment found by scanning the original
 *    source — so an assignment whose key a URL, bearer or IPv6 replacement
 *    erased is redacted anyway (#157).
 *
 * Everything else is hidden, and each maximal run of hidden units becomes one
 * marker. Source beyond the 200-unit window is always hidden, so a visible unit
 * always has an index below the window — which the previous pipeline did not
 * guarantee, because collapsing its markers could shorten the text enough for
 * source past index 200 to survive its cutoff.
 *
 * The `...` suffix therefore marks two things, exactly as it marked truncation
 * before: the rendered message had to be cut to 200 units because markers
 * expanded past it, or the window dropped source text the previous pipeline
 * would have shown. Either way the report never silently loses diagnostic text.
 * Text that is only *redacted* still carries no ellipsis, so a fully redacted
 * message stays `[redacted]` as before.
 */
export function renderBoundedErrorMessage(raw: string): BoundedMessageRender {
  const source = raw.slice(0, MAX_SCANNED_ERROR_MESSAGE_LENGTH);

  if (source.length === 0) {
    return { message: '', visibleSourceIndices: [] };
  }

  const sequential = simulateSequentialRedaction(source);
  const surviving = Math.min(sequential.text.length, MAX_REPORTED_ERROR_MESSAGE_LENGTH);
  const visible = new Uint8Array(source.length);

  for (let index = 0; index < surviving; index += 1) {
    if (!sequential.synthetic[index]) {
      visible[sequential.sourceStart[index]] = 1;
    }
  }

  for (const interval of scanSensitiveAssignments(source).intervals) {
    for (let index = interval.start; index < interval.end && index < source.length; index += 1) {
      visible[index] = 0;
    }
  }

  let omittedVisibleSource = false;

  for (let index = MAX_REPORTED_ERROR_MESSAGE_LENGTH; index < source.length; index += 1) {
    if (visible[index] === 1) {
      omittedVisibleSource = true;
      visible[index] = 0;
    }
  }

  let message = '';
  const renderedSource: number[] = [];
  let index = 0;

  while (index < source.length) {
    if (visible[index] === 1) {
      message += source.charAt(index);
      renderedSource.push(index);
      index += 1;
      continue;
    }

    message += REDACTION_PLACEHOLDER;

    for (let offset = 0; offset < REDACTION_PLACEHOLDER.length; offset += 1) {
      renderedSource.push(-1);
    }

    while (index < source.length && visible[index] === 0) {
      index += 1;
    }
  }

  if (message.length > MAX_REPORTED_ERROR_MESSAGE_LENGTH) {
    return {
      message: `${message.slice(0, MAX_REPORTED_ERROR_MESSAGE_LENGTH)}...`,
      visibleSourceIndices: renderedSource
        .slice(0, MAX_REPORTED_ERROR_MESSAGE_LENGTH)
        .filter((sourceIndex) => sourceIndex >= 0),
    };
  }

  return {
    message: omittedVisibleSource ? `${message}...` : message,
    visibleSourceIndices: renderedSource.filter((sourceIndex) => sourceIndex >= 0),
  };
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

  return renderBoundedErrorMessage(raw).message;
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
