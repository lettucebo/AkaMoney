import { describe, expect, it } from 'vitest';
import type { UrlListQueryState, UrlResponse } from '@/types';
import { DEFAULT_URL_LIST_QUERY } from '@/utils/urlListQuery';
import { asciiLower, countMockUrlStatuses, queryMockUrls } from '../mockUrlList';

const NOW = 1_000_000;

const buildUrl = (overrides: Partial<UrlResponse> = {}): UrlResponse => ({
  id: 'id-1',
  short_code: 'code1',
  original_url: 'https://example.com/one',
  short_url: 'code1',
  created_at: 100,
  updated_at: 100,
  is_active: true,
  click_count: 0,
  ...overrides
});

const query = (overrides: Partial<UrlListQueryState> = {}): UrlListQueryState => ({
  ...DEFAULT_URL_LIST_QUERY,
  ...overrides
});

const ids = (urls: UrlResponse[]): string[] => urls.map((url) => url.id);

describe('asciiLower', () => {
  it('folds ASCII letters', () => {
    expect(asciiLower('AbC')).toBe('abc');
  });

  it('leaves non-ASCII untouched, matching SQLite LOWER()', () => {
    // toLowerCase() would turn these into 'i̇' and 'σ'; D1 does not.
    expect(asciiLower('İΣ')).toBe('İΣ');
  });

  it('leaves CJK text untouched', () => {
    expect(asciiLower('報告')).toBe('報告');
  });
});

describe('queryMockUrls - search', () => {
  const urls = [
    buildUrl({ id: 'a', short_code: 'Alpha', original_url: 'https://a.example.com', title: 'Alpha Title' }),
    buildUrl({ id: 'b', short_code: 'beta', original_url: 'https://b.example.com', title: undefined }),
    buildUrl({ id: 'c', short_code: 'gamma', original_url: 'https://c.example.com', title: '季報告' })
  ];

  it('returns everything for an empty term', () => {
    expect(queryMockUrls(urls, query(), 20, NOW).data).toHaveLength(3);
  });

  it('matches the short code case-insensitively', () => {
    expect(ids(queryMockUrls(urls, query({ search: 'ALPHA' }), 20, NOW).data)).toEqual(['a']);
  });

  it('matches the original url', () => {
    expect(ids(queryMockUrls(urls, query({ search: 'b.example' }), 20, NOW).data)).toEqual(['b']);
  });

  it('matches the title', () => {
    expect(ids(queryMockUrls(urls, query({ search: 'alpha title' }), 20, NOW).data)).toEqual(['a']);
  });

  it('matches CJK titles', () => {
    expect(ids(queryMockUrls(urls, query({ search: '報告' }), 20, NOW).data)).toEqual(['c']);
  });

  it('does not search the description, matching the Admin API', () => {
    const withDescription = [buildUrl({ id: 'd', description: 'secret keyword' })];
    expect(queryMockUrls(withDescription, query({ search: 'keyword' }), 20, NOW).data).toHaveLength(0);
  });

  it('tolerates a missing title', () => {
    expect(() => queryMockUrls(urls, query({ search: 'beta' }), 20, NOW)).not.toThrow();
  });

  it('treats LIKE wildcards as literal characters', () => {
    const withWildcards = [
      buildUrl({ id: 'p', short_code: 'save50%' }),
      buildUrl({ id: 'q', short_code: 'plain' }),
      buildUrl({ id: 'r', short_code: 'a_b' })
    ];

    expect(ids(queryMockUrls(withWildcards, query({ search: '%' }), 20, NOW).data)).toEqual(['p']);
    expect(ids(queryMockUrls(withWildcards, query({ search: '_' }), 20, NOW).data)).toEqual(['r']);
    expect(queryMockUrls(withWildcards, query({ search: '\\' }), 20, NOW).data).toHaveLength(0);
  });

  it('returns an empty result rather than throwing for no matches', () => {
    const result = queryMockUrls(urls, query({ search: 'no-such-thing' }), 20, NOW);
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.total_pages).toBe(0);
    expect(result.counts).toEqual({ all: 0, active: 0, expired: 0, archived: 0 });
  });
});

describe('queryMockUrls - status', () => {
  const urls = [
    buildUrl({ id: 'on', is_active: true }),
    buildUrl({ id: 'off', is_active: false }),
    buildUrl({ id: 'exp', is_active: true, expires_at: NOW - 1 }),
    buildUrl({ id: 'zero', is_active: true, expires_at: 0 }),
    buildUrl({ id: 'boundary', is_active: true, expires_at: NOW }),
    buildUrl({ id: 'offexp', is_active: false, expires_at: NOW - 1 })
  ];

  it('treats a zero expiry and an exact-now expiry as active', () => {
    expect(ids(queryMockUrls(urls, query({ status: 'active' }), 20, NOW).data).sort()).toEqual([
      'boundary',
      'on',
      'zero'
    ]);
  });

  it('only lists unarchived, genuinely past-expiry links as expired', () => {
    expect(ids(queryMockUrls(urls, query({ status: 'expired' }), 20, NOW).data)).toEqual(['exp']);
  });

  it('lists every archived link regardless of expiry', () => {
    expect(ids(queryMockUrls(urls, query({ status: 'archived' }), 20, NOW).data).sort()).toEqual([
      'off',
      'offexp'
    ]);
  });

  it('partitions the account exactly once across the three buckets', () => {
    const counts = queryMockUrls(urls, query(), 20, NOW).counts;
    expect(counts.all).toBe(urls.length);
    expect(counts.active + counts.expired + counts.archived).toBe(counts.all);
  });

  it('reports counts for the whole search, ignoring the active status filter', () => {
    const archivedOnly = queryMockUrls(urls, query({ status: 'archived' }), 20, NOW);
    expect(archivedOnly.data).toHaveLength(2);
    expect(archivedOnly.counts.all).toBe(urls.length);
    expect(archivedOnly.counts.active).toBe(3);
  });

  it('narrows counts to the current search term', () => {
    const searchable = [
      buildUrl({ id: 'x', short_code: 'report-a', is_active: true }),
      buildUrl({ id: 'y', short_code: 'report-b', is_active: false }),
      buildUrl({ id: 'z', short_code: 'other', is_active: true })
    ];
    expect(queryMockUrls(searchable, query({ search: 'report' }), 20, NOW).counts).toEqual({
      all: 2,
      active: 1,
      expired: 0,
      archived: 1
    });
  });
});

describe('queryMockUrls - sorting', () => {
  const urls = [
    buildUrl({ id: 'a', created_at: 300, updated_at: 100, click_count: 5 }),
    buildUrl({ id: 'b', created_at: 200, updated_at: 300, click_count: 50 }),
    buildUrl({ id: 'c', created_at: 100, updated_at: 200, click_count: 1 })
  ];

  it('defaults to newest first', () => {
    expect(ids(queryMockUrls(urls, query(), 20, NOW).data)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by oldest created first', () => {
    expect(ids(queryMockUrls(urls, query({ sort: 'created-asc' }), 20, NOW).data)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by most recently updated', () => {
    expect(ids(queryMockUrls(urls, query({ sort: 'updated-desc' }), 20, NOW).data)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by clicks descending and ascending', () => {
    expect(ids(queryMockUrls(urls, query({ sort: 'clicks-desc' }), 20, NOW).data)).toEqual(['b', 'a', 'c']);
    expect(ids(queryMockUrls(urls, query({ sort: 'clicks-asc' }), 20, NOW).data)).toEqual(['c', 'a', 'b']);
  });

  it('breaks click-count ties deterministically so paging cannot duplicate rows', () => {
    const tied = [
      buildUrl({ id: 'id-1', created_at: 100, click_count: 7 }),
      buildUrl({ id: 'id-2', created_at: 100, click_count: 7 }),
      buildUrl({ id: 'id-3', created_at: 100, click_count: 7 })
    ];

    const firstPage = queryMockUrls(tied, query({ sort: 'clicks-desc' }), 2, NOW).data;
    const secondPage = queryMockUrls(tied, query({ sort: 'clicks-desc', page: 2 }), 2, NOW).data;

    expect(ids(firstPage)).toEqual(['id-3', 'id-2']);
    expect(ids(secondPage)).toEqual(['id-1']);
    expect(new Set([...ids(firstPage), ...ids(secondPage)]).size).toBe(3);
  });

  it('does not mutate the source collection', () => {
    const source = [...urls];
    queryMockUrls(source, query({ sort: 'clicks-desc' }), 20, NOW);
    expect(ids(source)).toEqual(['a', 'b', 'c']);
  });
});

describe('queryMockUrls - pagination', () => {
  const urls = Array.from({ length: 25 }, (_, index) =>
    buildUrl({ id: `id-${String(index).padStart(2, '0')}`, created_at: 1000 - index })
  );

  it('slices the requested page', () => {
    const result = queryMockUrls(urls, query({ page: 2 }), 10, NOW);
    expect(result.data).toHaveLength(10);
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 25, total_pages: 3 });
  });

  it('clamps a page past the end and reports the effective page', () => {
    const result = queryMockUrls(urls, query({ page: 999 }), 10, NOW);
    expect(result.pagination.page).toBe(3);
    expect(result.data).toHaveLength(5);
  });

  it('reports page 1 and zero pages for an empty result set', () => {
    const result = queryMockUrls([], query({ page: 4 }), 10, NOW);
    expect(result.pagination).toEqual({ page: 1, limit: 10, total: 0, total_pages: 0 });
  });

  it('paginates the filtered set, not the whole account', () => {
    const mixed = [
      ...urls.slice(0, 5).map((url) => ({ ...url, is_active: false })),
      ...urls.slice(5)
    ];
    const result = queryMockUrls(mixed, query({ status: 'archived' }), 10, NOW);
    expect(result.pagination.total).toBe(5);
    expect(result.counts.all).toBe(25);
  });
});

describe('countMockUrlStatuses', () => {
  it('counts an empty collection as zeroes', () => {
    expect(countMockUrlStatuses([], NOW)).toEqual({ all: 0, active: 0, expired: 0, archived: 0 });
  });

  it('counts each bucket', () => {
    const urls = [
      buildUrl({ id: '1', is_active: true }),
      buildUrl({ id: '2', is_active: false }),
      buildUrl({ id: '3', is_active: true, expires_at: NOW - 1 })
    ];
    expect(countMockUrlStatuses(urls, NOW)).toEqual({ all: 3, active: 1, expired: 1, archived: 1 });
  });
});
