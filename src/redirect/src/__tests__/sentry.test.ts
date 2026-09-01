import type { Event } from '@sentry/cloudflare/nodejs_compat';
import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_ANALYTICS_ERROR_MESSAGE,
  BACKGROUND_CLICK_RECORDING_OPERATION,
  BACKGROUND_OPERATION_TAG_KEY,
} from '../observability';
import { createSentryOptions, scrubCredentialHeaders, scrubStreamedSpan } from '../sentry';
import type { Env } from '../types';

describe('Sentry configuration', () => {
  it('scrubs credential headers case-insensitively and preserves safe event fields', () => {
    const event = {
      event_id: 'event-id',
      message: 'redirect failed',
      request: {
        headers: {
          Authorization: 'Bearer secret',
          'X-Api-Key': 'api-secret',
          COOKIE: 'session=secret',
          'x-request-id': 'safe-request',
        },
      },
      extra: {
        shortCode: 'abc123',
      },
      tags: {
        service: 'redirect',
      },
    } as unknown as Event;

    const scrubbed = scrubCredentialHeaders(event);

    expect(scrubbed.event_id).toBe('event-id');
    expect(scrubbed.message).toBe('redirect failed');
    expect(scrubbed.extra).toEqual({ shortCode: 'abc123' });
    expect(scrubbed.tags).toEqual({ service: 'redirect' });
    expect(scrubbed.request?.headers).toEqual({
      'x-request-id': 'safe-request',
    });
  });

  it('scrubs transaction request headers using the same credential rules', () => {
    const transaction = {
      type: 'transaction',
      transaction: 'GET /:shortCode',
      request: {
        headers: {
          authorization: 'Bearer secret',
          Cookie: 'session=secret',
          'user-agent': 'safe-agent',
        },
      },
    } as unknown as Event & { transaction: string };

    const scrubbed = scrubCredentialHeaders(transaction);

    expect(scrubbed.transaction).toBe('GET /:shortCode');
    expect(scrubbed.request?.headers).toEqual({
      'user-agent': 'safe-agent',
    });
  });

  it('removes cookie maps populated from credential headers', () => {
    const event = {
      request: {
        url: 'https://aka.money/abc123',
        cookies: {
          session: 'cookie-secret',
        },
      },
    } as unknown as Event;

    const scrubbed = scrubCredentialHeaders(event);

    expect(scrubbed.request).toEqual({
      url: 'https://aka.money/abc123',
    });
  });

  it('removes inherited request headers and IP from tagged background click recording exceptions', () => {
    const event = {
      message: 'D1 insert failed',
      tags: {
        [BACKGROUND_OPERATION_TAG_KEY]: BACKGROUND_CLICK_RECORDING_OPERATION,
        short_code: 'abc123',
      },
      request: {
        headers: {
          'x-request-id': 'safe-for-normal-events',
        },
        url: 'https://aka.money/abc123',
      },
      user: {
        id: 'user-id',
        ip_address: '203.0.113.1',
      },
    } as unknown as Event;

    const scrubbed = scrubCredentialHeaders(event);

    expect(scrubbed.request).toEqual({
      url: 'https://aka.money/abc123',
    });
    expect(scrubbed.user).toEqual({
      id: 'user-id',
    });
    expect(scrubbed.tags).toEqual({
      [BACKGROUND_OPERATION_TAG_KEY]: BACKGROUND_CLICK_RECORDING_OPERATION,
      short_code: 'abc123',
    });
  });

  it('keeps safe request context for untagged events that merely share the background message', () => {
    const event = {
      message: `${BACKGROUND_ANALYTICS_ERROR_MESSAGE} [object Object]`,
      request: {
        headers: {
          'x-request-id': 'safe-for-normal-events',
        },
        url: 'https://aka.money/abc123',
      },
      user: {
        id: 'user-id',
        ip_address: '203.0.113.1',
      },
    } as unknown as Event;

    const scrubbed = scrubCredentialHeaders(event);

    expect(scrubbed.request).toEqual({
      headers: { 'x-request-id': 'safe-for-normal-events' },
      url: 'https://aka.money/abc123',
    });
    expect(scrubbed.user).toEqual({
      id: 'user-id',
      ip_address: '203.0.113.1',
    });
  });

  it('leaves transaction-shaped events untouched even when they carry the background tag', () => {
    const transaction = {
      type: 'transaction',
      transaction: 'GET /:shortCode',
      tags: {
        [BACKGROUND_OPERATION_TAG_KEY]: BACKGROUND_CLICK_RECORDING_OPERATION,
      },
      request: {
        headers: {
          'user-agent': 'safe-agent',
        },
        url: 'https://aka.money/abc123',
      },
      user: {
        ip_address: '203.0.113.1',
      },
    } as unknown as Event;

    const scrubbed = scrubCredentialHeaders(transaction);

    expect(scrubbed.request).toEqual({
      headers: { 'user-agent': 'safe-agent' },
      url: 'https://aka.money/abc123',
    });
    expect(scrubbed.user).toEqual({ ip_address: '203.0.113.1' });
  });

  it('scrubs credential header attributes from streamed spans', () => {
    const span = {
      trace_id: 'trace-id',
      span_id: 'span-id',
      name: 'GET /abc123',
      start_timestamp: 1,
      end_timestamp: 2,
      status: 'ok' as const,
      is_segment: true,
      attributes: {
        'http.request.header.authorization': 'Bearer secret',
        'http.request.header.x_api_key': 'api-secret',
        'http.request.header.cookie.session': 'cookie-secret',
        'http.request.header.user_agent': 'safe-agent',
      },
    };

    const scrubbed = scrubStreamedSpan(span);

    expect(scrubbed.attributes).toEqual({
      'http.request.header.user_agent': 'safe-agent',
    });
  });

  it('builds Cloudflare Sentry options from Env with redirect-safe sampling and integrations', () => {
    const options = createSentryOptions({
      ENVIRONMENT: 'production',
      SENTRY_DSN: '',
    } as Env);

    expect(options.dsn).toBeUndefined();
    expect(options.environment).toBe('production');
    expect(options.tracesSampleRate).toBe(0.01);
    expect(options.traceLifecycle).toBe('stream');
    expect(options.enableLogs).toBe(true);
    expect(options.sendDefaultPii).toBe(true);
    expect(options.beforeSend).toBe(scrubCredentialHeaders);
    expect(options.beforeSendTransaction).toBe(scrubCredentialHeaders);
    expect(options.beforeSendSpan).toEqual(expect.objectContaining({ _streamed: true }));
    expect(options.integrations).toEqual([
      expect.objectContaining({ name: 'ConsoleLogs' }),
      expect.objectContaining({ name: 'CaptureConsole' }),
    ]);
  });

  it('defaults missing Sentry environment to development and keeps a configured DSN', () => {
    const options = createSentryOptions({
      DB: {} as D1Database,
      ENVIRONMENT: '',
      SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
    });

    expect(options.dsn).toBe('https://public@example.ingest.sentry.io/1');
    expect(options.environment).toBe('development');
  });
});
