import { describe, expect, it, vi } from 'vitest';
import {
  BACKGROUND_ANALYTICS_ERROR_MESSAGE,
  BACKGROUND_CLICK_RECORDING_OPERATION,
  BACKGROUND_OPERATION_TAG_KEY,
  CLICK_RECORDING_OPERATION_NAME,
  MAX_IPV6_ADDRESS_LENGTH,
  MAX_REPORTED_ERROR_MESSAGE_LENGTH,
  MAX_REPORTED_ERROR_NAME_LENGTH,
  MAX_SCANNED_ERROR_MESSAGE_LENGTH,
  REDACTION_PLACEHOLDER,
  describeThrowable,
  redactSensitiveAssignments,
  scanSensitiveAssignments,
  toBoundedErrorMessage,
  toErrorName,
  toSafeReportError,
} from '../observability';

async function importObservabilityWithConsoleError(consoleError: (...args: unknown[]) => void) {
  vi.resetModules();
  const originalConsoleError = console.error;
  console.error = consoleError as typeof console.error;

  try {
    return await import('../observability');
  } finally {
    console.error = originalConsoleError;
  }
}

/**
 * The credential pattern exactly as it stood in `observability.ts` before the
 * bounded scanner replaced it (23414d0). Frozen in test code so the differential
 * privacy oracle and the cost discriminator below cannot drift with the
 * implementation they are meant to check.
 */
const SUPERSEDED_CREDENTIAL_PATTERN_SOURCE =
  '(^|[^\\w-])(?:[\\w.-]*[_.-])?' +
  '(?:authorization|cookie|token|secret|password|passwd|pwd|api[_-]?key|apikey|' +
  'access[_-]?key|session|csrf)' +
  '(?:[_.-][\\w.-]*)?\\s*[:=]\\s*[^\\s;]+(?:\\s*;\\s*[^\\s;=]+=[^\\s;]*)*';

function supersededRedact(message: string): string {
  return message.replace(
    new RegExp(SUPERSEDED_CREDENTIAL_PATTERN_SOURCE, 'gi'),
    (_match: string, boundary: string) => `${boundary}${REDACTION_PLACEHOLDER}`
  );
}

describe('background observability primitives', () => {
  it('binds the console error function that existed at module evaluation', async () => {
    const nativeConsoleError = vi.fn();
    const observability = await importObservabilityWithConsoleError(nativeConsoleError);

    const lateConsoleError = vi.fn();
    const originalConsoleError = console.error;
    console.error = lateConsoleError as typeof console.error;

    try {
      observability.nativeConsoleError('boom', { shortCode: 'abc123' });
    } finally {
      console.error = originalConsoleError;
    }

    expect(nativeConsoleError).toHaveBeenCalledTimes(1);
    expect(nativeConsoleError).toHaveBeenCalledWith('boom', { shortCode: 'abc123' });
    expect(lateConsoleError).not.toHaveBeenCalled();
  });

  it('exposes stable identifiers for background click recording reports', () => {
    expect(BACKGROUND_ANALYTICS_ERROR_MESSAGE).toBe('Redirect background analytics failed');
    expect(BACKGROUND_OPERATION_TAG_KEY).toBe('background_operation');
    expect(BACKGROUND_CLICK_RECORDING_OPERATION).toBe('redirect.click_recording');
    expect(CLICK_RECORDING_OPERATION_NAME).toBe('recordClick');
  });

  it('derives the error name from Error instances and falls back for unknown throwables', () => {
    expect(toErrorName(new TypeError('bad'))).toBe('TypeError');
    expect(toErrorName(new Error('bad'))).toBe('Error');
    expect(toErrorName('a string failure')).toBe('UnknownError');
    expect(toErrorName({ secret: 'value' })).toBe('UnknownError');
  });

  it('bounds the reported error message and never serializes non-error payloads', () => {
    const longMessage = 'x'.repeat(MAX_REPORTED_ERROR_MESSAGE_LENGTH + 50);

    expect(toBoundedErrorMessage(new Error('D1 insert failed'))).toBe('D1 insert failed');
    expect(toBoundedErrorMessage(longMessage)).toBe(
      `${'x'.repeat(MAX_REPORTED_ERROR_MESSAGE_LENGTH)}...`
    );
    expect(toBoundedErrorMessage(new Error(longMessage))).toBe(
      `${'x'.repeat(MAX_REPORTED_ERROR_MESSAGE_LENGTH)}...`
    );
    expect(toBoundedErrorMessage({ authorization: 'Bearer secret' })).toBe('');
    expect(toBoundedErrorMessage(undefined)).toBe('');
  });

  it('redacts URLs, IP addresses and credential assignments from the reported message', () => {
    expect(
      toBoundedErrorMessage(
        new Error('D1 write failed for https://example.com/page?token=super-secret-token')
      )
    ).toBe('D1 write failed for [redacted]');
    expect(toBoundedErrorMessage(new Error('D1 write failed for 203.0.113.9'))).toBe(
      'D1 write failed for [redacted]'
    );
    expect(
      toBoundedErrorMessage(new Error('D1 write failed for 2001:0db8:85a3:0000:0000:8a2e:0370:7334'))
    ).toBe('D1 write failed for [redacted]');
    expect(
      toBoundedErrorMessage(new Error('rejected: authorization=Bearer super-secret-token'))
    ).toBe('rejected: [redacted]');
    expect(toBoundedErrorMessage(new Error('rejected: session=cookie-secret'))).toBe(
      'rejected: [redacted]'
    );
    expect(toBoundedErrorMessage('user-agent Mozilla/5.0 from 198.51.100.7 was rejected')).toBe(
      'user-agent Mozilla/5.0 from [redacted] was rejected'
    );
  });

  it('keeps ordinary D1 diagnostics intact', () => {
    const diagnostic = 'D1_ERROR: UNIQUE constraint failed: click_records.id: SQLITE_CONSTRAINT';

    expect(toBoundedErrorMessage(new Error(diagnostic))).toBe(diagnostic);
  });

  it('redacts compressed, zoned and IPv4-mapped IPv6 literals', () => {
    expect(toBoundedErrorMessage(new Error('D1 write failed from ::1'))).toBe(
      'D1 write failed from [redacted]'
    );
    expect(toBoundedErrorMessage(new Error('D1 write failed from 2001:db8::1'))).toBe(
      'D1 write failed from [redacted]'
    );
    expect(toBoundedErrorMessage(new Error('D1 write failed from 2606:4700:4700::1111'))).toBe(
      'D1 write failed from [redacted]'
    );
    expect(toBoundedErrorMessage(new Error('D1 write failed from fe80::1%eth0'))).toBe(
      'D1 write failed from [redacted]'
    );
    expect(toBoundedErrorMessage(new Error('D1 write failed from ::ffff:203.0.113.9'))).toBe(
      'D1 write failed from [redacted]'
    );
  });

  it('leaves colon-separated text that is not an IPv6 literal untouched', () => {
    expect(toBoundedErrorMessage(new Error('retry scheduled at 12:30:45'))).toBe(
      'retry scheduled at 12:30:45'
    );
    expect(toBoundedErrorMessage(new Error('namespace foo::bar failed'))).toBe(
      'namespace foo::bar failed'
    );
    expect(toBoundedErrorMessage(new Error('binding 1:2:3 rejected'))).toBe(
      'binding 1:2:3 rejected'
    );
  });

  it('redacts IPv6 literals at the longest textual form and behind any zone id', () => {
    const longestLiteral = '0000:0000:0000:0000:0000:ffff:255.255.255.255';

    expect(longestLiteral.length).toBe(MAX_IPV6_ADDRESS_LENGTH);
    expect(toBoundedErrorMessage(new Error(`D1 write failed from ${longestLiteral}`))).toBe(
      'D1 write failed from [redacted]'
    );
    expect(
      toBoundedErrorMessage(new Error(`D1 write failed from fe80::1%${'a'.repeat(200)}`))
    ).toBe('D1 write failed from [redacted]');
    expect(toBoundedErrorMessage(new Error('D1 write failed from ::1%'))).toBe(
      'D1 write failed from [redacted]'
    );
    expect(toBoundedErrorMessage(new Error('D1 write failed from ::1%eth0%bad'))).toBe(
      'D1 write failed from [redacted]'
    );
    expect(toBoundedErrorMessage(new Error('D1 write failed from [::1]:8080'))).toBe(
      'D1 write failed from [[redacted]]:8080'
    );
    expect(
      toBoundedErrorMessage(new Error(`D1 write failed from 2001:db8::1${'z'.repeat(60)}`))
    ).toBe(`D1 write failed from 2001:db8::1${'z'.repeat(60)}`);
  });

  it('redacts credential keys that carry prefixes, suffixes and extra cookie pairs', () => {
    expect(toBoundedErrorMessage(new Error('rejected x_api_key=sk_live_ABC123'))).toBe(
      'rejected [redacted]'
    );
    expect(toBoundedErrorMessage(new Error('rejected client_secret=super-secret'))).toBe(
      'rejected [redacted]'
    );
    expect(toBoundedErrorMessage(new Error('rejected refresh_token=abc123'))).toBe(
      'rejected [redacted]'
    );
    expect(toBoundedErrorMessage(new Error('rejected Cookie: a=b; c=d'))).toBe(
      'rejected [redacted]'
    );
    expect(toBoundedErrorMessage(new Error('rejected X-Api-Key: sk_live_ABC123'))).toBe(
      'rejected [redacted]'
    );
  });

  it('does not redact ordinary words that merely contain a credential keyword', () => {
    expect(toBoundedErrorMessage(new Error('row inside: 42'))).toBe('row inside: 42');
    expect(toBoundedErrorMessage(new Error('tokenizer: 5 rows'))).toBe('tokenizer: 5 rows');
  });

  it('never throws for a throwable whose prototype lookup throws', () => {
    const hostileThrowable = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('prototype trap');
        },
      }
    );

    expect(describeThrowable(hostileThrowable)).toEqual({
      name: 'UnknownError',
      message: '',
    });
  });

  it('rejects error names that are not bounded allowlisted identifiers', () => {
    const urlNamed = new Error('boom');
    urlNamed.name = 'https://example.com/page?token=super-secret-token';
    const ipNamed = new Error('boom');
    ipNamed.name = '203.0.113.9';
    const overLongName = new Error('boom');
    overLongName.name = 'E'.repeat(MAX_REPORTED_ERROR_NAME_LENGTH + 1);
    const boundedName = new Error('boom');
    boundedName.name = 'E'.repeat(MAX_REPORTED_ERROR_NAME_LENGTH);

    expect(toErrorName(urlNamed)).toBe('UnknownError');
    expect(toErrorName(ipNamed)).toBe('UnknownError');
    expect(toErrorName(overLongName)).toBe('UnknownError');
    expect(toErrorName(boundedName)).toBe('E'.repeat(MAX_REPORTED_ERROR_NAME_LENGTH));
  });

  it('never throws while describing a throwable with hostile property getters', () => {
    const hostileThrowable = new Error('safe');
    Object.defineProperty(hostileThrowable, 'message', {
      get() {
        throw new Error('message getter exploded');
      },
    });
    Object.defineProperty(hostileThrowable, 'name', {
      get() {
        throw new Error('name getter exploded');
      },
    });

    expect(describeThrowable(hostileThrowable)).toEqual({
      name: 'UnknownError',
      message: '',
    });
  });

  it('describes throwables with the allowlisted name and bounded message', () => {
    expect(describeThrowable(new TypeError('bad'))).toEqual({ name: 'TypeError', message: 'bad' });
    expect(describeThrowable(Symbol('https://example.com/page'))).toEqual({
      name: 'UnknownError',
      message: '',
    });
    expect(describeThrowable({ cookie: 'session=cookie-secret' })).toEqual({
      name: 'UnknownError',
      message: '',
    });
  });

  it('builds a new safe Error that never references the original throwable', () => {
    const original = new TypeError('D1 insert failed');
    const safeError = toSafeReportError(original);

    expect(safeError).toBeInstanceOf(Error);
    expect(safeError).not.toBe(original);
    expect(safeError.name).toBe('TypeError');
    expect(safeError.message).toBe('D1 insert failed');

    const hostile = toSafeReportError({
      destinationUrl: 'https://example.com/page',
      cookie: 'session=cookie-secret',
    });

    expect(hostile.name).toBe('UnknownError');
    expect(hostile.message).toBe('');
  });
});

/**
 * Credential redaction is the only rule whose replacement decides whether a
 * secret reaches Sentry, so replacing its pattern with a bounded scanner has to
 * be proved not to narrow coverage. The superseded pattern is frozen here as a
 * privacy oracle: over a deterministic corpus, every interval it redacted must
 * still fall inside an interval the scanner redacts.
 *
 * Comparing intervals rather than output is deliberate. An output comparison can
 * be satisfied by a `[redacted]` marker that some other rule produced, or by a
 * message that happens to contain the marker already; an interval comparison
 * cannot.
 */
describe('credential assignment redaction parity', () => {
  interface RedactedInterval {
    start: number;
    end: number;
  }

  /**
   * Intervals the superseded pattern replaced, excluding the leading boundary
   * character its replacer preserved.
   */
  function supersededIntervals(message: string): RedactedInterval[] {
    const pattern = new RegExp(SUPERSEDED_CREDENTIAL_PATTERN_SOURCE, 'gi');
    const intervals: RedactedInterval[] = [];
    let match = pattern.exec(message);

    while (match !== null) {
      intervals.push({
        start: match.index + match[1].length,
        end: match.index + match[0].length,
      });
      match = pattern.exec(message);
    }

    return intervals;
  }

  const KEY_PREFIXES = ['', 'x_', 'x-', 'x.', 'client_', 'a.b-', 'ab', 'a', '.', '_'];

  /** Every keyword, both spellings of the hyphenated ones, and near misses. */
  const KEY_ROOTS = [
    'authorization',
    'cookie',
    'token',
    'secret',
    'password',
    'passwd',
    'pwd',
    'api_key',
    'api-key',
    'apikey',
    'api.key',
    'access_key',
    'access-key',
    'accesskey',
    'session',
    'csrf',
    'tokenizer',
    'inside',
    'authorize',
  ];

  const KEY_SUFFIXES = ['', '_id', '-value', '.name', 'izer', 'x'];

  const KEY_CASINGS = [
    (key: string) => key,
    (key: string) => key.toUpperCase(),
    (key: string) => `${key.slice(0, 1).toUpperCase()}${key.slice(1)}`,
  ];

  /** Delimiter plus every whitespace placement the key grammar tolerates. */
  const SEPARATORS = [':', '=', ' : ', ' =', '=  ', ':\t', ' \n= '];

  const VALUES = [
    'v',
    'super-secret',
    '******',
    'a=b',
    'a=b; c=d',
    '',
    ' ',
    'id=1&token=abc',
    ';',
  ];

  /** Rotated over the key/separator/value product so surroundings vary too. */
  const SURROUNDINGS: readonly (readonly [string, string])[] = [
    ['', ''],
    ['rejected ', ''],
    ['rejected: ', ' tail'],
    ['foo=bar; ', '; c=d'],
    ['D1_ERROR: ', ' token=next'],
    ['a.', '&more=1'],
    ['x', ';'],
    ['-', ' 203.0.113.9'],
    ['\n', '\n'],
    ['params=id=1&', ''],
    ['', '=trailing'],
  ];

  /**
   * Deterministic cross product of key prefix, keyword, suffix, casing,
   * separator and value, with surroundings rotated by case index. Cases are
   * visited rather than materialized so the corpus costs no memory.
   */
  function forEachDifferentialCase(visit: (message: string) => void): number {
    let visited = 0;

    for (const prefix of KEY_PREFIXES) {
      for (const root of KEY_ROOTS) {
        for (const suffix of KEY_SUFFIXES) {
          for (const casing of KEY_CASINGS) {
            const key = casing(`${prefix}${root}${suffix}`);

            for (const separator of SEPARATORS) {
              for (const value of VALUES) {
                const [leading, trailing] = SURROUNDINGS[visited % SURROUNDINGS.length];

                visited += 1;
                visit(`${leading}${key}${separator}${value}${trailing}`);
              }
            }
          }
        }
      }
    }

    return visited;
  }

  it(
    'redacts every assignment the superseded credential pattern redacted',
    () => {
      const coverageFailures: string[] = [];
      const outputFailures: string[] = [];
      let redactedCases = 0;

      const visited = forEachDifferentialCase((message) => {
        const superseded = supersededIntervals(message);
        const { intervals } = scanSensitiveAssignments(message);

        if (superseded.length > 0) {
          redactedCases += 1;
        }

        for (const previous of superseded) {
          const covering = intervals.some(
            (interval) => interval.start <= previous.start && interval.end >= previous.end
          );

          if (!covering && coverageFailures.length < 5) {
            coverageFailures.push(
              `${JSON.stringify(message)} lost ${JSON.stringify(message.slice(previous.start, previous.end))}`
            );
          }
        }

        const redacted = redactSensitiveAssignments(message);

        if (redacted !== supersededRedact(message) && outputFailures.length < 5) {
          outputFailures.push(
            `${JSON.stringify(message)} became ${JSON.stringify(redacted)} not ${JSON.stringify(supersededRedact(message))}`
          );
        }
      });

      expect(coverageFailures).toEqual([]);
      expect(outputFailures).toEqual([]);
      expect(visited).toBeGreaterThanOrEqual(120_000);
      // A corpus that never triggers redaction would prove nothing.
      expect(redactedCases).toBeGreaterThan(visited / 10);
    },
    300_000
  );

  it('reproduces the documented credential redaction semantics exactly', () => {
    const documented: readonly (readonly [string, string])[] = [
      // Bare keywords, connectors, prefixes and suffixes.
      ['rejected: authorization=******', 'rejected: [redacted]'],
      ['rejected: session=cookie-secret', 'rejected: [redacted]'],
      ['rejected x_api_key=sk_live_ABC123', 'rejected [redacted]'],
      ['rejected client_secret=super-secret', 'rejected [redacted]'],
      ['rejected refresh_token=abc123', 'rejected [redacted]'],
      ['rejected X-Api-Key: sk_live_ABC123', 'rejected [redacted]'],
      ['rejected access-key: abc', 'rejected [redacted]'],
      ['rejected csrf.token = abc', 'rejected [redacted]'],
      ['rejected token_v2.legacy=abc', 'rejected [redacted]'],
      // Cookie continuation keeps every later pair inside one marker.
      ['rejected Cookie: a=b; c=d', 'rejected [redacted]'],
      ['rejected cookie: a=b ; c=d ; e=f tail', 'rejected [redacted] tail'],
      ['token=a; secret=b', '[redacted]'],
      // A continuation pair without `=` ends the value.
      ['token=a; bare tail', '[redacted]; bare tail'],
      // Nested and following assignments stay independent candidates.
      ['foo=bar; token=secret', 'foo=bar; [redacted]'],
      ['params=id=1&token=abc', 'params=id=1&[redacted]'],
      ['outer=inner=pwd=x', 'outer=inner=[redacted]'],
      ['a=token=b', 'a=[redacted]'],
      ['rejected: pwd=1 and token=2', 'rejected: [redacted] and [redacted]'],
      // Near misses and benign keys are preserved verbatim.
      ['row inside: 42', 'row inside: 42'],
      ['tokenizer: 5 rows', 'tokenizer: 5 rows'],
      ['xtoken=secret', 'xtoken=secret'],
      ['api.key=abc', 'api.key=abc'],
      ['token[0]=abc', 'token[0]=abc'],
      ['D1_ERROR: UNIQUE constraint failed: click_records.id: SQLITE_CONSTRAINT', 'D1_ERROR: UNIQUE constraint failed: click_records.id: SQLITE_CONSTRAINT'],
      // A key with no value is not an assignment, and the scan resumes after
      // the delimiter so a later credential is still found.
      ['token= ; pwd=1', 'token= ; [redacted]'],
      ['token=; pwd=1', 'token=; [redacted]'],
      ['token:', 'token:'],
      ['token=', 'token='],
      // Whitespace after the delimiter is part of the value grammar, so the
      // next word is the value however far away it looks.
      ['token= and pwd=1', '[redacted] [redacted]'],
    ];

    for (const [message, expected] of documented) {
      expect(redactSensitiveAssignments(message), message).toBe(expected);
      // The frozen pattern agrees, so these are parity assertions too.
      expect(supersededRedact(message), message).toBe(expected);
    }
  });

  /**
   * Sentinel that only ever appears as the innermost value, so any occurrence
   * in a redacted message is a real leak rather than an artefact of the corpus.
   */
  const NESTED_SECRET = 'LEAKSECRET42';

  /**
   * A credential assignment whose value is itself a credential assignment. The
   * value grammar stops at the whitespace in front of the inner delimiter, so
   * the outer replacement ended on the inner key and left the inner value in
   * the diagnostic.
   *
   * These are deliberately *not* parity assertions. The frozen pattern leaks
   * here too, which is why the oracle above is a floor on coverage and never a
   * ceiling.
   */
  it('redacts a credential assignment nested in the value of another one', () => {
    const nested: readonly (readonly [string, string])[] = [
      // The exact finding.
      [`token: token = ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      // Both delimiters, in both positions.
      [`token = token: ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`token: token: ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`token=token = ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      // Case is irrelevant to both keys.
      [`TOKEN : Token = ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`PWD  :  Session  =  ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      // Every whitespace placement the key grammar tolerates, on either side of
      // the inner delimiter, including tabs and newlines.
      [`secret:\tpwd\t=\t${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`token:\n token\n=\n ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`Cookie: authorization =${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`x-api-key: session= ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`client_secret: refresh_token   =   ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      // Prefixed and suffixed keys nest the same way.
      [`csrf.token: x_api_key = ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      // Nesting is followed to any depth.
      [`token: token = token = ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`token: pwd : secret = session = ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      // A compact chain ends on a delimiter rather than on the key, and only
      // its innermost value is separated by whitespace.
      [`token:token=token= ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`TOKEN:Token=session= ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`pwd:pwd:pwd:\t${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`token: token=token = ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      // The cookie continuation swallows a later key when that pair's value is
      // empty, which moved the secret behind the replacement instead of into
      // it. The scan resumed after the swallowed key, so it was never a
      // candidate of its own either.
      [`token: token = a=b; token= ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`Cookie: cookie = a=b; secret= ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`token: token = a=b; token=\t${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`token: token = a=b; token=\n${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`token: token = ${NESTED_SECRET}; secret= ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      // Surrounding diagnostics are preserved byte for byte.
      [`rejected: token: token = ${NESTED_SECRET} tail`, `rejected: [redacted] tail`],
      // The inner value keeps the cookie continuation grammar.
      [`Cookie: cookie = a=b; c=d`, REDACTION_PLACEHOLDER],
      [`token: token = ${NESTED_SECRET}; b=c`, REDACTION_PLACEHOLDER],
      // The scan still resumes after the nested value, so a following
      // assignment stays an independent candidate.
      [`token: token = ${NESTED_SECRET} next=1`, `[redacted] next=1`],
      [`token: token = ${NESTED_SECRET} secret=2`, `[redacted] [redacted]`],
    ];

    for (const [message, expected] of nested) {
      expect(redactSensitiveAssignments(message), message).toBe(expected);
      expect(redactSensitiveAssignments(message), message).not.toContain(NESTED_SECRET);
      expect(toBoundedErrorMessage(new Error(message)), message).not.toContain(NESTED_SECRET);
    }
  });

  /**
   * The extension only follows a nested key that is itself sensitive, so every
   * other shape keeps the semantics the frozen pattern documented — including
   * the accepted unquoted-value-with-spaces limitation, which is unchanged.
   */
  it('keeps non-nested credential semantics identical to the superseded pattern', () => {
    const unchanged: readonly (readonly [string, string])[] = [
      // A benign inner key is not an assignment worth following.
      ['token: user = 42', '[redacted] = 42'],
      ['token: outer=inner=42', '[redacted]'],
      // A sensitive inner key with no delimiter is an ordinary value.
      ['token: token', '[redacted]'],
      ['token: token tail', '[redacted] tail'],
      // A sensitive inner key with a delimiter but no value adds nothing.
      ['token: token =', '[redacted] ='],
      ['token: token=', '[redacted]'],
      // The inner value start is already inside the outer value, so the
      // interval is exactly the one the frozen pattern produced.
      ['token: token=42', '[redacted]'],
      ['token=token=42; c=d', '[redacted]'],
      ['token: token=42 tail', '[redacted] tail'],
      // A value that ends on a benign pair keeps the frozen interval.
      ['token=a; c=d tail', '[redacted] tail'],
      ['token=a; bare tail', '[redacted]; bare tail'],
    ];

    for (const [message, expected] of unchanged) {
      expect(redactSensitiveAssignments(message), message).toBe(expected);
      expect(supersededRedact(message), message).toBe(expected);
    }
  });

  /**
   * The tail rule follows the last key token a value swallowed, wherever that
   * token came from. Two shapes are therefore redacted further than the frozen
   * pattern reached. Both are strict widenings — the interval start is
   * unchanged and only its end moves — so coverage cannot narrow.
   */
  it('redacts further than the superseded pattern where a value swallows a key', () => {
    const widened: readonly (readonly [string, string, string])[] = [
      // A cookie continuation pair whose value is empty swallowed the pair key,
      // and the real value sat behind the whitespace that ended the pair. This
      // shape needs no nesting at all, and leaked before this rule existed.
      [`Cookie: a=b; token= ${NESTED_SECRET}`, REDACTION_PLACEHOLDER, `[redacted] ${NESTED_SECRET}`],
      // A value that merely ends on a credential key, rather than being one.
      [`token: a=b=token = ${NESTED_SECRET}`, REDACTION_PLACEHOLDER, `[redacted] = ${NESTED_SECRET}`],
      // A quoted value is still not parsed as a quoted string — the accepted
      // limitation is unchanged — but its closing key is followed anyway.
      ['token: "token = 42"', REDACTION_PLACEHOLDER, '[redacted] = 42"'],
    ];

    for (const [message, expected, superseded] of widened) {
      expect(redactSensitiveAssignments(message), message).toBe(expected);
      expect(supersededRedact(message), message).toBe(superseded);
    }
  });

  it('redacts nested assignments the superseded pattern leaked', () => {
    const leaked = [
      `token: token = ${NESTED_SECRET}`,
      `Cookie: pwd : ${NESTED_SECRET}`,
      `secret: api_key =${NESTED_SECRET}`,
    ];

    for (const message of leaked) {
      // The oracle is a coverage floor: it may miss what the scanner catches.
      expect(supersededRedact(message), message).toContain(NESTED_SECRET);
      expect(redactSensitiveAssignments(message), message).not.toContain(NESTED_SECRET);
    }
  });

  const NESTED_KEYS = [
    'token',
    'Cookie',
    'AUTHORIZATION',
    'x_api_key',
    'client_secret',
    'csrf.token',
    'access-key',
    'pwd',
    'session',
  ];

  /** Delimiter plus every whitespace placement, applied to both assignments. */
  const NESTED_SEPARATORS = [':', '=', ' : ', ' =', '= ', ' = ', ':\t', '\t=\t', ':\n ', '  =  '];

  /**
   * Every way a value can swallow the key of the assignment that actually holds
   * the sentinel: the value *is* the key, the value is a compact chain ending
   * on a delimiter, the value is a cookie continuation whose last pair value is
   * empty, the key is only the tail of a longer value, and two nesting levels.
   */
  const NESTED_VALUE_SHAPES: readonly ((key: string, separator: string) => string)[] = [
    (key, separator) => `${key}${separator}${NESTED_SECRET}`,
    (key, separator) => `${key}=${key}${separator}${NESTED_SECRET}`,
    (key, separator) => `a=b; ${key}${separator}${NESTED_SECRET}`,
    (key, separator) => `a=b=${key}${separator}${NESTED_SECRET}`,
    (key, separator) => `${key}${separator}${key}${separator}${NESTED_SECRET}`,
  ];

  /**
   * Deterministic cross product of outer key, outer separator, inner key, inner
   * separator and nesting shape, with the surroundings of the parity corpus
   * rotated over it.
   */
  function forEachNestedCase(visit: (message: string) => void): number {
    let visited = 0;

    for (const outerKey of NESTED_KEYS) {
      for (const outerSeparator of NESTED_SEPARATORS) {
        for (const innerKey of NESTED_KEYS) {
          for (const innerSeparator of NESTED_SEPARATORS) {
            for (const shape of NESTED_VALUE_SHAPES) {
              const [leading, trailing] = SURROUNDINGS[visited % SURROUNDINGS.length];

              visited += 1;
              visit(
                `${leading}${outerKey}${outerSeparator}${shape(innerKey, innerSeparator)}` +
                  `${trailing}`
              );
            }
          }
        }
      }
    }

    return visited;
  }

  it('leaves no nested credential value in any key, delimiter or spacing shape', () => {
    const leakFailures: string[] = [];
    const coverageFailures: string[] = [];
    const orderFailures: string[] = [];

    const visited = forEachNestedCase((message) => {
      const redacted = redactSensitiveAssignments(message);

      if (redacted.includes(NESTED_SECRET) && leakFailures.length < 5) {
        leakFailures.push(`${JSON.stringify(message)} became ${JSON.stringify(redacted)}`);
      }

      const { intervals } = scanSensitiveAssignments(message);
      let previousEnd = 0;

      for (const interval of intervals) {
        if (
          (interval.start < previousEnd || interval.end <= interval.start) &&
          orderFailures.length < 5
        ) {
          orderFailures.push(`${JSON.stringify(message)} produced ${JSON.stringify(intervals)}`);
        }

        previousEnd = interval.end;
      }

      for (const previous of supersededIntervals(message)) {
        const covering = intervals.some(
          (interval) => interval.start <= previous.start && interval.end >= previous.end
        );

        if (!covering && coverageFailures.length < 5) {
          coverageFailures.push(
            `${JSON.stringify(message)} lost ${JSON.stringify(message.slice(previous.start, previous.end))}`
          );
        }
      }

      const reported = toBoundedErrorMessage(new Error(message));

      if (reported.includes(NESTED_SECRET) && leakFailures.length < 5) {
        leakFailures.push(`${JSON.stringify(message)} was reported as ${JSON.stringify(reported)}`);
      }
    });

    expect(leakFailures).toEqual([]);
    expect(coverageFailures).toEqual([]);
    expect(orderFailures).toEqual([]);
    expect(visited).toBeGreaterThanOrEqual(40_000);
  });

  it('redacts a credential key whose prefix reaches the scan bound', () => {
    // 992 connector-joined characters of prefix plus `pwd`: the whole key is
    // tested, with no independent key-length limit.
    const nearBoundKey = `${'a.'.repeat(496)}pwd`;
    const nearBoundMessage = `${nearBoundKey}=v`;

    expect(nearBoundKey.length).toBe(995);
    expect(nearBoundMessage.length).toBeLessThan(MAX_SCANNED_ERROR_MESSAGE_LENGTH);
    expect(redactSensitiveAssignments(nearBoundMessage)).toBe(REDACTION_PLACEHOLDER);
    expect(supersededRedact(nearBoundMessage)).toBe(REDACTION_PLACEHOLDER);
    expect(toBoundedErrorMessage(new Error(nearBoundMessage))).toBe(REDACTION_PLACEHOLDER);

    const longSuffixMessage = `pwd.${'b.'.repeat(490)}c=v`;

    expect(longSuffixMessage.length).toBeLessThan(MAX_SCANNED_ERROR_MESSAGE_LENGTH);
    expect(redactSensitiveAssignments(longSuffixMessage)).toBe(REDACTION_PLACEHOLDER);
    expect(supersededRedact(longSuffixMessage)).toBe(REDACTION_PLACEHOLDER);

    // Truncation to the scan bound removes the delimiter, so nothing is an
    // assignment any more and the message is reported as ordinary text.
    const truncatedMessage = `${'a.'.repeat(500)}pwd=v`;

    expect(truncatedMessage.length).toBeGreaterThan(MAX_SCANNED_ERROR_MESSAGE_LENGTH);
    expect(toBoundedErrorMessage(new Error(truncatedMessage))).toBe(
      `${truncatedMessage.slice(0, MAX_REPORTED_ERROR_MESSAGE_LENGTH)}...`
    );
  });

  /**
   * The destructive rules run before the credential scan, so a URL, bearer
   * token or IPv6 literal that ends on a credential key removed the very key
   * the scan needed, and the value behind it survived (#157). The pipeline now
   * evaluates the credential scanner against the original bounded source as
   * well as against the current sequential order, so the erased key is still
   * seen and the assignment behind it is redacted.
   */
  it('redacts an assignment whose key an earlier redaction would erase', () => {
    const closed: readonly (readonly [string, string])[] = [
      [`token=https://example.test/token = ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`token=bearer token = ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`token=2001:db8::1%token = ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      // The URL match also swallows the delimiter, which is why a
      // placeholder-aware tail rule would not have been enough on its own.
      [`token=https://example.test/token= ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
    ];

    for (const [message, expected] of closed) {
      expect(toBoundedErrorMessage(new Error(message)), message).toBe(expected);
      expect(toBoundedErrorMessage(new Error(message)), message).not.toContain(NESTED_SECRET);
    }
  });

  it('keeps URL, IPv4 and IPv6 redaction ordered around the credential scan', () => {
    // The URL rule still consumes a query-string credential whole.
    expect(
      toBoundedErrorMessage(
        new Error('D1 write failed for https://example.com/page?token=super-secret-token')
      )
    ).toBe('D1 write failed for [redacted]');
    // A credential value that is an address is redacted once, by the credential
    // scan, because it runs before the IPv4 rule.
    expect(toBoundedErrorMessage(new Error('rejected token=203.0.113.9'))).toBe('rejected [redacted]');
    expect(toBoundedErrorMessage(new Error('rejected from 203.0.113.9'))).toBe(
      'rejected from [redacted]'
    );
    // IPv6 runs first, so its marker is what the credential scan later sees.
    expect(toBoundedErrorMessage(new Error('rejected token=2001:db8::1'))).toBe(
      'rejected [redacted]'
    );
    // A benign key still keeps its name in the diagnostic.
    expect(toBoundedErrorMessage(new Error('rejected host=2001:db8::1'))).toBe(
      'rejected host=[redacted]'
    );
    expect(toBoundedErrorMessage(new Error('rejected bearer abc123'))).toBe('rejected [redacted]');
  });
});

/**
 * The background reporter runs inside the Worker's CPU budget after the 302 has
 * been returned, so redaction has to stay cheap even for a hostile throwable. A
 * `recordClick` failure can echo an attacker-controlled `user-agent` or
 * `referer`, so these inputs are reachable in production.
 */
describe('redaction scan cost', () => {
  /**
   * Generous: the bounded implementation needs well under a millisecond, so this
   * leaves roughly three orders of magnitude of headroom for a slow or noisy CI
   * machine. Meaningful: the superseded backtracking IPv6 scan needed hundreds
   * of milliseconds for the colon run below on Node 24, so any return to
   * super-linear address scanning fails.
   */
  const MAX_SCAN_DURATION_MS = 50;

  /**
   * Ten milliseconds is generous for a linear scan of a 1000-character prefix —
   * the bounded scanner needs microseconds — and still meaningful: the
   * superseded credential pattern needed tens of milliseconds for the `pwd.`
   * run below on Node 24, so any return to a re-splittable key grammar fails.
   */
  const MAX_CREDENTIAL_SCAN_DURATION_MS = 10;

  /**
   * Credential keyword near misses: runs of keyword fragments joined by the
   * `_`, `.` and `-` connectors the key grammar accepts, none of which ever
   * reaches a `:`/`=` with a value. A scanner that can re-split the run pays for
   * every split point, so these are the shapes that made redaction
   * super-linear. Every message is longer than the scan bound, so each one
   * exercises the full scanned prefix.
   */
  const CREDENTIAL_NEAR_MISS_MESSAGES: readonly string[] = [
    `D1_ERROR: ${'pwd.'.repeat(300)}`,
    `D1_ERROR: ${'token.'.repeat(200)}`,
    `D1_ERROR: ${'secret-'.repeat(200)}`,
    `D1_ERROR: ${'password_'.repeat(150)}`,
    `D1_ERROR: ${'api.key.'.repeat(150)}`,
    `D1_ERROR: ${'csrf-'.repeat(300)}`,
    `D1_ERROR: ${'.'.repeat(1200)}`,
    `D1_ERROR: ${'-.'.repeat(600)}`,
    `D1_ERROR: ${'pwd.'.repeat(300)}z`,
    `D1_ERROR: ${'pwd.'.repeat(300)}=value`,
    `D1_ERROR: ${'benign.'.repeat(150)}=value`,
    `D1_ERROR: ${'pwd.'.repeat(150)}=v ${'pwd.'.repeat(150)}=v`,
    // The delimiter of these sits *inside* the scanned prefix, so the whole
    // near-miss run reaches the anchored key predicate as one token. Without
    // them the predicate would never be measured on a bound-length key.
    `D1_ERROR: ${'pwd.'.repeat(245)}x=v${' tail'.repeat(20)}`,
    `D1_ERROR: ${'pwdx.'.repeat(195)}y=v${' tail'.repeat(20)}`,
    `D1_ERROR: ${'zzzz.'.repeat(195)}y=v${' tail'.repeat(20)}`,
    `D1_ERROR: ${'pwd_.-'.repeat(163)}q=v${' tail'.repeat(20)}`,
    `D1_ERROR: ${'.'.repeat(985)}=v${' tail'.repeat(20)}`,
  ];

  /**
   * Chains of credential assignments whose values open further credential
   * assignments. The nesting extension parses regions that begin strictly after
   * the previous one ended, so these have to cost the same as a flat scan; an
   * extension that re-parsed the value would pay for the whole tail again at
   * every depth. Every message is longer than the scan bound.
   */
  const NESTED_ASSIGNMENT_MESSAGES: readonly string[] = [
    `D1_ERROR: ${'token = '.repeat(200)}v`,
    `D1_ERROR: ${'pwd : '.repeat(250)}v`,
    `D1_ERROR: ${'a.pwd = '.repeat(200)}v`,
    `D1_ERROR: ${'token=token = '.repeat(100)}v`,
    `D1_ERROR: ${'cookie:'.repeat(200)}v`,
    `D1_ERROR: token: ${'session = '.repeat(150)}v`,
    // Values that swallow a key at their tail rather than at their start: a
    // compact chain ending on a delimiter, a cookie continuation whose last
    // pair value is empty, and a key long enough that walking back over it
    // would dominate the scan if it were re-walked.
    `D1_ERROR: ${'token=token= '.repeat(80)}v`,
    `D1_ERROR: ${'token: a=b; token= '.repeat(60)}v`,
    `D1_ERROR: token: ${`${'a.'.repeat(100)}pwd = `.repeat(6)}v`,
  ];

  /**
   * A run of ambiguous characters that ends in a character no address may
   * contain. The terminator has to sit inside the scanned prefix, because that
   * is what forces a scanner to reconsider every way of splitting the run.
   */
  function adversarialRun(unit: string, terminator: string): string {
    return `${unit.repeat(Math.floor(900 / unit.length))}${terminator}`;
  }

  /**
   * Warms the call up outside the measurement so JIT compilation is not billed
   * to the first batch, then reports the fastest batch average. A batch minimum
   * is far more stable than a single sample: a scheduler preemption inflates one
   * batch, not the minimum of five.
   */
  function fastestBatchAverageMs(scan: () => void, callsPerBatch = 5, batches = 5): number {
    for (let warmUp = 0; warmUp < callsPerBatch; warmUp += 1) {
      scan();
    }

    let fastestAverage = Number.POSITIVE_INFINITY;

    for (let batch = 0; batch < batches; batch += 1) {
      const start = performance.now();

      for (let call = 0; call < callsPerBatch; call += 1) {
        scan();
      }

      fastestAverage = Math.min(fastestAverage, (performance.now() - start) / callsPerBatch);
    }

    return fastestAverage;
  }

  function adversarialMessage(run: string, totalLength: number): string {
    const prefix = 'D1_ERROR: write failed for ';
    const repeats = Math.ceil((totalLength - prefix.length) / (run.length + 1));

    return `${prefix}${`${run} `.repeat(repeats)}`;
  }

  function fastestRun(scan: () => void, attempts = 2): number {
    let fastest = Number.POSITIVE_INFINITY;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const start = performance.now();
      scan();
      fastest = Math.min(fastest, performance.now() - start);
    }

    return fastest;
  }

  it(
    'scans a long adversarial colon run in bounded time without redacting it',
    () => {
      const adversarial = adversarialMessage(adversarialRun(':', 'z'), 2000);
      let redacted = '';

      expect(adversarial.length).toBeGreaterThan(2000 - 1);

      const elapsed = fastestRun(() => {
        redacted = toBoundedErrorMessage(new Error(adversarial));
      });

      expect(elapsed).toBeLessThan(MAX_SCAN_DURATION_MS);
      expect(redacted).not.toContain('[redacted]');
      expect(redacted).toBe(`${adversarial.slice(0, MAX_REPORTED_ERROR_MESSAGE_LENGTH)}...`);
    },
    30_000
  );

  it(
    'keeps the scan cost independent of how long the throwable message is',
    () => {
      const runs = [
        adversarialRun(':', 'z'),
        adversarialRun('0:', 'z'),
        adversarialRun('a:', '_'),
        adversarialRun(':.', 'z'),
        adversarialRun('fe80::1%', 'z'),
        adversarialRun('a_', '='),
      ];

      for (const run of runs) {
        for (const length of [1000, 2000, 20_000]) {
          const elapsed = fastestRun(() => {
            toBoundedErrorMessage(new Error(adversarialMessage(run, length)));
          });

          expect(elapsed).toBeLessThan(MAX_SCAN_DURATION_MS);
        }
      }
    },
    60_000
  );

  it(
    'scans credential keyword near-miss runs in bounded time',
    () => {
      for (const message of CREDENTIAL_NEAR_MISS_MESSAGES) {
        expect(message.length).toBeGreaterThan(MAX_SCANNED_ERROR_MESSAGE_LENGTH);

        const elapsed = fastestBatchAverageMs(() => {
          toBoundedErrorMessage(new Error(message));
        });

        expect(elapsed).toBeLessThan(MAX_CREDENTIAL_SCAN_DURATION_MS);
      }
    },
    300_000
  );

  it(
    'scans deeply nested credential assignments in bounded time',
    () => {
      for (const message of NESTED_ASSIGNMENT_MESSAGES) {
        expect(message.length).toBeGreaterThan(MAX_SCANNED_ERROR_MESSAGE_LENGTH);
        // Proves the shape reaches the nesting extension instead of bailing out
        // on the first assignment, so the measurement below is meaningful.
        expect(toBoundedErrorMessage(new Error(message))).toContain(
          `D1_ERROR: ${REDACTION_PLACEHOLDER}`
        );

        const elapsed = fastestBatchAverageMs(() => {
          toBoundedErrorMessage(new Error(message));
        });

        expect(elapsed).toBeLessThan(MAX_CREDENTIAL_SCAN_DURATION_MS);
      }
    },
    300_000
  );

  /**
   * Proves the threshold above discriminates rather than merely passing, by
   * measuring the superseded pattern on the same input, machine and run.
   *
   * The absolute floor is the binding acceptance criterion: the 1000-character
   * `pwd.` near miss has to cost more than the threshold the scanner has to stay
   * under, or the threshold proves nothing. It is measured as the *minimum* of
   * five batch averages, so scheduler noise can only inflate discarded samples —
   * the assertion can fail only if the superseded pattern genuinely runs in
   * under 10 ms, which is the case where this oracle would have stopped
   * discriminating and should be re-examined rather than silently trusted.
   *
   * The ratio is the stability check: it is independent of machine speed, and
   * the measured margin is three orders of magnitude.
   */
  it(
    'is orders of magnitude cheaper than the superseded credential pattern',
    () => {
      const nearMiss = `D1_ERROR: ${'pwd.'.repeat(300)}`.slice(
        0,
        MAX_SCANNED_ERROR_MESSAGE_LENGTH
      );

      const supersededCost = fastestBatchAverageMs(() => {
        supersededRedact(nearMiss);
      }, 2);
      const scannerCost = fastestBatchAverageMs(() => {
        redactSensitiveAssignments(nearMiss);
      }, 200);

      expect(supersededRedact(nearMiss)).toBe(nearMiss);
      expect(redactSensitiveAssignments(nearMiss)).toBe(nearMiss);
      expect(supersededCost).toBeGreaterThan(MAX_CREDENTIAL_SCAN_DURATION_MS);
      expect(supersededCost).toBeGreaterThan(scannerCost * 20);
    },
    300_000
  );

  /**
   * A wall-clock threshold cannot distinguish a linear scan from a fast machine.
   * The scanner therefore reports how many characters it consumed and how many
   * it handed to the key predicate, which are deterministic and machine
   * independent: every character is read a bounded number of times, and the
   * disjoint key tokens can never total more than the message.
   */
  it('inspects a bounded multiple of the characters it scans', () => {
    const shapes = [
      ...CREDENTIAL_NEAR_MISS_MESSAGES,
      ...NESTED_ASSIGNMENT_MESSAGES,
      'pwd=v; secret=w; token=x',
      `${'pwd=v; '.repeat(200)}`,
      `${'benign=v; '.repeat(200)}`,
      `${' '.repeat(500)}pwd:${' '.repeat(500)}`,
      `${'a'.repeat(1000)}=`,
    ];

    for (const message of shapes) {
      const { metrics } = scanSensitiveAssignments(message);

      expect(metrics.inspectedCharacters).toBeLessThanOrEqual(3 * message.length);
      expect(metrics.keyCharacters).toBeLessThanOrEqual(message.length);
      expect(metrics.keyEvaluations).toBeLessThanOrEqual(message.length);
    }
  });

  it('keeps the work per scanned character constant as the message grows', () => {
    for (const unit of [
      'pwd.',
      'pwd=v; ',
      'benign=v; ',
      'a b ',
      'token = ',
      'a.pwd : ',
      'token=token= ',
      'token: a=b; token= ',
    ]) {
      const perCharacter = [250, 500, 1000, 2000].map((repeats) => {
        const message = unit.repeat(repeats);

        return scanSensitiveAssignments(message).metrics.inspectedCharacters / message.length;
      });

      // Super-linear work would grow this ratio with the message length.
      expect(Math.max(...perCharacter) / Math.min(...perCharacter)).toBeLessThan(1.1);
    }
  });

  it('scans a bounded prefix that is wider than the reported message', () => {
    // A secret must not survive because truncation split it before redaction.
    expect(MAX_SCANNED_ERROR_MESSAGE_LENGTH).toBeGreaterThan(MAX_REPORTED_ERROR_MESSAGE_LENGTH);

    const straddling = `${'x'.repeat(MAX_REPORTED_ERROR_MESSAGE_LENGTH - 5)} 2001:db8::1 tail`;
    const redacted = toBoundedErrorMessage(new Error(straddling));

    expect(redacted).not.toContain('2001:db8');
    expect(redacted).toContain('[red');
    expect(redacted.length).toBe(MAX_REPORTED_ERROR_MESSAGE_LENGTH + 3);
  });
});

