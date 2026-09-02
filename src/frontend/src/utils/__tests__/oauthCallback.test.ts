import { describe, expect, it } from 'vitest';
import {
  OAUTH_RESPONSE_KEYS,
  OAUTH_STATE_KEY,
  inspectOAuthCallback
} from '../oauthCallback';

const ORIGIN = 'https://admin.aka.money';
const PAGE = `${ORIGIN}/dashboard`;
/** Never a real credential: only used to prove a value never survives sanitization. */
const CANARY = 'CANARY-oauth-response-value';

const detect = (href: string): boolean => inspectOAuthCallback(href).isCallback;
const sanitize = (href: string): string => inspectOAuthCallback(href).sanitizedUrl;

describe('OAuth callback response key contract', () => {
  it('exposes the exhaustive plan key set exactly once each', () => {
    expect([...OAUTH_RESPONSE_KEYS]).toEqual([
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
    ]);
    expect(new Set(OAUTH_RESPONSE_KEYS).size).toBe(OAUTH_RESPONSE_KEYS.length);
    expect(OAUTH_RESPONSE_KEYS).not.toContain(OAUTH_STATE_KEY);
    expect(OAUTH_STATE_KEY).toBe('state');
  });
});

describe.each(OAUTH_RESPONSE_KEYS)('response key "%s"', (key) => {
  const forms = [
    ['query value', `${PAGE}?${key}=${CANARY}`],
    ['query empty value', `${PAGE}?${key}=`],
    ['query bare key', `${PAGE}?${key}`],
    ['query duplicates', `${PAGE}?${key}=${CANARY}&${key}=${CANARY}2`],
    ['bare fragment', `${PAGE}#${key}=${CANARY}`],
    ['fragment empty value', `${PAGE}#${key}=`],
    ['fragment duplicates', `${PAGE}#${key}=${CANARY}&${key}=${CANARY}2`],
    ['hash route fragment', `${PAGE}#/section?${key}=${CANARY}`],
    ['slash-prefixed fragment', `${PAGE}#/${key}=${CANARY}`],
    ['slash-prefixed fragment empty value', `${PAGE}#/${key}=`],
    ['slash-prefixed fragment duplicates', `${PAGE}#/${key}=${CANARY}&${key}=${CANARY}2`],
    ['fragment before a raw question mark', `${PAGE}#${key}=${CANARY}?trailing`],
    ['slash-prefixed fragment before a raw question mark', `${PAGE}#/${key}=${CANARY}?trailing`],
    ['fragment value split by a raw question mark', `${PAGE}#${key}=x?${CANARY}`],
    ['slash-prefixed value split by a raw question mark', `${PAGE}#/${key}=x?${CANARY}`],
    ['hashbang route carrying a response', `${PAGE}#!/dashboard&${key}=${CANARY}`],
    [
      'slash-prefixed MSAL response',
      `${PAGE}#/${key}=${CANARY}&${OAUTH_STATE_KEY}=${CANARY}2&client_info=${CANARY}3`
    ]
  ] as const;

  it.each(forms)('is detected as a callback in %s form', (_form, href) => {
    expect(detect(href)).toBe(true);
  });

  it.each(forms)('is removed from the sanitized URL in %s form', (_form, href) => {
    const sanitized = sanitize(href);

    expect(sanitized).not.toContain(key);
    expect(sanitized).not.toContain(CANARY);
    expect(sanitized.startsWith(PAGE)).toBe(true);
  });

  it.each(forms)('produces a sanitized URL that is no longer callback-shaped (%s)', (_form, href) => {
    expect(detect(sanitize(href))).toBe(false);
  });

  it('removes a paired state parameter from the same part', () => {
    const sanitized = sanitize(`${PAGE}?${key}=${CANARY}&${OAUTH_STATE_KEY}=${CANARY}-state&keep=1`);

    expect(sanitized).toBe(`${PAGE}?keep=1`);
  });

  it('removes a state parameter paired across query and fragment', () => {
    const sanitized = sanitize(`${PAGE}?${OAUTH_STATE_KEY}=${CANARY}-state#${key}=${CANARY}`);

    expect(sanitized).toBe(PAGE);
  });

  it('removes fragment state when the response key is in the query', () => {
    expect(sanitize(`${PAGE}?${key}=${CANARY}#${OAUTH_STATE_KEY}=${CANARY}-state`)).toBe(PAGE);
  });

  it('removes route-query state after its paired response key is removed', () => {
    expect(
      sanitize(`${PAGE}?${key}=${CANARY}#/dashboard?${OAUTH_STATE_KEY}=${CANARY}-state`)
    ).toBe(`${PAGE}#/dashboard`);
  });
});

describe('slash-prefixed fragment responses', () => {
  it('detects an MSAL response that survives a single leading slash', () => {
    expect(detect(`${PAGE}#/code=${CANARY}&state=${CANARY}2&session_state=${CANARY}3`)).toBe(true);
  });

  it('removes every value from a slash-prefixed MSAL response', () => {
    const sanitized = sanitize(
      `${PAGE}#/code=${CANARY}&client_info=${CANARY}2&state=${CANARY}3&session_state=${CANARY}4`
    );

    expect(sanitized).toBe(PAGE);
    expect(sanitized).not.toContain(CANARY);
    expect(detect(sanitized)).toBe(false);
  });

  it('detects empty and duplicated slash-prefixed responses', () => {
    expect(detect(`${PAGE}#/code=`)).toBe(true);
    expect(detect(`${PAGE}#/code=&code=`)).toBe(true);
    expect(detect(`${PAGE}#/error=&error_description=`)).toBe(true);
    expect(sanitize(`${PAGE}#/code=&code=${CANARY}`)).toBe(PAGE);
  });

  it('detects a percent-encoded response key after the leading slash', () => {
    expect(detect(`${PAGE}#/%63ode=${CANARY}`)).toBe(true);
    expect(sanitize(`${PAGE}#/%63ode=${CANARY}`)).toBe(PAGE);
  });

  it('keeps unrelated slash-prefixed parameters and the leading slash', () => {
    expect(sanitize(`${PAGE}#/code=${CANARY}&view=grid`)).toBe(`${PAGE}#/view=grid`);
  });

  it('preserves a true hash route with the same shape as a response', () => {
    for (const route of [
      `${PAGE}#/dashboard`,
      `${PAGE}#/analytics/abc123`,
      `${PAGE}#/dashboard?tab=1`,
      `${PAGE}#/code`,
      `${PAGE}#/scope/settings`,
      `${PAGE}#/error`
    ]) {
      expect(detect(route)).toBe(false);
      expect(sanitize(route)).toBe(route);
    }
  });

  it('sanitizes a response carried by a true hash route query', () => {
    expect(detect(`${PAGE}#/dashboard?code=${CANARY}&state=${CANARY}2`)).toBe(true);
    expect(sanitize(`${PAGE}#/dashboard?code=${CANARY}&state=${CANARY}2`)).toBe(
      `${PAGE}#/dashboard`
    );
  });

  it('treats a route parameter that is not a response key as a route', () => {
    const href = `${PAGE}#/dashboard=1&tab=2`;

    expect(detect(href)).toBe(false);
    expect(sanitize(href)).toBe(href);
  });

  it('matches MSAL on a slash-prefixed payload whose response key has no value', () => {
    const href = `${PAGE}#/code&${OAUTH_STATE_KEY}=${CANARY}`;

    expect(detect(href)).toBe(true);
    expect(sanitize(href)).toBe(PAGE);
  });

  it('detects a response that carries a raw question mark after the keys', () => {
    const href = `${PAGE}#/code=${CANARY}&${OAUTH_STATE_KEY}=${CANARY}2&extra=?route`;

    expect(detect(href)).toBe(true);
    expect(sanitize(href)).not.toContain(CANARY);
    expect(detect(sanitize(href))).toBe(false);
  });

  it('only strips the single leading slash that MSAL strips', () => {
    const href = `${PAGE}#//code=${CANARY}`;

    expect(detect(href)).toBe(false);
    expect(sanitize(href)).toBe(href);
  });

  it('leaves a hashbang route untouched', () => {
    const href = `${PAGE}#!/code=${CANARY}`;

    expect(detect(href)).toBe(false);
    expect(sanitize(href)).toBe(href);
  });

  it('never leaves a sanitized slash-prefixed response callback-shaped', () => {
    const dirty = `${PAGE}?page=1#/id_token=${CANARY}&state=${CANARY}2`;

    expect(detect(sanitize(dirty))).toBe(false);
    expect(sanitize(dirty)).toBe(`${PAGE}?page=1`);
  });
});

describe('fragments MSAL parses as a flat parameter list', () => {
  it('detects a response whose value contains a raw question mark', () => {
    const href = `${PAGE}#code=${CANARY}?trailing`;

    expect(detect(href)).toBe(true);
    expect(sanitize(href)).not.toContain(CANARY);
    expect(detect(sanitize(href))).toBe(false);
  });

  it('detects response keys that follow a route-shaped first segment', () => {
    const href = `${PAGE}#!/dashboard&code=${CANARY}&${OAUTH_STATE_KEY}=${CANARY}2&${OAUTH_STATE_KEY}=`;

    expect(detect(href)).toBe(true);
    expect(sanitize(href)).toBe(`${PAGE}#!/dashboard`);
    expect(sanitize(href)).not.toContain(CANARY);
  });

  it('detects response keys appended to a slash-prefixed route segment', () => {
    const href = `${PAGE}#/dashboard&id_token=${CANARY}&${OAUTH_STATE_KEY}=${CANARY}2`;

    expect(detect(href)).toBe(true);
    expect(sanitize(href)).toBe(`${PAGE}#/dashboard`);
  });

  it('removes every response segment around raw question marks', () => {
    const href = `${PAGE}#/code=${CANARY}&${OAUTH_STATE_KEY}=${CANARY}2&extra=?route`;
    const sanitized = sanitize(href);

    expect(sanitized).not.toContain(CANARY);
    expect(sanitized).not.toContain('code');
    expect(sanitized.startsWith(PAGE)).toBe(true);
    expect(detect(sanitized)).toBe(false);
  });

  it('removes a whole response value that contains a raw question mark', () => {
    for (const href of [
      `${PAGE}#code=x?${CANARY}`,
      `${PAGE}#/code=x?${CANARY}`,
      `${PAGE}#id_token=x?evil=${CANARY}&y=2`,
      `${PAGE}?code=x?${CANARY}`
    ]) {
      const sanitized = sanitize(href);

      expect(detect(href)).toBe(true);
      expect(sanitized).not.toContain(CANARY);
      expect(detect(sanitized)).toBe(false);
    }
  });

  it('sanitizes a response that a removed value would otherwise have hidden', () => {
    const href = `${PAGE}#x=?id_token=${CANARY}`;
    const sanitized = sanitize(href);

    expect(detect(href)).toBe(true);
    expect(sanitized).not.toContain(CANARY);
    expect(detect(sanitized)).toBe(false);
  });

  it('removes a paired state that sits in the other fragment view', () => {
    expect(sanitize(`${PAGE}#/?${OAUTH_STATE_KEY}=${CANARY}&code=${CANARY}2`)).toBe(PAGE);
    expect(sanitize(`${PAGE}#?${OAUTH_STATE_KEY}=${CANARY}&code=${CANARY}2`)).toBe(PAGE);
    expect(
      sanitize(`${PAGE}#/dashboard?${OAUTH_STATE_KEY}=${CANARY}&code=${CANARY}2&view=grid`)
    ).toBe(`${PAGE}#/dashboard?view=grid`);
    expect(sanitize(`${PAGE}#/code=${CANARY}?${OAUTH_STATE_KEY}=${CANARY}2`)).toBe(PAGE);
  });

  it('sanitizes a response that a removed parameter would otherwise have hidden', () => {
    for (const href of [
      `${PAGE}#code&/code=${CANARY}`,
      `${PAGE}#x=?id_token=${CANARY}`,
      `${PAGE}#/?code=${CANARY}&${OAUTH_STATE_KEY}=${CANARY}2`
    ]) {
      const sanitized = sanitize(href);

      expect(detect(href)).toBe(true);
      expect(sanitized).not.toContain(CANARY);
      expect(detect(sanitized)).toBe(false);
      expect(sanitize(sanitized)).toBe(sanitized);
    }
  });

  it('keeps the route query separator when only some parameters are removed', () => {
    expect(sanitize(`${PAGE}#/dashboard?code=${CANARY}&view=grid`)).toBe(
      `${PAGE}#/dashboard?view=grid`
    );
    expect(sanitize(`${PAGE}#/dashboard?tab=1&code=${CANARY}`)).toBe(`${PAGE}#/dashboard?tab=1`);
  });

  it('keeps a hashbang route that carries no response key', () => {
    for (const href of [`${PAGE}#!/dashboard`, `${PAGE}#!/code=${CANARY}`, `${PAGE}#!/tab?x=1`]) {
      expect(detect(href)).toBe(false);
      expect(sanitize(href)).toBe(href);
    }
  });

  it('keeps a hash route whose query is not a response', () => {
    for (const href of [`${PAGE}#/dashboard?tab=1`, `${PAGE}#/dashboard?a=1&b=2`]) {
      expect(detect(href)).toBe(false);
      expect(sanitize(href)).toBe(href);
    }
  });
});

describe('callback presence detection', () => {
  it('treats a plain application URL as clean', () => {
    expect(detect(`${PAGE}?page=2&sort=desc#/section?tab=1`)).toBe(false);
  });

  it('treats state alone as a clean application URL', () => {
    expect(detect(`${PAGE}?${OAUTH_STATE_KEY}=stored-view-state`)).toBe(false);
    expect(detect(`${PAGE}#${OAUTH_STATE_KEY}=stored-view-state`)).toBe(false);
  });

  it('does not match keys that only look like response keys', () => {
    expect(detect(`${PAGE}?zipcode=100&scoped=1&my_error=1&code_of_conduct=2`)).toBe(false);
  });

  it('does not match a differently cased key', () => {
    expect(detect(`${PAGE}?Code=${CANARY}`)).toBe(false);
  });

  it('does not match a response key that only appears in the path or hash route', () => {
    expect(detect(`${ORIGIN}/code/access_token#/error_description`)).toBe(false);
  });

  it('detects a response key that appears after unrelated parameters', () => {
    expect(detect(`${PAGE}?page=2&code=${CANARY}`)).toBe(true);
  });

  it('detects a URL-encoded response key name', () => {
    expect(detect(`${PAGE}?%63ode=${CANARY}`)).toBe(true);
  });

  it('tolerates a malformed percent escape without throwing', () => {
    expect(() => detect(`${PAGE}?%ZZ=1&code=${CANARY}`)).not.toThrow();
    expect(detect(`${PAGE}?%ZZ=1&code=${CANARY}`)).toBe(true);
  });
});

describe('sanitized URL construction', () => {
  it('returns the original URL unchanged when nothing is sensitive', () => {
    const href = `${PAGE}?page=2&sort=desc#/section?tab=1`;

    expect(sanitize(href)).toBe(href);
  });

  it('keeps state alone untouched', () => {
    const href = `${PAGE}?${OAUTH_STATE_KEY}=stored-view-state`;

    expect(sanitize(href)).toBe(href);
  });

  it('preserves unrelated path, query, and fragment parts around removed keys', () => {
    const sanitized = sanitize(
      `${ORIGIN}/analytics/abc123?page=2&code=${CANARY}&sort=desc#/section?tab=1&client_info=${CANARY}`
    );

    expect(sanitized).toBe(`${ORIGIN}/analytics/abc123?page=2&sort=desc#/section?tab=1`);
  });

  it('preserves the encoding of unrelated parameter values', () => {
    const sanitized = sanitize(`${PAGE}?redirect=%2Fstats%3Fa%3D1&code=${CANARY}`);

    expect(sanitized).toBe(`${PAGE}?redirect=%2Fstats%3Fa%3D1`);
  });

  it('drops an emptied query string and keeps the hash route path', () => {
    expect(sanitize(`${PAGE}?code=${CANARY}#/section`)).toBe(`${PAGE}#/section`);
  });

  it('drops an emptied bare fragment entirely', () => {
    expect(sanitize(`${PAGE}#code=${CANARY}&${OAUTH_STATE_KEY}=x`)).toBe(PAGE);
  });

  it('keeps unrelated bare fragment parameters without inventing a separator', () => {
    expect(sanitize(`${PAGE}#code=${CANARY}&view=grid`)).toBe(`${PAGE}#view=grid`);
  });

  it('removes every duplicate occurrence of a response key', () => {
    expect(sanitize(`${PAGE}?code=${CANARY}&keep=1&code=${CANARY}2&code=`)).toBe(`${PAGE}?keep=1`);
  });

  it('removes a full MSAL fragment response and leaves no value behind', () => {
    const sanitized = sanitize(
      `${PAGE}#code=${CANARY}&client_info=${CANARY}2&state=${CANARY}3&session_state=${CANARY}4`
    );

    expect(sanitized).toBe(PAGE);
    expect(sanitized).not.toContain('CANARY');
  });

  it('never leaves a sanitized URL that is still callback-shaped', () => {
    const dirty = `${ORIGIN}/analytics/x?code=${CANARY}&state=${CANARY}2&page=1#/s?id_token=${CANARY}3&state=${CANARY}4`;

    expect(detect(sanitize(dirty))).toBe(false);
    expect(sanitize(sanitize(dirty))).toBe(sanitize(dirty));
  });
});
