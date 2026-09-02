import { describe, expect, it } from 'vitest';
import {
  MAX_REPORTED_ERROR_MESSAGE_LENGTH,
  MAX_SCANNED_ERROR_MESSAGE_LENGTH,
  REDACTION_PLACEHOLDER,
  renderBoundedErrorMessage,
  scanSensitiveAssignments,
  scanUrls,
  toBoundedErrorMessage,
} from '../observability';

/**
 * Sentinel that only ever appears as the value an earlier destructive rule used
 * to expose, so any occurrence in a reported message is a real leak (#157).
 */
const NESTED_SECRET = 'LEAKSECRET42';

/**
 * The URL pattern exactly as it stood in `observability.ts` before the linear
 * finder replaced it (#156). Frozen in test code so the parity oracle and the
 * cost discriminator cannot drift with the implementation they check.
 */
const FROZEN_URL_PATTERN_SOURCE = '[a-z][a-z0-9+.-]*:\\/\\/\\S+';

function frozenUrlPattern(): RegExp {
  return new RegExp(FROZEN_URL_PATTERN_SOURCE, 'gi');
}

interface Interval {
  readonly start: number;
  readonly end: number;
}

function frozenUrlIntervals(message: string): Interval[] {
  const pattern = frozenUrlPattern();
  const intervals: Interval[] = [];
  let match = pattern.exec(message);

  while (match !== null) {
    intervals.push({ start: match.index, end: match.index + match[0].length });
    match = pattern.exec(message);
  }

  return intervals;
}

function frozenUrlRedact(message: string): string {
  return message.replace(frozenUrlPattern(), () => REDACTION_PLACEHOLDER);
}

/**
 * Warms the call up outside the measurement so JIT compilation is not billed to
 * the first batch, then reports the fastest batch average. A batch minimum is
 * far more stable than a single sample: a scheduler preemption inflates one
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

describe('linear URL redaction interval finder', () => {
  /**
   * Every shape the plan calls out for the backward scheme walk: a run that
   * starts on a digit, a dot, a `+` or a `-`; astral prefixes, which make the
   * UTF-16 code-unit indices differ from code-point indices; repeated `://`;
   * an empty payload; mixed-case schemes; and the exact JavaScript `\s` set,
   * in which U+0085 is *not* whitespace while U+00A0 and U+FEFF are.
   */
  const URL_EDGE_CASES: readonly string[] = [
    '',
    'a://x',
    'A://x',
    'HTTPS://EXAMPLE.TEST/p',
    'a://',
    'a:// b',
    'a://\u00a0b',
    'a://x\u0085y',
    'a://x\ufeffy',
    'a://x\u2028y',
    'a://x\u3000y',
    '1a://x',
    '.a://x',
    '+a://x',
    '-a://x',
    '2001http://x',
    '1.2.3.4a://b',
    '203.0.113.7https://origin.test/p',
    '1://x',
    '1.2://x',
    '://x',
    ':://x',
    'a:://x',
    'a::://x',
    'a://b://c',
    'a://b c://d',
    'a:// c://d',
    '1:// a://b',
    '\ud83d\ude00a://x',
    'a\ud83d\ude00://x',
    'a://\ud83d\ude00x',
    'x\ud83d\ude00://y a://b',
    'D1 write failed for https://example.com/page?token=super-secret-token',
    'token=https://example.test/token = value',
    'token=https://example.test/token= value',
    'scheme+v2://host/path',
    'a.b-c+d://host',
    'ftp://host/a ssh://host/b',
    'no scheme here',
    'foo:/bar',
    'foo://',
    '://',
    'a://a://a://a',
    `${'a'.repeat(50)}://${'b'.repeat(50)}`,
    `${'1'.repeat(50)}://${'b'.repeat(50)}`,
    `${'1'.repeat(50)}:// ${'b'.repeat(50)}`,
  ];

  it('produces exactly the intervals the frozen URL pattern matched', () => {
    for (const message of URL_EDGE_CASES) {
      expect(scanUrls(message).intervals, message).toEqual(frozenUrlIntervals(message));
    }
  });

  /**
   * Deterministic cross product of a scheme-run prefix, a scheme, a separator
   * shape, a payload and a tail. The corpus is visited rather than
   * materialized, and every case is checked as intervals *and* as the replaced
   * output, so a difference in either start, end or match count fails.
   */
  const URL_PREFIXES = ['', 'x', '1', '.', '-', '+', '2001', 'a.b', 'D1 write failed for ', ' '];
  const URL_SCHEMES = ['a', 'http', 'HTTPS', 'scheme+v2', 'ftp', 'x1', 'A'];
  const URL_SEPARATORS = ['://', ':/', '::/', ':', '://://'];
  const URL_PAYLOADS = ['', 'x', 'example.test/p', 'a://b', '\u00a0', '\u0085', '\ud83d\ude00'];
  const URL_TAILS = ['', ' tail', '\ttail', '\ntail', ' a://b', '\u00a0tail', '\u0085tail'];

  function forEachUrlParityCase(visit: (message: string) => void): number {
    let visited = 0;

    for (const prefix of URL_PREFIXES) {
      for (const scheme of URL_SCHEMES) {
        for (const separator of URL_SEPARATORS) {
          for (const payload of URL_PAYLOADS) {
            for (const tail of URL_TAILS) {
              visited += 1;
              visit(`${prefix}${scheme}${separator}${payload}${tail}`);
            }
          }
        }
      }
    }

    return visited;
  }

  it('is source-match equivalent to the frozen URL pattern over the parity corpus', () => {
    const intervalFailures: string[] = [];
    const outputFailures: string[] = [];
    let matchedCases = 0;

    const visited = forEachUrlParityCase((message) => {
      const frozen = frozenUrlIntervals(message);
      const { intervals } = scanUrls(message);

      if (frozen.length > 0) {
        matchedCases += 1;
      }

      if (
        JSON.stringify(intervals) !== JSON.stringify(frozen) &&
        intervalFailures.length < 5
      ) {
        intervalFailures.push(
          `${JSON.stringify(message)} produced ${JSON.stringify(intervals)} not ${JSON.stringify(frozen)}`
        );
      }

      let replaced = '';
      let copied = 0;

      for (const { start, end } of intervals) {
        replaced += `${message.slice(copied, start)}${REDACTION_PLACEHOLDER}`;
        copied = end;
      }

      replaced += message.slice(copied);

      if (replaced !== frozenUrlRedact(message) && outputFailures.length < 5) {
        outputFailures.push(
          `${JSON.stringify(message)} became ${JSON.stringify(replaced)} not ${JSON.stringify(frozenUrlRedact(message))}`
        );
      }
    });

    expect(intervalFailures).toEqual([]);
    expect(outputFailures).toEqual([]);
    expect(visited).toBeGreaterThanOrEqual(10_000);
    // A corpus that never matches a URL would prove nothing.
    expect(matchedCases).toBeGreaterThan(visited / 10);
  });

  /**
   * Whitespace is where a hand-written scanner most easily stops being
   * equivalent: the JavaScript `\s` set includes U+000B and U+FEFF but not
   * U+0085, U+180E, U+200B or U+2060, and getting any one of them wrong either
   * swallows diagnostics after a URL or leaves part of one in the report. Every
   * Latin-1 code unit is swept, plus every higher `\s` member and its usual
   * near misses, and each is checked against the frozen pattern in four
   * positions: inside the payload, at the payload start, inside the scheme run
   * and in front of it.
   */
  const WHITESPACE_PROBE_CODE_UNITS: readonly number[] = [
    ...Array.from({ length: 0x100 }, (_unit, code) => code),
    0x0085, 0x1680, 0x180e, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
    0x2008, 0x2009, 0x200a, 0x200b, 0x2028, 0x2029, 0x202f, 0x205f, 0x2060, 0x3000, 0xfeff,
    0xd83d, 0xde00,
  ];

  it('agrees with the frozen pattern on the exact JavaScript whitespace set', () => {
    for (const code of WHITESPACE_PROBE_CODE_UNITS) {
      const unit = String.fromCharCode(code);
      const label = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;

      for (const message of [
        `a://x${unit}tail`,
        `a://${unit}x`,
        `a${unit}b://x`,
        `${unit}a://x`,
        `a://x${unit}b://y`,
      ]) {
        expect(scanUrls(message).intervals, label).toEqual(frozenUrlIntervals(message));
      }
    }
  });

  /**
   * Adversarial inputs for the superseded pattern: long runs of scheme
   * characters that never reach a `://`, so the engine restarted at every
   * letter position and consumed the rest of the message each time.
   */
  const URL_NEAR_MISS_MESSAGES: readonly string[] = [
    'a'.repeat(1000),
    `${'a'.repeat(999)}:`,
    `${'a'.repeat(998)}:/`,
    `${'a.'.repeat(500)}`,
    `${'a+'.repeat(500)}`,
    `${'ab1.'.repeat(250)}`,
    `${'a:'.repeat(500)}`,
    `${'a:/'.repeat(333)}`,
    `${'a'.repeat(500)}:// `,
    `${'a'.repeat(500)}:${'b'.repeat(499)}`,
  ];

  it('inspects a bounded multiple of the characters it scans', () => {
    const shapes = [
      ...URL_NEAR_MISS_MESSAGES,
      ...URL_EDGE_CASES,
      `${'a://b '.repeat(160)}`,
      `${'1:// '.repeat(200)}`,
      `${'a://'.repeat(250)}`,
    ];

    for (const message of shapes) {
      const { metrics } = scanUrls(message);

      expect(metrics.inspectedCharacters, message).toBeLessThanOrEqual(4 * message.length + 4);
    }
  });

  it('keeps the work per scanned character constant as the message grows', () => {
    for (const unit of ['a', 'a.', 'a:', 'a:/', 'a://b ', '1:// ', 'ab1.']) {
      const perCharacter = [250, 500, 1000, 2000].map((repeats) => {
        const message = unit.repeat(repeats);

        return scanUrls(message).metrics.inspectedCharacters / message.length;
      });

      // Super-linear work would grow this ratio with the message length.
      expect(Math.max(...perCharacter) / Math.min(...perCharacter), unit).toBeLessThan(1.1);
    }
  });

  /**
   * Ten milliseconds is generous for a linear scan of a 1000-character prefix
   * and still meaningful: the frozen pattern needs hundreds of microseconds to
   * milliseconds for the same input on Node 24, measured below on the same
   * machine and in the same run so the threshold discriminates rather than
   * merely passing.
   */
  const MAX_URL_SCAN_DURATION_MS = 10;

  it(
    'scans adversarial scheme runs in bounded time',
    () => {
      for (const message of URL_NEAR_MISS_MESSAGES) {
        const elapsed = fastestBatchAverageMs(() => {
          scanUrls(message);
        }, 50);

        expect(elapsed, message).toBeLessThan(MAX_URL_SCAN_DURATION_MS);
      }
    },
    300_000
  );

  it(
    'is orders of magnitude cheaper than the superseded URL pattern',
    () => {
      const adversarial = 'a'.repeat(MAX_SCANNED_ERROR_MESSAGE_LENGTH);

      const frozenCost = fastestBatchAverageMs(() => {
        frozenUrlRedact(adversarial);
      }, 5);
      const finderCost = fastestBatchAverageMs(() => {
        scanUrls(adversarial);
      }, 500);

      expect(frozenUrlRedact(adversarial)).toBe(adversarial);
      expect(scanUrls(adversarial).intervals).toEqual([]);
      expect(frozenCost).toBeGreaterThan(finderCost * 20);
    },
    300_000
  );
});

/**
 * Independent model of the redaction pipeline exactly as it behaved before this
 * change: the same five rules, in the same order, over an evolving text, with
 * the same final `slice(0, 200)` cutoff. It deliberately re-declares the four
 * regular expressions and the IPv6 validator rather than importing them, and it
 * never calls the production provenance or render helpers, so it can only agree
 * with the new pipeline by accident of behaviour rather than of shared code.
 *
 * The one production function it does reuse is the #153 credential scanner,
 * which is a pre-existing detector this change does not touch; re-deriving it
 * would model a different scanner rather than the current pipeline.
 */
const FROZEN_SCAN_BOUND = 1000;
const FROZEN_REPORT_BOUND = 200;

const FROZEN_IPV6_TOKEN_PATTERN = /[0-9A-Za-z:._%-]+/g;
const FROZEN_IPV6_GROUP_PATTERN = /^[0-9a-f]{1,4}$/i;
const FROZEN_IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const FROZEN_BEARER_PATTERN = /\bbearer\s+\S+/gi;
const FROZEN_IPV4_ADDRESS_PATTERN = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const FROZEN_MAX_IPV6_ADDRESS_LENGTH = 45;

function frozenIsIpv6Address(address: string): boolean {
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
    if (!FROZEN_IPV4_PATTERN.test(groups[groups.length - 1])) {
      return false;
    }

    groups.pop();
    maxGroups = 6;
  }

  if (groups.some((group) => !FROZEN_IPV6_GROUP_PATTERN.test(group))) {
    return false;
  }

  return isCompressed ? groups.length <= maxGroups - 1 : groups.length === maxGroups;
}

function frozenContainsIpv6Address(token: string): boolean {
  return token
    .split('%')
    .some(
      (segment) =>
        segment.length <= FROZEN_MAX_IPV6_ADDRESS_LENGTH &&
        segment.includes(':') &&
        frozenIsIpv6Address(segment)
    );
}

function frozenMatchIntervals(
  pattern: RegExp,
  text: string,
  accept: (match: string) => boolean = () => true
): Interval[] {
  const scanner = new RegExp(pattern.source, pattern.flags);
  const intervals: Interval[] = [];
  let match = scanner.exec(text);

  while (match !== null) {
    if (accept(match[0])) {
      intervals.push({ start: match.index, end: match.index + match[0].length });
    }

    match = scanner.exec(text);
  }

  return intervals;
}

/** One rendered UTF-16 code unit of the frozen pipeline and where it came from. */
interface FrozenUnit {
  readonly sources: readonly number[];
  readonly synthetic: boolean;
}

interface FrozenText {
  readonly text: string;
  readonly units: readonly FrozenUnit[];
}

function frozenReplace(state: FrozenText, intervals: readonly Interval[]): FrozenText {
  if (intervals.length === 0) {
    return state;
  }

  let text = '';
  const units: FrozenUnit[] = [];
  let copied = 0;

  for (const { start, end } of intervals) {
    text += state.text.slice(copied, start);
    units.push(...state.units.slice(copied, start));

    const merged = new Set<number>();

    for (let index = start; index < end; index += 1) {
      for (const source of state.units[index].sources) {
        merged.add(source);
      }
    }

    const sources = [...merged];

    text += REDACTION_PLACEHOLDER;

    for (let offset = 0; offset < REDACTION_PLACEHOLDER.length; offset += 1) {
      units.push({ sources, synthetic: true });
    }

    copied = end;
  }

  text += state.text.slice(copied);
  units.push(...state.units.slice(copied));

  return { text, units };
}

interface FrozenReport {
  readonly message: string;
  readonly visibleSourceIndices: Set<number>;
  readonly hiddenSourceIndices: Set<number>;
}

function frozenPipeline(raw: string): FrozenReport {
  const source = raw.slice(0, FROZEN_SCAN_BOUND);
  let state: FrozenText = {
    text: source,
    units: Array.from({ length: source.length }, (_unit, index) => ({
      sources: [index],
      synthetic: false,
    })),
  };

  state = frozenReplace(
    state,
    frozenMatchIntervals(FROZEN_IPV6_TOKEN_PATTERN, state.text, frozenContainsIpv6Address)
  );
  state = frozenReplace(state, frozenUrlIntervals(state.text));
  state = frozenReplace(state, frozenMatchIntervals(FROZEN_BEARER_PATTERN, state.text));
  state = frozenReplace(state, scanSensitiveAssignments(state.text).intervals);
  state = frozenReplace(state, frozenMatchIntervals(FROZEN_IPV4_ADDRESS_PATTERN, state.text));

  const truncated = state.text.length > FROZEN_REPORT_BOUND;
  const survivingLength = truncated ? FROZEN_REPORT_BOUND : state.text.length;
  const visibleSourceIndices = new Set<number>();

  for (let index = 0; index < survivingLength; index += 1) {
    const unit = state.units[index];

    if (!unit.synthetic) {
      visibleSourceIndices.add(unit.sources[0]);
    }
  }

  const hiddenSourceIndices = new Set<number>();

  for (let index = 0; index < source.length; index += 1) {
    if (!visibleSourceIndices.has(index)) {
      hiddenSourceIndices.add(index);
    }
  }

  return {
    message: truncated
      ? `${state.text.slice(0, FROZEN_REPORT_BOUND)}...`
      : state.text,
    visibleSourceIndices,
    hiddenSourceIndices,
  };
}

/**
 * Independent renderer used only to check that the visible source indices the
 * pipeline reports are exactly the ones its message shows. It copies the
 * claimed units, collapses every other run into one marker and applies the
 * documented output bound; it never consults the detectors.
 */
function renderFromVisibleIndices(source: string, visible: Iterable<number>): string {
  const visibleSet = new Set(visible);
  let rendered = '';
  let index = 0;

  while (index < source.length) {
    if (visibleSet.has(index)) {
      rendered += source.charAt(index);
      index += 1;
      continue;
    }

    rendered += REDACTION_PLACEHOLDER;

    while (index < source.length && !visibleSet.has(index)) {
      index += 1;
    }
  }

  return rendered;
}

/**
 * The reported message the pipeline must produce, derived only from the
 * indices it claims to show and from the *frozen* pipeline's own visibility —
 * never from the production ellipsis decision. A report ends in `...` when
 * marker expansion forced a cut to 200 units, or when the 200-unit source
 * window dropped text the frozen pipeline would have shown and the credential
 * scan would not have hidden anyway.
 */
function expectedReport(
  source: string,
  claimedVisible: Iterable<number>,
  frozenVisible: ReadonlySet<number>
): string {
  const rendered = renderFromVisibleIndices(source, claimedVisible);

  if (rendered.length > MAX_REPORTED_ERROR_MESSAGE_LENGTH) {
    return `${rendered.slice(0, MAX_REPORTED_ERROR_MESSAGE_LENGTH)}...`;
  }

  const strictlyHidden = new Set<number>();

  for (const { start, end } of scanSensitiveAssignments(source).intervals) {
    for (let index = start; index < end && index < source.length; index += 1) {
      strictlyHidden.add(index);
    }
  }

  for (const index of frozenVisible) {
    if (index >= MAX_REPORTED_ERROR_MESSAGE_LENGTH && !strictlyHidden.has(index)) {
      return `${rendered}...`;
    }
  }

  return rendered;
}

describe('source provenance redaction pipeline', () => {
  /** Every #157 reproduction, plus the `token=bearer VALUE` overlap case. */
  const DESTRUCTIVE_KEY_ERASURE_CASES: readonly string[] = [
    `token=https://example.test/token = ${NESTED_SECRET}`,
    `token=2001:db8::1%token = ${NESTED_SECRET}`,
    `token=bearer token = ${NESTED_SECRET}`,
    `token=https://example.test/token= ${NESTED_SECRET}`,
    `token=bearer ${NESTED_SECRET}`,
    `token: token = https://example.test/token = ${NESTED_SECRET}`,
    `authorization=https://example.test/secret = ${NESTED_SECRET}`,
    `cookie=fe80::1%pwd = ${NESTED_SECRET}`,
    `x_api_key=bearer session= ${NESTED_SECRET}`,
    `rejected token=https://example.test/token = ${NESTED_SECRET} tail`,
  ];

  it('redacts the credential a destructive rule used to erase the key of', () => {
    for (const message of DESTRUCTIVE_KEY_ERASURE_CASES) {
      expect(toBoundedErrorMessage(new Error(message)), message).not.toContain(NESTED_SECRET);
      expect(toBoundedErrorMessage(message), message).not.toContain(NESTED_SECRET);
    }
  });

  it('reports the exact output for the four documented reproductions', () => {
    const documented: readonly (readonly [string, string])[] = [
      [`token=https://example.test/token = ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`token=2001:db8::1%token = ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`token=bearer token = ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
      [`token=https://example.test/token= ${NESTED_SECRET}`, REDACTION_PLACEHOLDER],
    ];

    for (const [message, expected] of documented) {
      expect(toBoundedErrorMessage(new Error(message)), message).toBe(expected);
    }
  });

  /**
   * Topologies in which one rule creates the boundary another rule needs, so
   * the redaction the current pipeline performs cannot be reproduced by running
   * the detectors independently over the original source.
   */
  it('keeps topology-created redactions hidden', () => {
    const topology: readonly (readonly [string, string])[] = [
      // The URL match ends the IPv4 run, which is what gives the IPv4 rule its
      // trailing `\b`.
      ['1.2.3.4a://b', REDACTION_PLACEHOLDER],
      ['203.0.113.7https://origin.test/p', REDACTION_PLACEHOLDER],
      ['1.2.3.4https://origin.test/p', REDACTION_PLACEHOLDER],
      // A literal placeholder in the source is ordinary text, and cannot make
      // the pipeline treat hidden source as visible.
      ['[redacted] 203.0.113.9', '[redacted] [redacted]'],
      ['[redacted]', '[redacted]'],
    ];

    for (const [message, expected] of topology) {
      expect(toBoundedErrorMessage(new Error(message)), message).toBe(expected);
    }
  });

  /**
   * The exact compaction-tail regression from the plan: the IPv4 and URL
   * markers together expand the current output past the 200-unit cutoff, so
   * source indices 197-199 are invisible today. Collapsing overlapping
   * redactions must not pull them back into the report.
   */
  it('never lets the compaction tail become visible', () => {
    const message = `${'!'.repeat(185)}1.2.3.4a://b XYZZZ`;

    expect(message.length).toBe(203);

    const frozen = frozenPipeline(message);
    const rendered = renderBoundedErrorMessage(message);

    for (const index of [197, 198, 199]) {
      expect(frozen.visibleSourceIndices.has(index), `frozen ${index}`).toBe(false);
      expect(rendered.visibleSourceIndices, `rendered ${index}`).not.toContain(index);
    }

    expect(rendered.message).not.toContain('XYZ');
    expect(rendered.message).toBe(`${'!'.repeat(185)}${REDACTION_PLACEHOLDER}`);
  });

  it('never lets an IPv4 run that reaches the report bound become visible', () => {
    const message = `${'!'.repeat(195)}1.2.3.4https://origin.test/p`;
    const rendered = renderBoundedErrorMessage(message);

    expect(message.indexOf('1.2.3.4')).toBe(195);
    expect(rendered.message).not.toContain('1.2.3.4');
    expect(rendered.message).not.toContain('origin.test');

    for (const index of rendered.visibleSourceIndices) {
      expect(index).toBeLessThan(195);
    }
  });

  /**
   * Deterministic mixed corpus: every prefix, body and tail combination that
   * the #156/#157 plans call out, including overlap shapes, literal
   * placeholders, astral prefixes and messages that straddle the report bound.
   */
  const CORPUS_PREFIXES: readonly string[] = [
    '',
    'D1_ERROR: ',
    'rejected ',
    'token=',
    'host=',
    'bearer ',
    '[redacted] ',
    'a=b; ',
    `${'!'.repeat(185)}`,
    `${'x'.repeat(196)}`,
    '\ud83d\ude00',
  ];

  const CORPUS_BODIES: readonly string[] = [
    'plain text',
    'https://example.test/token',
    '2001:db8::1%token',
    'fe80::1%eth0',
    '::1',
    '[::1]:8080',
    '1.2.3.4a://b',
    '203.0.113.7https://origin.test/p',
    'bearer token',
    '198.51.100.7',
    'token = LEAKSECRET42',
    'cookie=session-secret',
    '12:30:45',
    'a://x',
    '1a://x',
    '2001http://x',
    '[redacted]',
  ];

  const CORPUS_TAILS: readonly string[] = [
    '',
    ' XYZZZ',
    ` = ${NESTED_SECRET}`,
    `= ${NESTED_SECRET}`,
    ' tail',
    '; c=d',
    ' 203.0.113.9',
    ' token=next',
  ];

  function forEachCorpusMessage(visit: (message: string) => void): number {
    let visited = 0;

    for (const prefix of CORPUS_PREFIXES) {
      for (const body of CORPUS_BODIES) {
        for (const tail of CORPUS_TAILS) {
          visited += 1;
          visit(`${prefix}${body}${tail}`);
        }
      }
    }

    return visited;
  }

  it(
    'never makes a source character visible that the previous pipeline hid',
    () => {
      const subsetFailures: string[] = [];
      const windowFailures: string[] = [];
      const boundFailures: string[] = [];
      const consistencyFailures: string[] = [];
      let redactedCases = 0;

      const visited = forEachCorpusMessage((message) => {
        const frozen = frozenPipeline(message);
        const rendered = renderBoundedErrorMessage(message);
        const source = message.slice(0, MAX_SCANNED_ERROR_MESSAGE_LENGTH);

        if (frozen.hiddenSourceIndices.size > 0) {
          redactedCases += 1;
        }

        for (const index of rendered.visibleSourceIndices) {
          if (!frozen.visibleSourceIndices.has(index) && subsetFailures.length < 5) {
            subsetFailures.push(
              `${JSON.stringify(message)} exposed source ${index} (${JSON.stringify(source.charAt(index))})`
            );
          }

          if (index >= MAX_REPORTED_ERROR_MESSAGE_LENGTH && windowFailures.length < 5) {
            windowFailures.push(`${JSON.stringify(message)} exposed source ${index}`);
          }
        }

        if (rendered.message.length > MAX_REPORTED_ERROR_MESSAGE_LENGTH + 3 && boundFailures.length < 5) {
          boundFailures.push(`${JSON.stringify(message)} produced ${rendered.message.length} units`);
        }

        if (rendered.message !== toBoundedErrorMessage(new Error(message)) && consistencyFailures.length < 5) {
          consistencyFailures.push(JSON.stringify(message));
        }

        const independent = renderFromVisibleIndices(source, rendered.visibleSourceIndices);
        const expected = expectedReport(
          source,
          rendered.visibleSourceIndices,
          frozen.visibleSourceIndices
        );

        if (expected !== rendered.message && consistencyFailures.length < 5) {
          consistencyFailures.push(
            `${JSON.stringify(message)} reported ${JSON.stringify(rendered.message)} for ${JSON.stringify(expected)}`
          );
        }

        if (independent.length === 0 && rendered.message.length > 0 && consistencyFailures.length < 5) {
          consistencyFailures.push(`${JSON.stringify(message)} reported text with no visible units`);
        }
      });

      expect(subsetFailures).toEqual([]);
      expect(windowFailures).toEqual([]);
      expect(boundFailures).toEqual([]);
      expect(consistencyFailures).toEqual([]);
      expect(visited).toBeGreaterThanOrEqual(1000);
      expect(redactedCases).toBeGreaterThan(visited / 10);
    },
    120_000
  );

  /**
   * A deterministic pseudo-random generator, so the fuzz corpus below is
   * reproducible: a failure names an input that can be replayed exactly, and a
   * pass is not a different sample on every run.
   */
  function seededRandom(seed: number): () => number {
    let state = seed >>> 0;

    return () => {
      state = (state + 0x6d2b79f5) >>> 0;

      let mixed = Math.imul(state ^ (state >>> 15), 1 | state);

      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  const FUZZ_FRAGMENTS: readonly string[] = [
    'token', 'cookie', 'authorization', 'x_api_key', 'pwd', 'session', 'host', 'params',
    '=', ':', '= ', ' = ', ':\t', ';', '; ', ' ', '\n', '\t', '&', '%', '"', '[', ']',
    'https://example.test/p', 'a://b', '1a://x', '://', 'bearer ', 'bearer',
    '2001:db8::1', '::1', 'fe80::1%eth0', '[::1]:8080', '203.0.113.9', '1.2.3.4',
    '[redacted]', 'LEAKSECRET42', 'D1_ERROR', 'plain', '12:30:45', '\ud83d\ude00',
    '\u00a0', '\u0085', '!'.repeat(40), 'x'.repeat(30), 'a.'.repeat(20),
  ];

  it(
    'never widens visibility over a seeded random corpus',
    () => {
      const random = seededRandom(0x5eed_1957);
      const subsetFailures: string[] = [];
      const boundFailures: string[] = [];
      let redactedCases = 0;

      for (let sample = 0; sample < 3000; sample += 1) {
        const fragments = 1 + Math.floor(random() * 12);
        let message = '';

        for (let part = 0; part < fragments; part += 1) {
          message += FUZZ_FRAGMENTS[Math.floor(random() * FUZZ_FRAGMENTS.length)];
        }

        const frozen = frozenPipeline(message);
        const rendered = renderBoundedErrorMessage(message);

        if (frozen.hiddenSourceIndices.size > 0) {
          redactedCases += 1;
        }

        for (const index of rendered.visibleSourceIndices) {
          if (
            (!frozen.visibleSourceIndices.has(index) ||
              index >= MAX_REPORTED_ERROR_MESSAGE_LENGTH) &&
            subsetFailures.length < 5
          ) {
            subsetFailures.push(`${JSON.stringify(message)} exposed source ${index}`);
          }
        }

        if (
          rendered.message.length > MAX_REPORTED_ERROR_MESSAGE_LENGTH + 3 &&
          boundFailures.length < 5
        ) {
          boundFailures.push(`${JSON.stringify(message)} produced ${rendered.message.length} units`);
        }
      }

      expect(subsetFailures).toEqual([]);
      expect(boundFailures).toEqual([]);
      expect(redactedCases).toBeGreaterThan(1000);
    },
    120_000
  );

  it('reports nothing for an empty message', () => {
    expect(renderBoundedErrorMessage('')).toEqual({ message: '', visibleSourceIndices: [] });
  });

  it('marks marker expansion that overflows the report bound with an ellipsis', () => {
    const message = `${'!'.repeat(195)}1.2.3.4https://origin.test/p`;
    const reported = toBoundedErrorMessage(new Error(message));

    expect(reported.length).toBe(MAX_REPORTED_ERROR_MESSAGE_LENGTH + 3);
    expect(reported.endsWith('...')).toBe(true);
    expect(reported.startsWith('!'.repeat(195))).toBe(true);
  });

  /**
   * The source window is stricter than the previous cutoff: collapsing
   * overlapping markers used to shorten the text enough for source past index
   * 200 to survive, and that text is now dropped. Dropping it silently would
   * make a window cut indistinguishable from a redaction, so the report says so.
   */
  it('marks diagnostic text the source window drops with an ellipsis', () => {
    const message = `https://${'a'.repeat(92)} ${'x'.repeat(150)}`;

    expect(message.length).toBe(251);

    const frozen = frozenPipeline(message);
    const reported = toBoundedErrorMessage(new Error(message));

    // The previous pipeline collapsed the URL to one marker, so its output fit
    // inside 200 units and showed source well past index 200 with no ellipsis.
    expect(frozen.message).toBe(`${REDACTION_PLACEHOLDER} ${'x'.repeat(150)}`);
    expect(frozen.visibleSourceIndices.has(250)).toBe(true);

    expect(reported).toBe(
      `${REDACTION_PLACEHOLDER} ${'x'.repeat(99)}${REDACTION_PLACEHOLDER}...`
    );

    for (const index of renderBoundedErrorMessage(message).visibleSourceIndices) {
      expect(index).toBeLessThan(MAX_REPORTED_ERROR_MESSAGE_LENGTH);
    }
  });

  it('keeps a fully redacted message free of an ellipsis it does not need', () => {
    // Every source unit is inside one credential assignment, so nothing the
    // previous pipeline showed is dropped and the report stays a bare marker.
    expect(toBoundedErrorMessage(new Error(`${'a.'.repeat(496)}pwd=v`))).toBe(
      REDACTION_PLACEHOLDER
    );
    expect(toBoundedErrorMessage(new Error('D1 insert failed'))).toBe('D1 insert failed');
  });

  it('never reports a message longer than the documented output bound', () => {
    const shapes = [
      ...DESTRUCTIVE_KEY_ERASURE_CASES,
      'x'.repeat(5000),
      `${'!'.repeat(185)}1.2.3.4a://b XYZZZ`,
      `${'x'.repeat(196)} 2001:db8::1 tail`,
      `${'a.'.repeat(500)}pwd=v`,
      `${'2001:db8::1 '.repeat(120)}`,
      `${'bearer x '.repeat(150)}`,
      `${'1.2.3.4 '.repeat(150)}`,
      `${'a://b '.repeat(200)}`,
    ];

    for (const message of shapes) {
      const reported = toBoundedErrorMessage(new Error(message));

      expect(reported.length, message.slice(0, 40)).toBeLessThanOrEqual(
        MAX_REPORTED_ERROR_MESSAGE_LENGTH + 3
      );
    }
  });

  /**
   * Percent-encoded assignments and quoted values that contain whitespace are
   * the pre-existing limitations accepted in #153. The interval work neither
   * closes nor widens them, and they are pinned so that closing them has to be
   * a deliberate change.
   */
  it('keeps the quoted and percent-encoded credential limitations pinned', () => {
    // A quoted value containing whitespace is still not parsed as a quoted
    // string, so the assignment behind the closing quote survives.
    expect(toBoundedErrorMessage(new Error(`token="bearer ${NESTED_SECRET}" = tail`))).toBe(
      `${REDACTION_PLACEHOLDER} = tail`
    );
    // A percent-encoded delimiter is not a delimiter, so neither the key token
    // nor the value is an assignment.
    expect(toBoundedErrorMessage(new Error(`token%3D${NESTED_SECRET}`))).toContain(NESTED_SECRET);
    expect(toBoundedErrorMessage(new Error(`query=token%3D${NESTED_SECRET}`))).toContain(
      NESTED_SECRET
    );
    // An encoded value behind a real delimiter is still redacted.
    expect(toBoundedErrorMessage(new Error(`token=%22${NESTED_SECRET}%22`))).toBe(
      REDACTION_PLACEHOLDER
    );
  });

  const PIPELINE_ADVERSARIAL_MESSAGES: readonly string[] = [
    'a'.repeat(MAX_SCANNED_ERROR_MESSAGE_LENGTH),
    `${'a.'.repeat(500)}`,
    `${'a:'.repeat(500)}`,
    `${'a://'.repeat(250)}`,
    `${'a://b '.repeat(200)}`,
    `${'::1 '.repeat(250)}`,
    `${'fe80::1%x '.repeat(120)}`,
    `${'bearer x '.repeat(150)}`,
    `${'1.2.3.4 '.repeat(150)}`,
    `${'token=v '.repeat(150)}`,
    `${'token=token= '.repeat(100)}v`,
    `${'pwd.'.repeat(300)}`,
    `${'1.2.3.4a://b '.repeat(100)}`,
    `${'token=bearer token = v '.repeat(60)}`,
    `${'[redacted] '.repeat(120)}`,
  ];

  /**
   * The reporter runs inside the Worker's CPU budget after the 302 has been
   * returned, and `recordClick` binds attacker-controlled `user-agent` and
   * `referer` values, so the whole pipeline has to stay cheap for a hostile
   * throwable, not just each detector.
   */
  it(
    'keeps the whole provenance pipeline under the bounded per-message cost',
    () => {
      for (const message of PIPELINE_ADVERSARIAL_MESSAGES) {
        const elapsed = fastestBatchAverageMs(() => {
          toBoundedErrorMessage(new Error(message));
        }, 20);

        expect(elapsed, message.slice(0, 40)).toBeLessThan(10);
      }
    },
    300_000
  );
});
