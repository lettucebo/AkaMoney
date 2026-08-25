import { describe, it, expect } from 'vitest';
import type { UrlResponse } from '@/types';
import { deriveVisibleUrls, getLinkStatus, statusCounts } from '../dashboardUrlList';

const buildUrl = (overrides: Partial<UrlResponse> = {}): UrlResponse => ({
  id: 'url-1',
  short_code: 'demo1',
  original_url: 'https://example.com/very-long-url',
  short_url: 'https://aka.money/demo1',
  created_at: 1700000000000,
  updated_at: 1700000000000,
  is_active: true,
  click_count: 0,
  ...overrides
});

describe('getLinkStatus', () => {
  it('reports "off" for an archived link regardless of expiry', () => {
    expect(getLinkStatus(buildUrl({ is_active: false, expires_at: Date.now() + 100000 }))).toBe('off');
  });

  it('reports "exp" for an active link whose expiry has passed', () => {
    expect(getLinkStatus(buildUrl({ is_active: true, expires_at: Date.now() - 1000 }), Date.now())).toBe('exp');
  });

  it('reports "on" for an active link with no expiry', () => {
    expect(getLinkStatus(buildUrl({ is_active: true, expires_at: undefined }))).toBe('on');
  });

  it('reports "on" for an active link whose expiry is in the future', () => {
    expect(getLinkStatus(buildUrl({ is_active: true, expires_at: Date.now() + 100000 }))).toBe('on');
  });
});

describe('statusCounts', () => {
  it('counts all/active/archived among the given (current-page) urls only', () => {
    const urls = [
      buildUrl({ id: 'a', is_active: true }),
      buildUrl({ id: 'b', is_active: false }),
      buildUrl({ id: 'c', is_active: true })
    ];

    expect(statusCounts(urls)).toEqual({ all: 3, active: 2, archived: 1, expired: 0 });
  });

  it('returns zeros for an empty page', () => {
    expect(statusCounts([])).toEqual({ all: 0, active: 0, archived: 0, expired: 0 });
  });

  it('never counts an expired-but-unarchived link as active', () => {
    const now = Date.parse('2024-03-15T00:00:00Z');
    const urls = [
      buildUrl({ id: 'a', is_active: true }),
      buildUrl({ id: 'b', is_active: false }),
      buildUrl({ id: 'c', is_active: true, expires_at: now - 1000 })
    ];

    expect(statusCounts(urls, now)).toEqual({ all: 3, active: 1, archived: 1, expired: 1 });
  });

  it('keeps expired links inside the all total', () => {
    const now = Date.parse('2024-03-15T00:00:00Z');
    const counts = statusCounts([buildUrl({ id: 'c', is_active: true, expires_at: now - 1000 })], now);

    expect(counts.all).toBe(1);
    expect(counts.active).toBe(0);
    expect(counts.archived).toBe(0);
  });
});

describe('deriveVisibleUrls', () => {
  const urls = [
    buildUrl({ id: 'a', short_code: 'alpha', original_url: 'https://a.example.com', title: 'Alpha Title', is_active: true, click_count: 5 }),
    buildUrl({ id: 'b', short_code: 'beta', original_url: 'https://b.example.com', title: 'Beta Title', is_active: false, click_count: 20 }),
    buildUrl({ id: 'c', short_code: 'gamma', original_url: 'https://gamma.example.com', is_active: true, click_count: 1 })
  ];

  it('returns every current-page url untouched with default filters', () => {
    const result = deriveVisibleUrls(urls, { status: 'all', search: '', sort: 'default' });

    expect(result.visible.map((u) => u.id)).toEqual(['a', 'b', 'c']);
    expect(result.matchingCount).toBe(3);
  });

  it('filters by status among the current page only', () => {
    const active = deriveVisibleUrls(urls, { status: 'active', search: '', sort: 'default' });
    expect(active.visible.map((u) => u.id)).toEqual(['a', 'c']);

    const archived = deriveVisibleUrls(urls, { status: 'archived', search: '', sort: 'default' });
    expect(archived.visible.map((u) => u.id)).toEqual(['b']);
  });

  it('matches search against short code, original url, and title (case-insensitive)', () => {
    expect(deriveVisibleUrls(urls, { status: 'all', search: 'ALPHA', sort: 'default' }).visible.map((u) => u.id)).toEqual(['a']);
    expect(deriveVisibleUrls(urls, { status: 'all', search: 'b.example', sort: 'default' }).visible.map((u) => u.id)).toEqual(['b']);
    expect(deriveVisibleUrls(urls, { status: 'all', search: 'beta title', sort: 'default' }).visible.map((u) => u.id)).toEqual(['b']);
  });

  it('tolerates urls with no title when searching', () => {
    expect(() => deriveVisibleUrls(urls, { status: 'all', search: 'gamma', sort: 'default' })).not.toThrow();
  });

  it('returns an empty visible list with a zero matchingCount when nothing matches', () => {
    const result = deriveVisibleUrls(urls, { status: 'all', search: 'no-such-thing', sort: 'default' });
    expect(result.visible).toEqual([]);
    expect(result.matchingCount).toBe(0);
  });

  it('sorts by click count descending or ascending without mutating the input', () => {
    const desc = deriveVisibleUrls(urls, { status: 'all', search: '', sort: 'clicks-desc' });
    expect(desc.visible.map((u) => u.id)).toEqual(['b', 'a', 'c']);

    const asc = deriveVisibleUrls(urls, { status: 'all', search: '', sort: 'clicks-asc' });
    expect(asc.visible.map((u) => u.id)).toEqual(['c', 'a', 'b']);

    expect(urls.map((u) => u.id)).toEqual(['a', 'b', 'c']);
  });

  it('applies status and search filters before sorting', () => {
    const result = deriveVisibleUrls(urls, { status: 'active', search: '', sort: 'clicks-desc' });
    expect(result.visible.map((u) => u.id)).toEqual(['a', 'c']);
  });

  it('always reports whole-page counts regardless of active filters', () => {
    const result = deriveVisibleUrls(urls, { status: 'archived', search: 'nope', sort: 'default' });
    expect(result.counts).toEqual({ all: 3, active: 2, archived: 1, expired: 0 });
  });

  describe('expired links', () => {
    const now = Date.parse('2024-03-15T00:00:00Z');
    const withExpired = [
      buildUrl({ id: 'a', short_code: 'alpha', is_active: true }),
      buildUrl({ id: 'b', short_code: 'beta', is_active: false }),
      buildUrl({ id: 'x', short_code: 'expired', is_active: true, expires_at: now - 1000 })
    ];

    it('excludes an expired link from the active filter', () => {
      const active = deriveVisibleUrls(withExpired, { status: 'active', search: '', sort: 'default' }, now);
      expect(active.visible.map((u) => u.id)).toEqual(['a']);
    });

    it('excludes an expired link from the archived filter', () => {
      const archived = deriveVisibleUrls(withExpired, { status: 'archived', search: '', sort: 'default' }, now);
      expect(archived.visible.map((u) => u.id)).toEqual(['b']);
    });

    it('still includes an expired link under the all filter', () => {
      const all = deriveVisibleUrls(withExpired, { status: 'all', search: '', sort: 'default' }, now);
      expect(all.visible.map((u) => u.id)).toEqual(['a', 'b', 'x']);
    });

    it('reports the expired link in counts.expired, not counts.active', () => {
      const result = deriveVisibleUrls(withExpired, { status: 'all', search: '', sort: 'default' }, now);
      expect(result.counts).toEqual({ all: 3, active: 1, archived: 1, expired: 1 });
    });
  });
});
