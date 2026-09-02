/**
 * Single source of truth for OAuth redirect-response parameters.
 *
 * Microsoft Entra returns the authorization response either in the query
 * string (`?code=...`) or in the fragment (`#code=...`, and `#/route?code=...`
 * for hash-routed apps). Those values must never reach telemetry, so the same
 * key set drives both callback *detection* and URL *sanitization*: anything
 * detected is also removed, and anything removed is also detected.
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
  readonly hashPath: string;
  readonly hashSeparator: '' | '?';
  readonly hashQuery: string;
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

  const hashQueryIndex = hash.indexOf('?');
  if (hashQueryIndex >= 0) {
    return {
      base,
      query,
      hashPath: hash.slice(0, hashQueryIndex),
      hashSeparator: '?',
      hashQuery: hash.slice(hashQueryIndex + 1)
    };
  }

  // `#/dashboard` is a hash route; `#code=...` is a fragment response.
  const isHashRoute = hash.startsWith('/') || hash.startsWith('!');
  return {
    base,
    query,
    hashPath: isHashRoute ? hash : '',
    hashSeparator: '',
    hashQuery: isHashRoute ? '' : hash
  };
};

const containsResponseKey = (raw: string): boolean =>
  splitSegments(raw).some((segment) => RESPONSE_KEYS.has(parameterName(segment)));

const removeSensitiveSegments = (raw: string): string =>
  splitSegments(raw)
    .filter((segment) => {
      const name = parameterName(segment);
      return !RESPONSE_KEYS.has(name) && name !== OAUTH_STATE_KEY;
    })
    .join('&');

const buildUrl = (parts: UrlParts, query: string, hashQuery: string): string => {
  const hash = hashQuery === '' ? parts.hashPath : parts.hashPath + parts.hashSeparator + hashQuery;

  return `${parts.base}${query === '' ? '' : `?${query}`}${hash === '' ? '' : `#${hash}`}`;
};

/**
 * Reports whether a URL carries OAuth response parameters and returns the URL
 * with those parameters removed. Values are never returned, logged or stored.
 */
export const inspectOAuthCallback = (href: string): OAuthCallbackInspection => {
  const parts = parseUrlParts(href);

  if (!containsResponseKey(parts.query) && !containsResponseKey(parts.hashQuery)) {
    return { isCallback: false, sanitizedUrl: href };
  }

  return {
    isCallback: true,
    sanitizedUrl: buildUrl(
      parts,
      removeSensitiveSegments(parts.query),
      removeSensitiveSegments(parts.hashQuery)
    )
  };
};
