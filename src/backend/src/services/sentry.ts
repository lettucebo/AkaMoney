import * as Sentry from '@sentry/cloudflare';
import type { CloudflareOptions, Event } from '@sentry/cloudflare';
import type { Env } from '../types';

const CREDENTIAL_HEADERS = new Set(['authorization', 'x-api-key']);
const URL_DATA_KEYS = new Set(['url', 'http.url', 'url.full']);
const QUERY_DATA_KEYS = new Set(['http.query', 'query', 'query_string', 'url.query']);

type DataContainer = Record<string, unknown> & {
  data?: Record<string, unknown>;
};

type ScrubbableEvent = Event & {
  breadcrumbs?: DataContainer[];
  spans?: DataContainer[];
  contexts?: Record<string, DataContainer | undefined>;
};

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

function scrubData(data: Record<string, unknown>) {
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

export function scrubSentryEventCredentials<T extends Event>(event: T): T {
  const result: ScrubbableEvent = { ...event };
  const headers = event.request?.headers;

  if (headers) {
    const scrubbedHeaders = Object.fromEntries(
      Object.entries(headers).filter(([name]) => !CREDENTIAL_HEADERS.has(name.toLowerCase()))
    );

    result.request = {
      ...event.request,
      headers: scrubbedHeaders
    };
  }

  const scrubbable = event as ScrubbableEvent;

  if (scrubbable.breadcrumbs) {
    result.breadcrumbs = scrubbable.breadcrumbs.map((breadcrumb) => ({
      ...breadcrumb,
      data: breadcrumb.data ? scrubData(breadcrumb.data) : breadcrumb.data
    }));
  }

  if (scrubbable.spans) {
    result.spans = scrubbable.spans.map((span) => ({
      ...span,
      data: span.data ? scrubData(span.data) : span.data
    }));
  }

  if (scrubbable.contexts) {
    result.contexts = Object.fromEntries(
      Object.entries(scrubbable.contexts).map(([name, context]) => [
        name,
        context?.data
          ? {
              ...context,
              data: scrubData(context.data)
            }
          : context
      ])
    );
  }

  return result as T;
}

export function createSentryOptions(env: Env): CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN || undefined,
    environment: env.ENVIRONMENT || 'development',
    tracesSampleRate: 0.2,
    sendDefaultPii: true,
    beforeSend: scrubSentryEventCredentials,
    beforeSendTransaction: scrubSentryEventCredentials,
    integrations: [
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
      Sentry.captureConsoleIntegration({ levels: ['error'] })
    ]
  };
}
