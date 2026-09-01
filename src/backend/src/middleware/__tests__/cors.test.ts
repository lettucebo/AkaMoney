import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { corsMiddleware } from '../cors';

/**
 * Normalizes an Access-Control-Allow-Headers value into a sorted, lowercase,
 * trimmed list so assertions are order- and case-insensitive but still detect
 * extra or duplicated entries.
 */
function parseAllowHeaders(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter((header) => header.length > 0)
    .sort();
}

/**
 * Normalizes a Vary value the same way. Duplicates are deliberately kept so a
 * token appended twice is caught rather than silently collapsed into a set.
 */
function parseVary(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0)
    .sort();
}

const EXPECTED_ALLOW_HEADERS = ['authorization', 'baggage', 'content-type', 'sentry-trace'];
const EXPECTED_SIMPLE_VARY = ['origin'];
const EXPECTED_PREFLIGHT_VARY = ['access-control-request-headers', 'origin'];
const EXPECTED_ALLOW_METHODS = 'GET,POST,PUT,DELETE,OPTIONS';
const EXPECTED_MAX_AGE = '86400';
const EXPECTED_EXPOSE_HEADERS = 'Content-Length';

/** The unchanged fail-closed fallback for every origin that is not allowed. */
const FALLBACK_ORIGIN = 'https://aka.money';

/** Explicit production origins that must keep working byte-for-byte. */
const EXPLICIT_ORIGINS = [
  'https://aka.money',
  'https://admin.aka.money',
  'https://akamoney-admin.pages.dev',
  'http://localhost:5173',
  'http://localhost:8787'
];

/**
 * Canonical, exactly-`localhost` origins accepted by the dynamic development
 * rule. Ports vary for local tooling; nothing else may.
 */
const ALLOWED_DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:8787',
  'http://localhost:3000',
  'http://localhost',
  'https://localhost',
  'https://localhost:8443'
];

/**
 * Origins that must never be reflected. Each entry documents the class of
 * bypass it guards, including the `includes('localhost')` substring bug.
 */
const REJECTED_ORIGINS: [origin: string, reason: string][] = [
  ['https://localhost.attacker.example', 'attacker-controlled localhost prefix label'],
  ['https://attacker.localhost.example', 'localhost as an interior label'],
  ['https://examplelocalhost.com', 'localhost as a substring of the label'],
  ['https://attacker.example/?next=localhost', 'localhost only in the query string'],
  ['https://attacker.example/localhost', 'localhost only in the path'],
  ['https://malicious.com', 'unrelated origin'],
  ['http://sub.localhost:5173', 'localhost subdomain'],
  ['http://localhost.:5173', 'trailing-dot absolute hostname'],
  ['http://127.0.0.1:5173', 'IPv4 loopback is not dynamically allowed'],
  ['http://127.0.0.2:5173', 'lookalike IPv4 loopback range'],
  ['http://127.1:5173', 'noncanonical short-form IPv4'],
  ['http://0x7f.0.0.1:5173', 'hex-encoded IPv4'],
  ['http://[::1]:5173', 'IPv6 loopback is not dynamically allowed'],
  ['http://[0:0:0:0:0:0:0:1]:5173', 'expanded noncanonical IPv6 loopback'],
  ['http://localhost:5173/', 'trailing slash is not a canonical Origin'],
  ['http://localhost:5173?x=1', 'query string present'],
  ['http://localhost:5173#fragment', 'fragment present'],
  ['http://user:pass@localhost:5173', 'userinfo present'],
  ['http://LOCALHOST:5173', 'uppercase hostname is a noncanonical spelling'],
  ['HTTP://localhost:5173', 'uppercase scheme is a noncanonical spelling'],
  ['http://localhost:80', 'explicit default HTTP port'],
  ['https://localhost:443', 'explicit default HTTPS port'],
  ['ws://localhost:5173', 'non-HTTP(S) protocol'],
  ['file://localhost', 'opaque file protocol'],
  ['javascript:alert(1)//localhost', 'opaque scheme with no host'],
  ['null', 'opaque origin serialization'],
  ['not a url', 'malformed origin'],
  ['localhost', 'bare hostname is not an absolute URL'],
  ['//localhost:5173', 'protocol-relative reference'],
  ['http://', 'incomplete URL']
];

/** Near-miss spellings of explicit production origins. */
const REJECTED_PRODUCTION_VARIANTS: [origin: string, reason: string][] = [
  ['https://admin.aka.money/', 'trailing slash'],
  ['https://ADMIN.aka.money', 'uppercase hostname'],
  ['https://admin.aka.money:443', 'explicit default port'],
  ['https://akamoney-admin.pages.dev/', 'trailing slash'],
  ['https://aka.money/', 'trailing slash'],
  ['http://admin.aka.money', 'downgraded scheme'],
  ['https://admin.aka.money.attacker.example', 'suffix-extended hostname']
];

describe('CORS Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use('*', corsMiddleware);
    app.get('/test', (c) => c.json({ success: true }));
    app.options('/test', (c) => c.text(''));
  });

  /** Issues a simple GET, optionally with an Origin header. */
  function simpleRequest(origin?: string): Promise<Response> {
    return app.request('/test', {
      headers: origin === undefined ? {} : { Origin: origin }
    });
  }

  /** Issues a preflight, optionally with an Origin header. */
  function preflightRequest(
    origin?: string,
    requestHeaders = 'sentry-trace,baggage'
  ): Promise<Response> {
    return app.request('/test', {
      method: 'OPTIONS',
      headers: {
        ...(origin === undefined ? {} : { Origin: origin }),
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': requestHeaders
      }
    });
  }

  describe('requests without an Origin header', () => {
    it('returns the unchanged fallback origin for a simple request', async () => {
      const res = await simpleRequest();

      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(FALLBACK_ORIGIN);
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(parseVary(res.headers.get('Vary'))).toEqual(EXPECTED_SIMPLE_VARY);
    });

    it('returns the unchanged fallback origin and full header contract for a preflight', async () => {
      const res = await preflightRequest();

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(FALLBACK_ORIGIN);
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(parseAllowHeaders(res.headers.get('Access-Control-Allow-Headers'))).toEqual(
        EXPECTED_ALLOW_HEADERS
      );
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe(EXPECTED_ALLOW_METHODS);
      expect(res.headers.get('Access-Control-Max-Age')).toBe(EXPECTED_MAX_AGE);
      expect(parseVary(res.headers.get('Vary'))).toEqual(EXPECTED_PREFLIGHT_VARY);
    });
  });

  describe('allowed canonical localhost development origins', () => {
    it.each(ALLOWED_DEVELOPMENT_ORIGINS)('reflects %s on a simple request', async (origin) => {
      const res = await simpleRequest(origin);

      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(res.headers.get('Access-Control-Expose-Headers')).toBe(EXPECTED_EXPOSE_HEADERS);
      expect(parseVary(res.headers.get('Vary'))).toEqual(EXPECTED_SIMPLE_VARY);
    });

    it.each(ALLOWED_DEVELOPMENT_ORIGINS)('reflects %s on a preflight', async (origin) => {
      const res = await preflightRequest(origin);

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(parseAllowHeaders(res.headers.get('Access-Control-Allow-Headers'))).toEqual(
        EXPECTED_ALLOW_HEADERS
      );
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe(EXPECTED_ALLOW_METHODS);
      expect(res.headers.get('Access-Control-Max-Age')).toBe(EXPECTED_MAX_AGE);
      expect(parseVary(res.headers.get('Vary'))).toEqual(EXPECTED_PREFLIGHT_VARY);
    });
  });

  describe('rejected origins fall back without reflection', () => {
    it.each(REJECTED_ORIGINS)('does not reflect %s (%s) on a simple request', async (origin) => {
      const res = await simpleRequest(origin);

      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(FALLBACK_ORIGIN);
      expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe(origin);
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(parseVary(res.headers.get('Vary'))).toEqual(EXPECTED_SIMPLE_VARY);
    });

    it.each(REJECTED_ORIGINS)('does not reflect %s (%s) on a preflight', async (origin) => {
      const res = await preflightRequest(origin);

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(FALLBACK_ORIGIN);
      expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe(origin);
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(parseAllowHeaders(res.headers.get('Access-Control-Allow-Headers'))).toEqual(
        EXPECTED_ALLOW_HEADERS
      );
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe(EXPECTED_ALLOW_METHODS);
      expect(res.headers.get('Access-Control-Max-Age')).toBe(EXPECTED_MAX_AGE);
      expect(parseVary(res.headers.get('Vary'))).toEqual(EXPECTED_PREFLIGHT_VARY);
    });
  });

  describe('explicit production origins', () => {
    it.each(EXPLICIT_ORIGINS)('reflects %s byte-for-byte on a simple request', async (origin) => {
      const res = await simpleRequest(origin);

      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(res.headers.get('Access-Control-Expose-Headers')).toBe(EXPECTED_EXPOSE_HEADERS);
      expect(parseVary(res.headers.get('Vary'))).toEqual(EXPECTED_SIMPLE_VARY);
    });

    it.each(EXPLICIT_ORIGINS)('reflects %s byte-for-byte on a preflight', async (origin) => {
      const res = await preflightRequest(origin);

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(parseAllowHeaders(res.headers.get('Access-Control-Allow-Headers'))).toEqual(
        EXPECTED_ALLOW_HEADERS
      );
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe(EXPECTED_ALLOW_METHODS);
      expect(res.headers.get('Access-Control-Max-Age')).toBe(EXPECTED_MAX_AGE);
      expect(parseVary(res.headers.get('Vary'))).toEqual(EXPECTED_PREFLIGHT_VARY);
    });

    it.each(REJECTED_PRODUCTION_VARIANTS)(
      'does not reflect the %s variant (%s) on a simple request',
      async (origin) => {
        const res = await simpleRequest(origin);

        expect(res.status).toBe(200);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe(FALLBACK_ORIGIN);
        expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe(origin);
        expect(parseVary(res.headers.get('Vary'))).toEqual(EXPECTED_SIMPLE_VARY);
      }
    );

    it.each(REJECTED_PRODUCTION_VARIANTS)(
      'does not reflect the %s variant (%s) on a preflight',
      async (origin) => {
        const res = await preflightRequest(origin);

        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe(FALLBACK_ORIGIN);
        expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe(origin);
        expect(parseAllowHeaders(res.headers.get('Access-Control-Allow-Headers'))).toEqual(
          EXPECTED_ALLOW_HEADERS
        );
        expect(parseVary(res.headers.get('Vary'))).toEqual(EXPECTED_PREFLIGHT_VARY);
      }
    );
  });

  describe('Sentry trace header contract from #154', () => {
    it('should allow Sentry trace headers for the production admin origin', async () => {
      const res = await preflightRequest('https://admin.aka.money');

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.aka.money');
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(parseAllowHeaders(res.headers.get('Access-Control-Allow-Headers'))).toEqual(
        EXPECTED_ALLOW_HEADERS
      );
    });

    it('should allow Sentry trace headers for the local development origin', async () => {
      const res = await preflightRequest('http://localhost:5173');

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(parseAllowHeaders(res.headers.get('Access-Control-Allow-Headers'))).toEqual(
        EXPECTED_ALLOW_HEADERS
      );
    });

    it('should not reflect unapproved request headers in the preflight response', async () => {
      const res = await preflightRequest('https://admin.aka.money', 'x-unapproved');
      const allowHeaders = parseAllowHeaders(res.headers.get('Access-Control-Allow-Headers'));

      expect(res.status).toBe(204);
      expect(allowHeaders).not.toContain('x-unapproved');
      expect(allowHeaders).toEqual(EXPECTED_ALLOW_HEADERS);
    });

    it('should not reflect unapproved request headers for an allowed localhost origin', async () => {
      const res = await preflightRequest('http://localhost:5173', 'x-unapproved');
      const allowHeaders = parseAllowHeaders(res.headers.get('Access-Control-Allow-Headers'));

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
      expect(allowHeaders).not.toContain('x-unapproved');
      expect(allowHeaders).toEqual(EXPECTED_ALLOW_HEADERS);
    });

    it('should not reflect a rejected origin or unapproved headers in the same preflight', async () => {
      const res = await preflightRequest('https://localhost.attacker.example', 'x-unapproved');
      const allowHeaders = parseAllowHeaders(res.headers.get('Access-Control-Allow-Headers'));

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(FALLBACK_ORIGIN);
      expect(allowHeaders).not.toContain('x-unapproved');
      expect(allowHeaders).toEqual(EXPECTED_ALLOW_HEADERS);
    });

    it('should keep the existing methods, expose headers and max age preflight contract', async () => {
      const res = await preflightRequest('https://admin.aka.money');

      expect(res.headers.get('Access-Control-Allow-Methods')).toBe(EXPECTED_ALLOW_METHODS);
      expect(res.headers.get('Access-Control-Expose-Headers')).toBe(EXPECTED_EXPOSE_HEADERS);
      expect(res.headers.get('Access-Control-Max-Age')).toBe(EXPECTED_MAX_AGE);
    });
  });
});
