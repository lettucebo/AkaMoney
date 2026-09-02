import { describe, expect, it } from 'vitest';
import { toSafeErrorContext } from '../safeError';

/**
 * The console context attached to store failures is forwarded to Sentry by
 * `captureConsoleIntegration`. Axios errors carry `config.data`, `config.url`,
 * `request` and `response.data`, any of which can hold an original URL with
 * signed query credentials, so the helper must expose classification fields only.
 */
describe('toSafeErrorContext', () => {
  it('keeps only the error name, code and HTTP status of an Axios-shaped error', () => {
    const axiosError = {
      name: 'AxiosError',
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed with status code 400',
      stack: 'AxiosError: Request failed\n    at https://app.example.com/assets/index.js:1:1',
      config: {
        url: 'https://api.example.com/api/urls',
        data: JSON.stringify({ original_url: 'https://blob.example.com/f?sig=SECRET-SIG' })
      },
      request: { responseURL: 'https://api.example.com/api/urls?token=SECRET-TOKEN' },
      response: {
        status: 400,
        data: { message: 'Invalid URL', original_url: 'https://blob.example.com/f?sig=SECRET-SIG' }
      }
    };

    const context = toSafeErrorContext(axiosError);

    expect(context).toEqual({ name: 'AxiosError', code: 'ERR_BAD_REQUEST', status: 400 });
    expect(JSON.stringify(context)).not.toContain('SECRET-SIG');
    expect(JSON.stringify(context)).not.toContain('SECRET-TOKEN');
    expect(JSON.stringify(context)).not.toContain('original_url');
  });

  it('omits absent code and status instead of emitting undefined keys', () => {
    expect(toSafeErrorContext(new TypeError('boom'))).toEqual({ name: 'TypeError' });
  });

  it('reads a top-level status when no response object is present', () => {
    expect(toSafeErrorContext({ name: 'AxiosError', status: 503 })).toEqual({
      name: 'AxiosError',
      status: 503
    });
  });

  it('prefers the response status over a stale top-level status', () => {
    expect(toSafeErrorContext({ name: 'AxiosError', status: 0, response: { status: 404 } })).toEqual({
      name: 'AxiosError',
      status: 404
    });
  });

  it('drops statuses outside the HTTP range and non-integer statuses', () => {
    expect(toSafeErrorContext({ name: 'AxiosError', response: { status: 99 } })).toEqual({
      name: 'AxiosError'
    });
    expect(toSafeErrorContext({ name: 'AxiosError', response: { status: 600 } })).toEqual({
      name: 'AxiosError'
    });
    expect(toSafeErrorContext({ name: 'AxiosError', response: { status: 404.5 } })).toEqual({
      name: 'AxiosError'
    });
    expect(toSafeErrorContext({ name: 'AxiosError', response: { status: '404' } })).toEqual({
      name: 'AxiosError'
    });
  });

  it('rejects a name or code that is not a short identifier token', () => {
    const context = toSafeErrorContext({
      name: 'Error: https://blob.example.com/f?sig=SECRET-SIG failed',
      code: 'contains https://blob.example.com/f?sig=SECRET-SIG'
    });

    expect(context).toEqual({ name: 'UnknownError' });
    expect(JSON.stringify(context)).not.toContain('SECRET-SIG');
  });

  it('rejects an over-long identifier token', () => {
    expect(toSafeErrorContext({ name: 'A'.repeat(65), code: 'B'.repeat(65) })).toEqual({
      name: 'UnknownError'
    });
    expect(toSafeErrorContext({ name: 'A'.repeat(64) })).toEqual({ name: 'A'.repeat(64) });
  });

  it('never serializes non-object throwables', () => {
    expect(toSafeErrorContext('https://blob.example.com/f?sig=SECRET-SIG')).toEqual({
      name: 'UnknownError'
    });
    expect(toSafeErrorContext(null)).toEqual({ name: 'UnknownError' });
    expect(toSafeErrorContext(undefined)).toEqual({ name: 'UnknownError' });
    expect(toSafeErrorContext(42)).toEqual({ name: 'UnknownError' });
  });

  it('resolves the name of a native error through its prototype', () => {
    expect(toSafeErrorContext(new RangeError('boom'))).toEqual({ name: 'RangeError' });
    expect(toSafeErrorContext(new DOMException('boom', 'AbortError'))).toEqual({
      name: 'AbortError'
    });
  });

  it('cannot be turned into a leak channel by an inherited free-text name', () => {
    const polluted = Object.create({
      name: 'https://blob.example.com/f?sig=SECRET-SIG',
      code: 'https://blob.example.com/f?sig=SECRET-SIG'
    });

    expect(toSafeErrorContext(polluted)).toEqual({ name: 'UnknownError' });
  });
});
