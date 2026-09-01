import * as Sentry from '@sentry/cloudflare';
import type { CloudflareOptions, ErrorEvent, Event } from '@sentry/cloudflare';
import type { Env } from '../types';

const CREDENTIAL_HEADERS = new Set(['authorization', 'cookie', 'x-api-key']);
const URL_DATA_KEYS = new Set(['url', 'http.url', 'url.full']);
const QUERY_DATA_KEYS = new Set(['http.query', 'query', 'query_string', 'url.query']);

type SentrySpanData = NonNullable<Event['spans']>[number]['data'];
type SentryTransactionEvent = Event & { type: 'transaction' };

function stripUrlQuery(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return value;
    }

    url.search = '';
    return url.toString();
  } catch {
    return value;
  }
}

function scrubUnknownData(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).flatMap(([key, value]) => {
      const normalizedKey = key.toLowerCase();

      if (QUERY_DATA_KEYS.has(normalizedKey)) {
        return [];
      }

      if (URL_DATA_KEYS.has(normalizedKey)) {
        return [[key, stripUrlQuery(value)]];
      }

      return [[key, value]];
    })
  );
}

function scrubSpanData(data: SentrySpanData): SentrySpanData {
  return scrubUnknownData(data) as SentrySpanData;
}

export function scrubSentryEventCredentials(event: ErrorEvent): ErrorEvent;
export function scrubSentryEventCredentials(event: SentryTransactionEvent): SentryTransactionEvent;
export function scrubSentryEventCredentials(event: Event): Event;
export function scrubSentryEventCredentials(event: Event): Event {
  const result: Event = { ...event };
  const headers = event.request?.headers;

  if (event.request) {
    // Cookies are dropped as a whole: the SDK can attach them parsed as
    // `request.cookies` even when the raw Cookie header is absent.
    const { cookies: _cookies, ...requestWithoutCookies } = event.request;

    result.request = headers
      ? {
          ...requestWithoutCookies,
          headers: Object.fromEntries(
            Object.entries(headers).filter(([name]) => !CREDENTIAL_HEADERS.has(name.toLowerCase()))
          )
        }
      : requestWithoutCookies;
  }

  if (event.breadcrumbs) {
    result.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({
      ...breadcrumb,
      data: breadcrumb.data ? scrubUnknownData(breadcrumb.data) : breadcrumb.data
    }));
  }

  if (event.spans) {
    result.spans = event.spans.map((span) => ({
      ...span,
      data: span.data ? scrubSpanData(span.data) : span.data
    }));
  }

  if (event.contexts) {
    result.contexts = Object.fromEntries(
      Object.entries(event.contexts).map(([name, context]) => [
        name,
        context && 'data' in context && typeof context.data === 'object' && context.data
          ? {
              ...context,
              data: scrubUnknownData(context.data as Record<string, unknown>)
            }
          : context
      ])
    );
  }

  return result;
}

export function createSentryOptions(env: Env): CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN || undefined,
    environment: env.ENVIRONMENT || 'development',
    tracesSampleRate: 0.2,
    enableLogs: true,
    sendDefaultPii: true,
    beforeSend: scrubSentryEventCredentials,
    beforeSendTransaction: scrubSentryEventCredentials,
    integrations: [
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
      Sentry.captureConsoleIntegration({ levels: ['error'] })
    ]
  };
}
