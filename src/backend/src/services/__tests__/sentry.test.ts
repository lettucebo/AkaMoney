import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@sentry/cloudflare', () => ({
  consoleLoggingIntegration: vi.fn((options) => ({ name: 'consoleLogging', options })),
  captureConsoleIntegration: vi.fn((options) => ({ name: 'captureConsole', options }))
}));

import { captureConsoleIntegration, consoleLoggingIntegration } from '@sentry/cloudflare';
import { createSentryOptions, scrubSentryEventCredentials } from '../sentry';
import type { Env } from '../../types';

const createEnv = (overrides: Partial<Env> = {}): Env => ({
  DB: {} as D1Database,
  JWT_SECRET: 'test-secret',
  JWT_EXPIRES_IN: '7d',
  ENVIRONMENT: 'test',
  ...overrides
});

describe('Sentry service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('scrubSentryEventCredentials', () => {
    it('removes credential request headers case-insensitively and preserves safe data', () => {
      const event = {
        event_id: 'event-1',
        message: 'boom',
        tags: { route: '/api/urls' },
        request: {
          url: 'https://admin.example.test/api/urls',
          headers: {
            Authorization: 'Bearer secret-token',
            'X-Api-Key': 'secret-api-key',
            'content-type': 'application/json',
            'x-request-id': 'request-123'
          }
        }
      };

      const scrubbed = scrubSentryEventCredentials(event);

      expect(scrubbed).toEqual({
        event_id: 'event-1',
        message: 'boom',
        tags: { route: '/api/urls' },
        request: {
          url: 'https://admin.example.test/api/urls',
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'request-123'
          }
        }
      });
    });

    it('preserves events without request headers', () => {
      const event = {
        event_id: 'event-2',
        message: 'no headers',
        request: {
          url: 'https://admin.example.test/health'
        }
      };

      expect(scrubSentryEventCredentials(event)).toEqual(event);
    });

    it('removes credential query strings from Sentry fetch breadcrumbs and span data', () => {
      const azureSasUrl = 'https://account.blob.core.windows.net/container/blob.png?sv=2024-11-04&sp=rwd&sig=secret-signature';
      const sanitizedUrl = 'https://account.blob.core.windows.net/container/blob.png';
      const event = {
        event_id: 'event-3',
        breadcrumbs: [
          {
            category: 'fetch',
            data: {
              url: azureSasUrl,
              method: 'PUT'
            }
          }
        ],
        spans: [
          {
            data: {
              url: azureSasUrl,
              'http.url': azureSasUrl,
              'url.full': azureSasUrl,
              'http.query': '?sv=2024-11-04&sp=rwd&sig=secret-signature',
              'http.method': 'PUT'
            }
          }
        ],
        contexts: {
          trace: {
            data: {
              url: azureSasUrl,
              'http.query': '?sv=2024-11-04&sp=rwd&sig=secret-signature'
            }
          }
        }
      };

      const scrubbed = scrubSentryEventCredentials(event);

      expect(scrubbed.breadcrumbs?.[0]?.data).toEqual({
        url: sanitizedUrl,
        method: 'PUT'
      });
      expect(scrubbed.spans?.[0]?.data).toEqual({
        url: sanitizedUrl,
        'http.url': sanitizedUrl,
        'url.full': sanitizedUrl,
        'http.method': 'PUT'
      });
      expect(scrubbed.contexts?.trace?.data).toEqual({
        url: sanitizedUrl
      });
    });
  });

  describe('createSentryOptions', () => {
    it('maps Env to Sentry options and installs log and handled-error console integrations', () => {
      const env = createEnv({
        SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
        ENVIRONMENT: 'production'
      });

      const options = createSentryOptions(env);

      expect(options.dsn).toBe('https://public@example.ingest.sentry.io/1');
      expect(options.environment).toBe('production');
      expect(options.tracesSampleRate).toBe(0.2);
      expect(options.sendDefaultPii).toBe(true);
      expect(options.beforeSend).toBe(scrubSentryEventCredentials);
      expect(options.beforeSendTransaction).toBe(scrubSentryEventCredentials);
      expect(consoleLoggingIntegration).toHaveBeenCalledWith({ levels: ['log', 'warn', 'error'] });
      expect(captureConsoleIntegration).toHaveBeenCalledWith({ levels: ['error'] });
      expect(options.integrations).toEqual([
        { name: 'consoleLogging', options: { levels: ['log', 'warn', 'error'] } },
        { name: 'captureConsole', options: { levels: ['error'] } }
      ]);
    });

    it('omits empty DSN and defaults environment to development', () => {
      const options = createSentryOptions(createEnv({ SENTRY_DSN: '', ENVIRONMENT: '' }));

      expect(options.dsn).toBeUndefined();
      expect(options.environment).toBe('development');
    });
  });
});
