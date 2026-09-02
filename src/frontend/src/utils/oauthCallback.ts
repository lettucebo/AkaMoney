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

interface UrlParts {
  readonly base: string;
  readonly query: string;
  readonly hash: string;
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

const isSensitiveName = (name: string): boolean =>
  RESPONSE_KEYS.has(name) || name === OAUTH_STATE_KEY;

const containsResponseKey = (raw: string): boolean =>
  splitSegments(raw).some((segment) => RESPONSE_KEYS.has(parameterName(segment)));

const containsSensitiveParameter = (raw: string): boolean =>
  splitSegments(raw).some((segment) => isSensitiveName(parameterName(segment)));

/** `#/code=...`: the payload MSAL reads after stripping one leading slash. */
const msalPayload = (hash: string): string => (hash.startsWith('/') ? hash.slice(1) : hash);

/** `#/route?code=...`: the query a hash-routed application appends to a route. */
const routeQuery = (payload: string): { readonly path: string; readonly query: string } | null => {
  const queryIndex = payload.indexOf('?');
  return queryIndex < 0
    ? null
    : { path: payload.slice(0, queryIndex), query: payload.slice(queryIndex + 1) };
};

/**
 * Reports whether a fragment carries an authorization response.
 *
 * The fragment is read both ways at once. MSAL strips at most one leading `#/`
 * (or `#`) and hands the rest to `URLSearchParams`, which separates parameters
 * on `&` only and refuses a payload without `=`
 * (`stripLeadingHashOrQuery`/`getDeserializedResponse` in `@azure/msal-common`):
 * a `?` belongs to a value there, so `#code=a?b` is one `code` parameter,
 * `#/code` stays a route to `/code`, and `#//code=v` and `#!/route&code=v`
 * keep the parameter names `/code` and `!/route`. A hash-routed application
 * additionally puts its own query behind `?`, which the second view covers.
 */
const hashCarriesResponse = (hash: string): boolean => {
  const payload = msalPayload(hash);
  const route = routeQuery(payload);

  return (
    (payload.includes('=') && containsResponseKey(payload)) ||
    (route !== null && containsResponseKey(route.query))
  );
};

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

  return { base, query, hash };
};

const removeSensitiveSegments = (raw: string): string =>
  splitSegments(raw)
    .filter((segment) => !isSensitiveName(parameterName(segment)))
    .join('&');

/**
 * Removes the sensitive parameters of both fragment views once.
 *
 * The MSAL view drops each matching parameter whole, so a value that contains
 * a raw `?` cannot leave a tail behind; the route view then cleans a query
 * whose parameters MSAL would have read as part of a route name. Both views
 * also drop `state`, because the pairing that makes it sensitive is decided
 * for the whole URL before anything is removed.
 */
const cleanHashOnce = (hash: string): string => {
  const prefix = hash.startsWith('/') ? '/' : '';
  let payload = msalPayload(hash);

  if (containsSensitiveParameter(payload)) {
    payload = removeSensitiveSegments(payload);
  }

  const route = routeQuery(payload);
  if (route !== null && containsSensitiveParameter(route.query)) {
    const query = removeSensitiveSegments(route.query);
    payload = query === '' ? route.path : `${route.path}?${query}`;
  }

  // An emptied fragment drops the `#/` marker with it: what remains of a
  // response is not a route.
  return payload === '' ? '' : prefix + payload;
};

/**
 * Cleans until the fragment stops changing: rebuilding can expose a parameter
 * that a removed one hid, as in `#code&/code=<value>`, whose leading slash
 * becomes MSAL's marker only once the first parameter is gone. Every pass that
 * changes anything removes a parameter, so the loop always terminates.
 */
const sanitizeHash = (hash: string): string => {
  let current = hash;
  let previous = '';

  while (current !== previous) {
    previous = current;
    current = cleanHashOnce(current);
  }

  return current;
};

const buildUrl = (base: string, query: string, hash: string): string =>
  `${base}${query === '' ? '' : `?${query}`}${hash === '' ? '' : `#${hash}`}`;

/**
 * Reports whether a URL carries OAuth response parameters and returns the URL
 * with those parameters removed. Values are never returned, logged or stored.
 */
export const inspectOAuthCallback = (href: string): OAuthCallbackInspection => {
  const parts = parseUrlParts(href);

  if (!containsResponseKey(parts.query) && !hashCarriesResponse(parts.hash)) {
    return { isCallback: false, sanitizedUrl: href };
  }

  return {
    isCallback: true,
    sanitizedUrl: buildUrl(
      parts.base,
      removeSensitiveSegments(parts.query),
      sanitizeHash(parts.hash)
    )
  };
};
