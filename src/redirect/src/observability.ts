/**
 * Shared primitives for redirect background observability.
 *
 * This module intentionally has no Sentry import so that the native console
 * function is captured at module evaluation, before any per-request Sentry
 * initialization patches the global console.
 */

type ConsoleErrorFunction = (...args: unknown[]) => void;

const capturedConsoleError: unknown = typeof console === 'undefined' ? undefined : console.error;

/**
 * The workerd `console.error` implementation as it existed at module evaluation.
 *
 * Calling this bound reference keeps background failures visible in local and
 * Cloudflare logs without re-entering `captureConsoleIntegration`, so a single
 * failure cannot produce a duplicate Sentry issue.
 */
export const nativeConsoleError: ConsoleErrorFunction =
  typeof capturedConsoleError === 'function'
    ? (capturedConsoleError as ConsoleErrorFunction).bind(console)
    : () => undefined;

export const BACKGROUND_ANALYTICS_ERROR_MESSAGE = 'Redirect background analytics failed';
export const BACKGROUND_OPERATION_TAG_KEY = 'background_operation';
export const BACKGROUND_CLICK_RECORDING_OPERATION = 'redirect.click_recording';
export const CLICK_RECORDING_OPERATION_NAME = 'recordClick';
export const MAX_REPORTED_ERROR_MESSAGE_LENGTH = 200;

export interface ClickRecordingContext {
  shortCode: string;
  urlId: string;
}

export type ClickRecordingErrorReporter = (
  error: unknown,
  context: ClickRecordingContext
) => void | Promise<void>;

export function toErrorName(error: unknown): string {
  if (error instanceof Error && error.name) {
    return error.name;
  }

  return 'UnknownError';
}

/**
 * Only `Error.message` and raw string throwables are reported, and always
 * bounded. Arbitrary payloads are never serialized so that unexpected
 * throwables cannot smuggle request data into Sentry.
 */
export function toBoundedErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  return message.length > MAX_REPORTED_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_REPORTED_ERROR_MESSAGE_LENGTH)}...`
    : message;
}
