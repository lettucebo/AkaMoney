import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatDecimal,
  formatSignedPercent,
  formatTimestamp,
  formatDateTime,
  formatApiDate,
  truncate,
  resolveShortHost,
  buildShortUrl,
  toDateInputValue,
  toLocalDateTimeInputValue,
  extractErrorMessage
} from '../format';

describe('formatNumber', () => {
  it('groups thousands', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('renders small numbers verbatim', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(42)).toBe('42');
  });

  it('falls back to zero for nullish or non-finite input', () => {
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(undefined)).toBe('0');
    expect(formatNumber(Number.NaN)).toBe('0');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('0');
  });

  it('rounds fractional input', () => {
    expect(formatNumber(12.6)).toBe('13');
  });
});

describe('formatDecimal', () => {
  it('keeps one fraction digit by default and trims trailing zeros', () => {
    expect(formatDecimal(12.34)).toBe('12.3');
    expect(formatDecimal(12)).toBe('12');
  });

  it('supports an explicit digit count', () => {
    expect(formatDecimal(1.239, 2)).toBe('1.24');
  });

  it('falls back to zero for non-finite input', () => {
    expect(formatDecimal(Number.NaN)).toBe('0');
  });
});

describe('formatSignedPercent', () => {
  it('adds a plus sign for growth', () => {
    expect(formatSignedPercent(0.125)).toBe('+12.5%');
  });

  it('adds a minus sign for decline', () => {
    expect(formatSignedPercent(-0.2)).toBe('-20%');
  });

  it('renders zero without a sign', () => {
    expect(formatSignedPercent(0)).toBe('0%');
  });

  it('returns an empty string when there is no ratio', () => {
    expect(formatSignedPercent(null)).toBe('');
    expect(formatSignedPercent(Number.NaN)).toBe('');
  });
});

describe('formatTimestamp / formatDateTime', () => {
  it('formats a timestamp using local calendar parts', () => {
    const timestamp = new Date(2024, 0, 5, 13, 45).getTime();

    expect(formatTimestamp(timestamp)).toBe('2024/01/05');
    expect(formatDateTime(timestamp)).toBe('2024/01/05 13:45');
  });

  it('returns a blank string for malformed timestamps', () => {
    expect(formatTimestamp(Number.NaN)).toBe('');
    expect(formatDateTime(Number.NaN)).toBe('');
  });
});

describe('formatApiDate', () => {
  it('formats an ISO calendar date without shifting the day', () => {
    expect(formatApiDate('2024-03-09')).toBe('2024/03/09');
  });

  it('formats a full ISO timestamp in the viewer timezone', () => {
    const localNoon = new Date(2024, 2, 9, 12, 0, 0);

    expect(formatApiDate(localNoon.toISOString())).toBe('2024/03/09');
  });

  it('returns a blank string for malformed API dates', () => {
    expect(formatApiDate('not-a-date')).toBe('');
    expect(formatApiDate('')).toBe('');
  });
});

describe('truncate', () => {
  it('leaves short text untouched', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('adds an ellipsis when text is longer than the limit', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcde...');
  });

  it('tolerates nullish input', () => {
    expect(truncate(undefined, 5)).toBe('');
  });
});

describe('resolveShortHost', () => {
  it('defaults to aka.money', () => {
    expect(resolveShortHost(undefined)).toBe('aka.money');
    expect(resolveShortHost('')).toBe('aka.money');
    expect(resolveShortHost('   ')).toBe('aka.money');
  });

  it('strips the protocol', () => {
    expect(resolveShortHost('https://aka.money')).toBe('aka.money');
    expect(resolveShortHost('http://localhost:8787')).toBe('localhost:8787');
  });

  it('strips trailing slashes', () => {
    expect(resolveShortHost('https://aka.money/')).toBe('aka.money');
  });

  it('keeps a bare host untouched', () => {
    expect(resolveShortHost('aka.money')).toBe('aka.money');
  });
});

describe('buildShortUrl', () => {
  it('builds an https URL from a bare host', () => {
    expect(buildShortUrl('aka.money', 'launch')).toBe('https://aka.money/launch');
  });

  it('keeps http for localhost hosts', () => {
    expect(buildShortUrl('localhost:8787', 'launch')).toBe('http://localhost:8787/launch');
  });
});

describe('date input helpers', () => {
  it('formats a Date into a YYYY-MM-DD input value', () => {
    expect(toDateInputValue(new Date(2024, 10, 3))).toBe('2024-11-03');
  });

  it('formats a timestamp into a datetime-local input value', () => {
    expect(toLocalDateTimeInputValue(new Date(2024, 10, 3, 8, 5).getTime())).toBe('2024-11-03T08:05');
  });

  it('returns a blank datetime-local value for malformed timestamps', () => {
    expect(toLocalDateTimeInputValue(Number.NaN)).toBe('');
  });
});

describe('extractErrorMessage', () => {
  it('prefers the API message payload', () => {
    const error = { response: { data: { message: '短代碼已存在' } } };

    expect(extractErrorMessage(error, 'fallback')).toBe('短代碼已存在');
  });

  it('falls back when the payload has no message', () => {
    expect(extractErrorMessage({ response: { data: {} } }, 'fallback')).toBe('fallback');
    expect(extractErrorMessage(new Error('boom'), 'fallback')).toBe('fallback');
    expect(extractErrorMessage(null, 'fallback')).toBe('fallback');
    expect(extractErrorMessage('nope', 'fallback')).toBe('fallback');
  });

  it('ignores non-string message payloads', () => {
    expect(extractErrorMessage({ response: { data: { message: 42 } } }, 'fallback')).toBe('fallback');
  });
});
