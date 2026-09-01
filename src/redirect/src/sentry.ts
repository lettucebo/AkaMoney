import * as Sentry from '@sentry/cloudflare/nodejs_compat';
import type { CloudflareOptions, Event } from '@sentry/cloudflare/nodejs_compat';
import {
  BACKGROUND_ANALYTICS_ERROR_MESSAGE,
  BACKGROUND_CLICK_RECORDING_OPERATION,
  BACKGROUND_OPERATION_TAG_KEY,
  CLICK_RECORDING_OPERATION_NAME,
  toSafeReportError,
} from './observability';
import type { ClickRecordingErrorReporter } from './observability';
import type { Env } from './types';

type JsonObject = Record<string, unknown>;
type StreamedSpan = Parameters<Parameters<typeof Sentry.withStreamedSpan>[0]>[0];
type SentryClient = NonNullable<ReturnType<typeof Sentry.getClient>>;
type SentryEnvelope = Parameters<SentryClient['sendEnvelope']>[0];

const CREDENTIAL_HEADER_NAMES = new Set(['authorization', 'x-api-key', 'cookie']);

/**
 * Top-level event fields kept on a background click-recording exception. This
 * is an allowlist, not a denylist, so nothing that a future integration adds can
 * reach the transport unnoticed.
 */
const BACKGROUND_EXCEPTION_ALLOWED_FIELDS = [
  'event_id',
  'timestamp',
  'platform',
  'level',
  'environment',
  'release',
  'dist',
  'sdk',
  'exception',
  'debug_meta',
] as const;

const BACKGROUND_EXCEPTION_ALLOWED_TAGS = [
  BACKGROUND_OPERATION_TAG_KEY,
  'short_code',
  'url_id',
] as const;

const LOG_ENVELOPE_ITEM_CONTENT_TYPE = 'application/vnd.sentry.items.log+json';
const LOG_ENVELOPE_ITEM_VERSION = 2;
const LOG_SEVERITY_NUMBER_ERROR = 17;

interface BackgroundLogAttributes {
  operation: string;
  shortCode: string;
  urlId: string;
  errorName: string;
  errorMessage: string;
}

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

/**
 * Sentry always merges the global scope into every event, so empty current and
 * isolation scopes are not enough to guarantee the payload. `beforeSend` is the
 * last stage before transport, so the tagged background exception is rebuilt
 * from an explicit field allowlist: anything the pipeline, the global scope or a
 * future integration adds is dropped rather than denylisted.
 */
function toAllowlistedBackgroundReport(event: JsonObject): JsonObject {
  const report: JsonObject = {};

  for (const field of BACKGROUND_EXCEPTION_ALLOWED_FIELDS) {
    if (event[field] !== undefined) {
      report[field] = event[field];
    }
  }

  const tags = event.tags;

  if (isRecord(tags)) {
    const allowedTags = Object.fromEntries(
      BACKGROUND_EXCEPTION_ALLOWED_TAGS.filter((tag) => typeof tags[tag] === 'string').map(
        (tag) => [tag, tags[tag]]
      )
    );

    if (Object.keys(allowedTags).length > 0) {
      report.tags = allowedTags;
    }
  }

  return report;
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
  const source = event as unknown as JsonObject;

  if (isBackgroundClickRecordingException(source)) {
    return toAllowlistedBackgroundReport(source) as unknown as T;
  }

  return scrubCredentialHeaderFields(event) as T;
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
 * Builds a minimal Sentry log envelope by hand.
 *
 * `Sentry.logger.error` runs the public log pipeline, which merges global,
 * isolation and current scope attributes (user, scope attributes, release, …)
 * *after* `beforeSendLog`, so it cannot guarantee an exact allowlist. Emitting
 * the documented envelope shape directly is the only way to send exactly the
 * operational attributes.
 */
function createBackgroundLogEnvelope(
  client: SentryClient,
  traceId: string,
  attributes: BackgroundLogAttributes
): SentryEnvelope {
  const environment = client.getOptions().environment;
  const sdk = client.getSdkMetadata()?.sdk;

  const typedAttributes: Record<string, { value: string; type: 'string' }> = {
    operation: { value: attributes.operation, type: 'string' },
    shortCode: { value: attributes.shortCode, type: 'string' },
    urlId: { value: attributes.urlId, type: 'string' },
    errorName: { value: attributes.errorName, type: 'string' },
    errorMessage: { value: attributes.errorMessage, type: 'string' },
  };

  // Sentry filters logs by environment, so this is the only SDK metadata kept.
  if (typeof environment === 'string' && environment.length > 0) {
    typedAttributes['sentry.environment'] = { value: environment, type: 'string' };
  }

  const envelopeHeaders =
    sdk?.name && sdk?.version ? { sdk: { name: sdk.name, version: sdk.version } } : {};

  return [
    envelopeHeaders,
    [
      [
        { type: 'log', item_count: 1, content_type: LOG_ENVELOPE_ITEM_CONTENT_TYPE },
        {
          version: LOG_ENVELOPE_ITEM_VERSION,
          items: [
            {
              timestamp: Date.now() / 1000,
              level: 'error',
              body: BACKGROUND_ANALYTICS_ERROR_MESSAGE,
              trace_id: traceId,
              severity_number: LOG_SEVERITY_NUMBER_ERROR,
              attributes: typedAttributes,
            },
          ],
        },
      ],
    ],
  ] as unknown as SentryEnvelope;
}

/**
 * Sends the log through the captured client's own transport, so the outer
 * Cloudflare flush lock still waits for it. Every synchronous throw and every
 * rejection is contained: the background `waitUntil` promise must always
 * resolve.
 */
async function sendBackgroundLog(
  client: SentryClient,
  traceId: string,
  attributes: BackgroundLogAttributes
): Promise<void> {
  try {
    await client.sendEnvelope(createBackgroundLogEnvelope(client, traceId, attributes));
  } catch {
    // Reporting failures must never reject the tracked waitUntil promise.
  }
}

/**
 * Builds a background error reporter bound to the Sentry client that is active
 * while the redirect handler runs.
 *
 * The client is resolved synchronously, before background work is registered,
 * because `ctx.waitUntil` continuations no longer resolve to the request client.
 * Reporting uses freshly constructed, empty current and isolation scopes that
 * carry only that client, and `beforeSend` rebuilds the exception from a field
 * allowlist, so neither ambient scope data (headers, cookies, IP, breadcrumbs,
 * tags, contexts) nor global-scope data can reach Sentry.
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

    // Generated by the reporter's own scope, so it links the request's own
    // background reports together without reading any ambient trace state.
    const reportTraceId = reportScope.getPropagationContext().traceId;

    return (error, context) => {
      // Only a freshly constructed safe Error is ever handed to Sentry.
      const safeError = toSafeReportError(error);

      const scope = reportScope.clone();
      scope.setTag('short_code', context.shortCode);
      scope.setTag('url_id', context.urlId);

      // The exception capture runs inside an explicit empty isolation scope so
      // it cannot inherit ambient isolation data or perform an implicit
      // current-client lookup.
      return Sentry.withIsolationScope(reportIsolationScope, () => {
        try {
          client.captureException(
            safeError,
            { mechanism: { handled: true, type: BACKGROUND_CLICK_RECORDING_OPERATION } },
            scope
          );
        } catch {
          // Reporting failures must never reject the tracked waitUntil promise.
        }

        return sendBackgroundLog(client, reportTraceId, {
          operation: CLICK_RECORDING_OPERATION_NAME,
          shortCode: context.shortCode,
          urlId: context.urlId,
          errorName: safeError.name,
          errorMessage: safeError.message,
        });
      });
    };
  } catch {
    return undefined;
  }
}
