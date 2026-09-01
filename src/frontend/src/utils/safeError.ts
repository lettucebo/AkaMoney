/**
 * Console context for failed API calls.
 *
 * Console errors are forwarded to Sentry, and an Axios error graph carries the
 * request URL, `config.data`, `request` and `response.data` - any of which can
 * hold an original URL with signed query credentials. Only classification
 * fields are ever exposed here: no message, stack, config, request, response
 * body, or arbitrary object serialization.
 */
export interface SafeErrorContext {
  name: string;
  code?: string;
  status?: number;
}

const UNKNOWN_ERROR_NAME = 'UnknownError';
/** Error names and Axios codes are identifier tokens (`AxiosError`, `ERR_BAD_REQUEST`). */
const IDENTIFIER_TOKEN = /^[A-Za-z0-9_.-]{1,64}$/;

const readValue = (source: object, key: string): unknown => (source as Record<string, unknown>)[key];

const toIdentifierToken = (value: unknown): string | undefined =>
  typeof value === 'string' && IDENTIFIER_TOKEN.test(value) ? value : undefined;

const toHttpStatus = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;

/** Reduces any thrown value to a name, an optional code, and an optional HTTP status. */
export function toSafeErrorContext(error: unknown): SafeErrorContext {
  if (typeof error !== 'object' || error === null) {
    return { name: UNKNOWN_ERROR_NAME };
  }

  const response = readValue(error, 'response');
  const status =
    typeof response === 'object' && response !== null
      ? toHttpStatus(readValue(response, 'status')) ?? toHttpStatus(readValue(error, 'status'))
      : toHttpStatus(readValue(error, 'status'));

  const context: SafeErrorContext = {
    name: toIdentifierToken(readValue(error, 'name')) ?? UNKNOWN_ERROR_NAME
  };

  const code = toIdentifierToken(readValue(error, 'code'));
  if (code !== undefined) {
    context.code = code;
  }
  if (status !== undefined) {
    context.status = status;
  }

  return context;
}
