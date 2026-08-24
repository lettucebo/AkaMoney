import { describe, it, expect } from 'vitest';
import { getValidatedRedirect } from '../redirect';

describe('getValidatedRedirect', () => {
  it('returns the default dashboard for invalid or unsafe redirect values', () => {
    expect(getValidatedRedirect(undefined)).toBe('/dashboard');
    expect(getValidatedRedirect(null)).toBe('/dashboard');
    expect(getValidatedRedirect(123)).toBe('/dashboard');
    expect(getValidatedRedirect('')).toBe('/dashboard');
    expect(getValidatedRedirect('/dashboard')).toBe('/dashboard');
    expect(getValidatedRedirect('//evil.com')).toBe('/dashboard');
    expect(getValidatedRedirect('https://evil.com')).toBe('/dashboard');
    expect(getValidatedRedirect('javascript:alert(1)')).toBe('/dashboard');
    expect(getValidatedRedirect('dashboard')).toBe('/dashboard');
    expect(getValidatedRedirect('/login')).toBe('/dashboard');
    expect(getValidatedRedirect('/login?next=/dashboard')).toBe('/dashboard');
    expect(getValidatedRedirect('/login#fragment')).toBe('/dashboard');
    expect(getValidatedRedirect(['redirect'])).toBe('/dashboard');
  });

  it('preserves valid internal redirects that are not the login route', () => {
    expect(getValidatedRedirect('/stats')).toBe('/stats');
    expect(getValidatedRedirect('/stats?sort=desc')).toBe('/stats?sort=desc');
    expect(getValidatedRedirect('/stats#summary')).toBe('/stats#summary');
    expect(getValidatedRedirect('/login-help')).toBe('/login-help');
  });

  it('rejects protocol-relative lookalikes created by backslashes or stripped control characters', () => {
    expect(getValidatedRedirect('/\\evil.com')).toBe('/dashboard');
    expect(getValidatedRedirect('/\t\n\r/evil.com')).toBe('/dashboard');
  });

  it('preserves internal routes whose query or hash contains literal URL separators', () => {
    expect(getValidatedRedirect('/dashboard?returnUrl=http://example.com')).toBe('/dashboard?returnUrl=http://example.com');
    expect(getValidatedRedirect('/report#src=http://example.com')).toBe('/report#src=http://example.com');
  });
});
