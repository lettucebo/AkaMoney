import * as Sentry from '@sentry/cloudflare/nodejs_compat';
import type { CloudflareOptions, Event } from '@sentry/cloudflare/nodejs_compat';
import type { Env } from './types';

type JsonObject = Record<string, unknown>;
type StreamedSpan = Parameters<Parameters<typeof Sentry.withStreamedSpan>[0]>[0];

const CREDENTIAL_HEADER_NAMES = new Set(['authorization', 'x-api-key', 'cookie']);
export const BACKGROUND_ANALYTICS_ERROR_MESSAGE = 'Redirect background analytics failed';

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scrubHeaderRecord(headers: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !CREDENTIAL_HEADER_NAMES.has(name.toLowerCase()))
  );
}

function isBackgroundAnalyticsErrorEvent(event: JsonObject): boolean {
  if (typeof event.message === 'string' && event.message.startsWith(BACKGROUND_ANALYTICS_ERROR_MESSAGE)) {
    return true;
  }

  const logentry = event.logentry;
  return (
    isRecord(logentry) &&
    typeof logentry.message === 'string' &&
    logentry.message.startsWith(BACKGROUND_ANALYTICS_ERROR_MESSAGE)
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

  if (isRecord(scrubbed) && isBackgroundAnalyticsErrorEvent(scrubbed)) {
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
