import * as Sentry from '@sentry/cloudflare/nodejs_compat';
import type { CloudflareOptions, Event } from '@sentry/cloudflare/nodejs_compat';
import {
  BACKGROUND_ANALYTICS_ERROR_MESSAGE,
  BACKGROUND_CLICK_RECORDING_OPERATION,
  BACKGROUND_OPERATION_TAG_KEY,
  CLICK_RECORDING_OPERATION_NAME,
  toBoundedErrorMessage,
  toErrorName,
} from './observability';
import type { ClickRecordingErrorReporter } from './observability';
import type { Env } from './types';

type JsonObject = Record<string, unknown>;
type StreamedSpan = Parameters<Parameters<typeof Sentry.withStreamedSpan>[0]>[0];
type SentryClient = NonNullable<ReturnType<typeof Sentry.getClient>>;

const CREDENTIAL_HEADER_NAMES = new Set(['authorization', 'x-api-key', 'cookie']);

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scrubHeaderRecord(headers: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !CREDENTIAL_HEADER_NAMES.has(name.toLowerCase()))
  );
}

/**
 * Background click-recording reports are identified by a stable event tag set on
 * the explicit report scope, not by the event message, so the check cannot be
 * spoofed or broken by message formatting. Only exception-shaped events qualify.
 */
function isBackgroundClickRecordingException(event: JsonObject): boolean {
  if (event.type !== undefined) {
    return false;
  }

  const tags = event.tags;

  return (
    isRecord(tags) && tags[BACKGROUND_OPERATION_TAG_KEY] === BACKGROUND_CLICK_RECORDING_OPERATION
  );
}

function removeBackgroundRequestContext(event: JsonObject): JsonObject {
  const scrubbed = { ...event };

  if (isRecord(scrubbed.request)) {
    const { headers: _headers, cookies: _cookies, ...requestWithoutHeaders } = scrubbed.request;
    scrubbed.request = requestWithoutHeaders;
  }

  if (isRecord(scrubbed.user)) {
    const { ip_address: _ipAddress, ...userWithoutIp } = scrubbed.user;
    scrubbed.user = userWithoutIp;
  }

  return scrubbed;
}

function scrubCredentialHeaderFields(value: unknown, currentKey?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => scrubCredentialHeaderFields(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  if (currentKey?.toLowerCase() === 'headers') {
    return scrubHeaderRecord(value);
  }

  const entries = Object.entries(value).flatMap(([key, child]) => {
    if (key.toLowerCase() === 'cookies') {
      return [];
    }

    return [[key, scrubCredentialHeaderFields(child, key)]];
  });

  return Object.fromEntries(entries);
}

export function scrubCredentialHeaders<T extends Event>(event: T): T {
  const scrubbed = scrubCredentialHeaderFields(event);

  if (isRecord(scrubbed) && isBackgroundClickRecordingException(scrubbed)) {
    return removeBackgroundRequestContext(scrubbed) as T;
  }

  return scrubbed as T;
}

function isCredentialSpanAttribute(name: string): boolean {
  const normalized = name.toLowerCase().replaceAll('-', '_');
  return (
    normalized.startsWith('http.request.header.authorization') ||
    normalized.startsWith('http.request.header.x_api_key') ||
    normalized.startsWith('http.request.header.cookie')
  );
}

function scrubSpanAttributeRecord(attributes: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(attributes).filter(([name]) => !isCredentialSpanAttribute(name))
  );
}

export function scrubStreamedSpan(span: StreamedSpan): StreamedSpan {
  if (!isRecord(span.attributes)) {
    return span;
  }

  return {
    ...span,
    attributes: scrubSpanAttributeRecord(span.attributes),
  };
}

export function createSentryOptions(env: Env): CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN || undefined,
    environment: env.ENVIRONMENT || 'development',
    tracesSampleRate: 0.01,
    traceLifecycle: 'stream',
    enableLogs: true,
    sendDefaultPii: true,
    beforeSend: scrubCredentialHeaders,
    beforeSendTransaction: scrubCredentialHeaders,
    beforeSendSpan: Sentry.withStreamedSpan(scrubStreamedSpan),
    integrations: [
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
      Sentry.captureConsoleIntegration({ levels: ['error'] }),
    ],
  };
}

/**
 * Builds a background error reporter bound to the Sentry client that is active
 * while the redirect handler runs.
 *
 * The client is resolved synchronously, before background work is registered,
 * because `ctx.waitUntil` continuations no longer resolve to the request client.
 * Reporting uses freshly constructed, empty current and isolation scopes that
 * carry only that client, so no ambient request data (headers, cookies, IP,
 * breadcrumbs, tags, contexts) can be merged into the report.
 *
 * Returns `undefined` when no client is available or when construction fails, so
 * the redirect response is never affected.
 */
export function createBackgroundClickErrorReporter(
  resolveClient: () => SentryClient | undefined = () => Sentry.getClient()
): ClickRecordingErrorReporter | undefined {
  try {
    const client = resolveClient();

    if (!client) {
      return undefined;
    }

    const reportScope = new Sentry.Scope();
    reportScope.setClient(client);
    reportScope.setLevel('error');
    reportScope.setTag(BACKGROUND_OPERATION_TAG_KEY, BACKGROUND_CLICK_RECORDING_OPERATION);

    const reportIsolationScope = new Sentry.Scope();
    reportIsolationScope.setClient(client);

    return (error, context) => {
      const scope = reportScope.clone();
      scope.setTag('short_code', context.shortCode);
      scope.setTag('url_id', context.urlId);

      // Both sinks run inside the same explicit empty isolation scope so neither
      // the exception nor the log can inherit ambient isolation data, and neither
      // performs an implicit current-client lookup.
      Sentry.withIsolationScope(reportIsolationScope, () => {
        client.captureException(
          error,
          { mechanism: { handled: true, type: BACKGROUND_CLICK_RECORDING_OPERATION } },
          scope
        );

        Sentry.logger.error(
          BACKGROUND_ANALYTICS_ERROR_MESSAGE,
          {
            operation: CLICK_RECORDING_OPERATION_NAME,
            shortCode: context.shortCode,
            urlId: context.urlId,
            errorName: toErrorName(error),
            errorMessage: toBoundedErrorMessage(error),
          },
          { scope }
        );
      });
    };
  } catch {
    return undefined;
  }
}
