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
});
