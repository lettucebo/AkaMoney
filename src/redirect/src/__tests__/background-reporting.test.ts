import * as Sentry from '@sentry/cloudflare/nodejs_compat';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BACKGROUND_ANALYTICS_ERROR_MESSAGE,
  BACKGROUND_CLICK_RECORDING_OPERATION,
  BACKGROUND_OPERATION_TAG_KEY,
} from '../observability';
import { createBackgroundClickErrorReporter, createSentryOptions } from '../sentry';
import type { Env } from '../types';

const TEST_DSN = 'https://public@example.ingest.sentry.io/1';

const AMBIENT_SENTINELS = [
  'ambient-user-id',
  'ambient@example.com',
  'ambient-sentinel',
  'ambient-breadcrumb',
  '198.51.100.7',
  'ambient-authorization',
  'ambient-session-cookie',
];

type JsonObject = Record<string, unknown>;
type EnvelopeItem = [{ type?: string }, unknown];
type RecordedEnvelope = [unknown, EnvelopeItem[]];

interface RecordingClient {
  client: NonNullable<ReturnType<typeof Sentry.getClient>>;
  envelopes: RecordedEnvelope[];
}

const openClients: RecordingClient[] = [];

function createRecordingClient(): RecordingClient {
  const envelopes: RecordedEnvelope[] = [];
  const productionOptions = createSentryOptions({
    ENVIRONMENT: 'test',
    SENTRY_DSN: TEST_DSN,
  } as Env);

  const client = new Sentry.CloudflareClient({
    dsn: TEST_DSN,
    environment: 'test',
    enableLogs: true,
    sendDefaultPii: true,
    beforeSend: productionOptions.beforeSend,
    integrations: Array.isArray(productionOptions.integrations) ? productionOptions.integrations : [],
    skipOpenTelemetrySetup: true,
    stackParser: () => [],
    transport: () => ({
      send: (envelope) => {
        envelopes.push(envelope as unknown as RecordedEnvelope);
        return Promise.resolve({});
      },
      flush: () => Promise.resolve(true),
    }),
  });
  client.init();

  const recording: RecordingClient = { client, envelopes };
  openClients.push(recording);
  return recording;
}

function eventsFrom(envelopes: RecordedEnvelope[]): JsonObject[] {
  return envelopes.flatMap(([, items]) =>
    (items ?? [])
      .filter(([header]) => header?.type === 'event')
      .map(([, payload]) => payload as JsonObject)
  );
}

function logsFrom(envelopes: RecordedEnvelope[]): JsonObject[] {
  return envelopes.flatMap(([, items]) =>
    (items ?? [])
      .filter(([header]) => header?.type === 'log')
      .flatMap(([, payload]) => ((payload as { items?: JsonObject[] }).items ?? []))
  );
}

function operationalLogAttributes(log: JsonObject): JsonObject {
  const attributes = (log.attributes ?? {}) as Record<string, { value: unknown }>;
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(([key]) => !key.startsWith('sentry.'))
      .map(([key, attribute]) => [key, attribute.value])
  );
}

function createPoisonedIsolationScope(): Sentry.Scope {
  const scope = new Sentry.Scope();
  scope.setUser({
    id: 'ambient-user-id',
    email: 'ambient@example.com',
    ip_address: '198.51.100.7',
  });
  scope.setTag('ambient_isolation_tag', 'ambient-sentinel');
  scope.setContext('ambient_isolation_context', { marker: 'ambient-sentinel' });
  scope.setExtra('ambient_isolation_extra', 'ambient-sentinel');
  scope.setAttribute('ambient_isolation_attribute', 'ambient-sentinel');
  scope.addBreadcrumb({ message: 'ambient-breadcrumb' });
  scope.setSDKProcessingMetadata({
    normalizedRequest: {
      url: 'https://aka.money/ambient-sentinel',
      headers: {
        authorization: 'ambient-authorization',
        cookie: 'session=ambient-session-cookie',
        'x-request-id': 'ambient-sentinel',
      },
    },
  });
  return scope;
}

function poisonCurrentScope(scope: Sentry.Scope): void {
  scope.setUser({ id: 'ambient-user-id', ip_address: '198.51.100.7' });
  scope.setTag('ambient_current_tag', 'ambient-sentinel');
  scope.setContext('ambient_current_context', { marker: 'ambient-sentinel' });
  scope.setExtra('ambient_current_extra', 'ambient-sentinel');
  scope.setAttribute('ambient_current_attribute', 'ambient-sentinel');
  scope.addBreadcrumb({ message: 'ambient-breadcrumb' });
}

async function loadServicesWithStubbedNativeConsole() {
  vi.resetModules();
  const nativeConsoleError = vi.fn();
  const originalConsoleError = console.error;
  console.error = nativeConsoleError as typeof console.error;

  try {
    const services = await import('../services');
    return { observeClickRecording: services.observeClickRecording, nativeConsoleError };
  } finally {
    console.error = originalConsoleError;
  }
}

describe('background click error reporting', () => {
  beforeAll(() => {
    Sentry.setAsyncLocalStorageAsyncContextStrategy();
  });

  afterEach(() => {
    while (openClients.length > 0) {
      openClients.pop()?.client.dispose();
    }
  });

  it('reports through the request client and empty scopes when ambient scopes are poisoned', async () => {
    const requestClient = createRecordingClient();
    const laterClient = createRecordingClient();

    const reporter = Sentry.withIsolationScope(new Sentry.Scope(), () =>
      Sentry.withScope((requestScope) => {
        requestScope.setClient(requestClient.client);
        return createBackgroundClickErrorReporter();
      })
    );

    expect(reporter).toBeTypeOf('function');

    await Sentry.withIsolationScope(createPoisonedIsolationScope(), () =>
      Sentry.withScope(async (backgroundScope) => {
        backgroundScope.setClient(laterClient.client);
        poisonCurrentScope(backgroundScope);

        expect(Sentry.getClient()).toBe(laterClient.client);

        await reporter?.(new Error('D1 insert failed'), { shortCode: 'abc123', urlId: 'url-1' });
      })
    );

    await requestClient.client.flush();
    await laterClient.client.flush();

    const events = eventsFrom(requestClient.envelopes);
    const logs = logsFrom(requestClient.envelopes);

    expect(events).toHaveLength(1);
    expect(logs).toHaveLength(1);
    expect(eventsFrom(laterClient.envelopes)).toHaveLength(0);
    expect(logsFrom(laterClient.envelopes)).toHaveLength(0);

    const [event] = events;
    expect(event.level).toBe('error');
    expect(event.tags).toEqual({
      [BACKGROUND_OPERATION_TAG_KEY]: BACKGROUND_CLICK_RECORDING_OPERATION,
      short_code: 'abc123',
      url_id: 'url-1',
    });
    expect((event.exception as { values?: JsonObject[] }).values?.[0]).toMatchObject({
      type: 'Error',
      value: 'D1 insert failed',
    });
    expect(event.request).toBeUndefined();
    expect((event.user as JsonObject | undefined)?.ip_address).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();

    const [log] = logs;
    expect(log.body).toBe(BACKGROUND_ANALYTICS_ERROR_MESSAGE);
    expect(log.level).toBe('error');
    expect(operationalLogAttributes(log)).toEqual({
      operation: 'recordClick',
      shortCode: 'abc123',
      urlId: 'url-1',
      errorName: 'Error',
      errorMessage: 'D1 insert failed',
    });

    const serializedEvent = JSON.stringify(event);
    const serializedLog = JSON.stringify(log);
    for (const sentinel of AMBIENT_SENTINELS) {
      expect(serializedEvent).not.toContain(sentinel);
      expect(serializedLog).not.toContain(sentinel);
    }
  });

  it('emits exactly one exception and one native console line without re-entering captureConsole', async () => {
    const requestClient = createRecordingClient();
    const { observeClickRecording, nativeConsoleError } = await loadServicesWithStubbedNativeConsole();

    await Sentry.withIsolationScope(new Sentry.Scope(), () =>
      Sentry.withScope(async (requestScope) => {
        requestScope.setClient(requestClient.client);
        const reporter = createBackgroundClickErrorReporter();

        await observeClickRecording(
          Promise.reject(new Error('D1 insert failed')),
          { shortCode: 'abc123', urlId: 'url-1' },
          reporter
        );
      })
    );

    await requestClient.client.flush();

    expect(nativeConsoleError).toHaveBeenCalledTimes(1);
    expect(nativeConsoleError).toHaveBeenCalledWith(BACKGROUND_ANALYTICS_ERROR_MESSAGE, {
      operation: 'recordClick',
      shortCode: 'abc123',
      urlId: 'url-1',
      error: expect.any(Error),
    });
    expect(eventsFrom(requestClient.envelopes)).toHaveLength(1);
    expect(logsFrom(requestClient.envelopes)).toHaveLength(1);
  });

  it('strips request headers, cookies and user IP that the pipeline adds to background exceptions', async () => {
    const requestClient = createRecordingClient();
    requestClient.client.on('preprocessEvent', (event) => {
      event.request = {
        url: 'https://aka.money/abc123',
        headers: {
          'x-request-id': 'safe-request-id',
          authorization: 'Bearer credential',
          cookie: 'session=cookie-secret',
        },
        cookies: { session: 'cookie-secret' },
      };
      event.user = { ...event.user, ip_address: '203.0.113.1' };
    });

    const reporter = Sentry.withIsolationScope(new Sentry.Scope(), () =>
      Sentry.withScope((requestScope) => {
        requestScope.setClient(requestClient.client);
        return createBackgroundClickErrorReporter();
      })
    );

    await reporter?.(new Error('D1 insert failed'), { shortCode: 'abc123', urlId: 'url-1' });
    await requestClient.client.flush();

    const [event] = eventsFrom(requestClient.envelopes);
    expect(event.request).toEqual({ url: 'https://aka.money/abc123' });
    expect((event.user as JsonObject).ip_address).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain('cookie-secret');
    expect(JSON.stringify(event)).not.toContain('safe-request-id');
  });

  it('returns undefined when no Sentry client is available', () => {
    expect(createBackgroundClickErrorReporter(() => undefined)).toBeUndefined();
  });

  it('returns undefined when reporter construction throws', () => {
    expect(
      createBackgroundClickErrorReporter(() => {
        throw new Error('client lookup exploded');
      })
    ).toBeUndefined();
  });

  it('never flushes from inside the background report, which would deadlock the flush lock', async () => {
    const requestClient = createRecordingClient();
    const laterClient = createRecordingClient();

    const reporter = Sentry.withIsolationScope(new Sentry.Scope(), () =>
      Sentry.withScope((requestScope) => {
        requestScope.setClient(requestClient.client);
        return createBackgroundClickErrorReporter();
      })
    );

    const requestFlush = vi.spyOn(requestClient.client, 'flush');
    const laterFlush = vi.spyOn(laterClient.client, 'flush');

    await Sentry.withIsolationScope(new Sentry.Scope(), () =>
      Sentry.withScope(async (backgroundScope) => {
        backgroundScope.setClient(laterClient.client);
        await reporter?.(new Error('D1 insert failed'), { shortCode: 'abc123', urlId: 'url-1' });
      })
    );

    expect(requestFlush).not.toHaveBeenCalled();
    expect(laterFlush).not.toHaveBeenCalled();

    requestFlush.mockRestore();
    laterFlush.mockRestore();

    await requestClient.client.flush();
    expect(eventsFrom(requestClient.envelopes)).toHaveLength(1);
  });
});
