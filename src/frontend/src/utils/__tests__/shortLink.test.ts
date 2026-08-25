import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHORT_LINK_DISPLAY_HOST, shortLinkHost, shortLinkTarget } from '../shortLink';

describe('shortLink', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('always displays the production brand host regardless of configuration', () => {
    vi.stubEnv('VITE_SHORT_DOMAIN', 'http://localhost:8788');
    expect(SHORT_LINK_DISPLAY_HOST).toBe('aka.money');
  });

  it('defaults the functional host to production when nothing is configured', () => {
    vi.stubEnv('VITE_SHORT_DOMAIN', '');
    expect(shortLinkHost()).toBe('aka.money');
    expect(shortLinkTarget('demo1')).toBe('https://aka.money/demo1');
  });

  it('respects a configured local short host for the functional target', () => {
    vi.stubEnv('VITE_SHORT_DOMAIN', 'http://localhost:8788');
    expect(shortLinkHost()).toBe('localhost:8788');
    expect(shortLinkTarget('demo1')).toBe('http://localhost:8788/demo1');
  });

  it('respects a configured custom production host', () => {
    vi.stubEnv('VITE_SHORT_DOMAIN', 'https://go.example.com/');
    expect(shortLinkTarget('demo1')).toBe('https://go.example.com/demo1');
  });

  it('builds the target from the short code, never from an untrusted short_url', () => {
    vi.stubEnv('VITE_SHORT_DOMAIN', '');
    expect(shortLinkTarget('abc-123')).toBe('https://aka.money/abc-123');
  });
});
