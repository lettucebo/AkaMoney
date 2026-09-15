import { describe, expect, it } from 'vitest';
import type { UrlResponse } from '@/types';
import { getLinkStatus } from '../dashboardUrlList';

const buildUrl = (overrides: Partial<UrlResponse> = {}): UrlResponse => ({
  id: 'id',
  short_code: 'code',
  original_url: 'https://example.com',
  short_url: 'code',
  created_at: 0,
  updated_at: 0,
  is_active: true,
  click_count: 0,
  ...overrides
});

describe('getLinkStatus', () => {
  it('reports an archived link as off, even when it has a future expiry', () => {
    expect(getLinkStatus(buildUrl({ is_active: false, expires_at: Date.now() + 100000 }))).toBe('off');
  });

  it('reports an archived and expired link as off, never expired', () => {
    expect(getLinkStatus(buildUrl({ is_active: false, expires_at: Date.now() - 1000 }))).toBe('off');
  });

  it('reports an unarchived link past its expiry as expired', () => {
    expect(getLinkStatus(buildUrl({ is_active: true, expires_at: Date.now() - 1000 }), Date.now())).toBe('exp');
  });

  it('reports a link with no expiry as on', () => {
    expect(getLinkStatus(buildUrl({ is_active: true, expires_at: undefined }))).toBe('on');
  });

  it('reports a link with a future expiry as on', () => {
    expect(getLinkStatus(buildUrl({ is_active: true, expires_at: Date.now() + 100000 }))).toBe('on');
  });

  it('treats a zero expiry as "never expires", matching the redirect worker', () => {
    // src/redirect/src/index.ts tests `url.expires_at && url.expires_at < now`,
    // so a stored 0 still redirects and must not render as expired.
    expect(getLinkStatus(buildUrl({ is_active: true, expires_at: 0 }), Date.now())).toBe('on');
  });

  it('keeps a link expiring exactly now in the on bucket', () => {
    const now = 1_000_000;
    expect(getLinkStatus(buildUrl({ is_active: true, expires_at: now }), now)).toBe('on');
  });

  it('reports a link that expired one millisecond ago as expired', () => {
    const now = 1_000_000;
    expect(getLinkStatus(buildUrl({ is_active: true, expires_at: now - 1 }), now)).toBe('exp');
  });
});
