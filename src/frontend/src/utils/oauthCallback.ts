/**
 * Single source of truth for OAuth redirect-response parameters.
 *
 * Microsoft Entra returns the authorization response either in the query
 * string (`?code=...`) or in the fragment (`#code=...`, the MSAL
 * slash-prefixed `#/code=...`, and `#/route?code=...` for hash-routed apps).
 * The fragment is read both the way MSAL parses it - one `&`-separated
 * parameter list behind at most one leading `/`, where a `?` belongs to a
 * value - and as a route with its own query, so a response cannot hide behind
 * a route-shaped segment or inside a value. Those values must never reach
 * telemetry, so the same key set drives both callback *detection* and URL
 * *sanitization*: anything detected is also removed, and anything removed is
 * also detected.
 *
 * Matching is by parameter presence, not value, so empty (`?code=`), bare
 * (`?code`) and duplicated (`?code=a&code=b`) forms all count. Names are
 * compared case-sensitively after percent-decoding because MSAL itself parses
 * these exact names; a case-insensitive match would strip unrelated
 * application parameters such as `Code` or `Scope` from ordinary URLs.
 */
export const OAUTH_RESPONSE_KEYS = [
  'code',
  'access_token',
  'id_token',
  'refresh_token',
  'token_type',
  'expires_in',
  'scope',
  'client_info',
  'session_state',
  'error',
  'error_description',
  'error_uri',
  'suberror',
  'claims',
  'accountId',
  'cloud_instance_name',
  'cloud_instance_host_name',
  'cloud_graph_host_name',
  'msgraph_host',
  'timestamp',
  'trace_id',
  'correlation_id'
] as const;

/**
 * `state` is only sensitive as part of an authorization response: applications
 * legitimately use it on their own URLs. It is therefore treated as sensitive
 * (and removed) only when a response key exists anywhere in the query or the
 * fragment.
 */
export const OAUTH_STATE_KEY = 'state';

export interface OAuthCallbackInspection {
  /** True when the URL carries at least one OAuth response parameter. */
  readonly isCallback: boolean;
  /**
   * The URL with only OAuth response parameters (and paired `state`) removed.
   * Identical to the input when nothing sensitive is present.
   */
  readonly sanitizedUrl: string;
}

const RESPONSE_KEYS: ReadonlySet<string> = new Set<string>(OAUTH_RESPONSE_KEYS);

/** A fragment is read two ways: as MSAL parses it, and as a route with a query. */
interface UrlParts {
  readonly base: string;
  readonly query: string;
  /** The single `/` MSAL strips from `#/code=...` before parsing a response. */
  readonly hashPrefix: '' | '/';
  /** Everything after that prefix. */
  readonly hashRest: string;
}

const decodeParameterName = (rawName: string): string => {
  try {
    return decodeURIComponent(rawName.replace(/\+/g, ' '));
  } catch {
    return rawName;
  }
};

const parameterName = (segment: string): string => {
  const separator = segment.indexOf('=');
  return decodeParameterName(separator >= 0 ? segment.slice(0, separator) : segment);
};

const splitSegments = (raw: string): string[] => (raw === '' ? [] : raw.split('&'));

const containsResponseKey = (raw: string): boolean =>
  splitSegments(raw).some((segment) => RESPONSE_KEYS.has(parameterName(segment)));

const isSensitiveName = (name: string): boolean =>
  RESPONSE_KEYS.has(name) || name === OAUTH_STATE_KEY;

/**
 * Reports whether a fragment payload is the authorization response MSAL would
 * deserialize.
 *
 * MSAL strips at most one leading `#/` (or `#`) and hands the rest to
 * `URLSearchParams`, which separates parameters on `&` only and refuses a
 * payload without `=` (`stripLeadingHashOrQuery`/`getDeserializedResponse` in
 * `@azure/msal-common`). `?` is therefore part of a value, never a delimiter:
 * `#code=a?b` is one `code` parameter. `#/code` stays a route to `/code`, and
 * `#//code=v` and `#!/route&code=v` keep the parameter names `/code` and
 * `!/route`.
 */
const carriesMsalResponse = (rest: string): boolean =>
  rest.includes('=') && containsResponseKey(rest);

/**
 * Reports whether a hash *route* carries a response in its own query, the
 * `#/route?code=...` form a hash-routed application produces. MSAL would read
 * `route?code` as one parameter name, so this view exists in addition to the
 * MSAL one, never instead of it.
 */
const carriesRouteQueryResponse = (rest: string): boolean => {
  const queryIndex = rest.indexOf('?');
  return queryIndex >= 0 && containsResponseKey(rest.slice(queryIndex + 1));
};

const fragmentCarriesResponse = (rest: string): boolean =>
  carriesMsalResponse(rest) || carriesRouteQueryResponse(rest);

/**
 * Splits a URL by string position instead of parsing it, so unrelated origin,
 * path, parameter order and percent-encoding survive sanitization byte for
 * byte and no input can throw.
 */
const parseUrlParts = (href: string): UrlParts => {
  const hashIndex = href.indexOf('#');
  const beforeHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex + 1) : '';

  const queryIndex = beforeHash.indexOf('?');
  const base = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';

  const hashPrefix = hash.startsWith('/') ? '/' : '';
  return { base, query, hashPrefix, hashRest: hash.slice(hashPrefix.length) };
};

const removeSensitiveSegments = (raw: string): string =>
  splitSegments(raw)
    .filter((segment) => !isSensitiveName(parameterName(segment)))
    .join('&');

/**
 * Removes every response parameter, in whichever view it appears.
 *
 * The MSAL view runs first and drops each matching parameter whole, so a value
 * containing a raw `?` cannot leave a tail behind; the payload is then
 * re-examined, because a removed value can have hidden a route query
 * (`#x=?code=<value>`). Only a payload that is not an MSAL response is treated
 * as a route with its own query. Every recursive pass drops at least one
 * parameter, so the recursion always terminates.
 */
const sanitizeFragment = (rest: string): string => {
  if (carriesMsalResponse(rest)) {
    return sanitizeFragment(removeSensitiveSegments(rest));
  }

  const queryIndex = rest.indexOf('?');
  if (queryIndex < 0 || !containsResponseKey(rest.slice(queryIndex + 1))) {
    return rest;
  }

  const path = rest.slice(0, queryIndex);
  const query = removeSensitiveSegments(rest.slice(queryIndex + 1));
  return query === '' ? path : `${path}?${query}`;
};

const buildUrl = (parts: UrlParts, query: string, hashRest: string): string => {
  // An emptied fragment drops the `#/` marker with it: what remains of a
  // response is not a route.
  const hash = hashRest === '' ? '' : parts.hashPrefix + hashRest;

  return `${parts.base}${query === '' ? '' : `?${query}`}${hash === '' ? '' : `#${hash}`}`;
};

/**
 * Reports whether a URL carries OAuth response parameters and returns the URL
 * with those parameters removed. Values are never returned, logged or stored.
 */
export const inspectOAuthCallback = (href: string): OAuthCallbackInspection => {
  const parts = parseUrlParts(href);

  if (!containsResponseKey(parts.query) && !fragmentCarriesResponse(parts.hashRest)) {
    return { isCallback: false, sanitizedUrl: href };
  }

  return {
    isCallback: true,
    sanitizedUrl: buildUrl(
      parts,
      removeSensitiveSegments(parts.query),
      sanitizeFragment(parts.hashRest)
    )
  };
};
