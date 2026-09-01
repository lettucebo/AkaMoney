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
  describeThrowable,
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
   * A run of ambiguous characters that ends in a character no address may
   * contain. The terminator has to sit inside the scanned prefix, because that
   * is what forces a scanner to reconsider every way of splitting the run.
   */
  function adversarialRun(unit: string, terminator: string): string {
    return `${unit.repeat(Math.floor(900 / unit.length))}${terminator}`;
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

