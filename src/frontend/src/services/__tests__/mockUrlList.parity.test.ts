import { describe, expect, it } from 'vitest';
import type { UrlListQueryState, UrlResponse } from '@/types';
import { queryMockUrls } from '../mockUrlList';

/**
 * Locks the `VITE_SKIP_AUTH` mock API to the behaviour of the real D1 query.
 *
 * Every expectation below was produced by executing the SQL that
 * `src/backend/src/services/urlListQuery.ts` builds against a real SQLite
 * database seeded with this exact dataset. If the mock and the Admin API ever
 * drift, UI development and screenshots would show behaviour that does not
 * exist in production - this test is what makes that drift fail loudly.
 */
const NOW = 1_000_000;

// Mirrors the backend rows, mapped through `formatUrlResponse` semantics
// (`expires_at || undefined`, `is_active === 1`).
const URLS: UrlResponse[] = [
  { id: 'a', short_code: 'Alpha', original_url: 'https://a.example.com', title: 'Alpha 報告', created_at: 100, updated_at: 100, expires_at: undefined, is_active: true, click_count: 5, short_url: 'Alpha' },
  { id: 'b', short_code: 'beta', original_url: 'https://b.example.com', title: undefined, created_at: 200, updated_at: 300, expires_at: undefined, is_active: true, click_count: 50, short_url: 'beta' },
  { id: 'c', short_code: 'gamma', original_url: 'https://c.example.com', title: '季報告', created_at: 300, updated_at: 200, expires_at: NOW - 1, is_active: true, click_count: 1, short_url: 'gamma' },
  { id: 'd', short_code: 'delta', original_url: 'https://d.example.com', title: 'Archived', created_at: 400, updated_at: 400, expires_at: undefined, is_active: false, click_count: 9, short_url: 'delta' },
  { id: 'e', short_code: 'epsilon', original_url: 'https://e.example.com', title: 'Null active', created_at: 500, updated_at: 500, expires_at: undefined, is_active: false, click_count: 3, short_url: 'epsilon' },
  { id: 'f', short_code: 'boundary', original_url: 'https://f.example.com', title: undefined, created_at: 600, updated_at: 600, expires_at: NOW, is_active: true, click_count: 7, short_url: 'boundary' },
  { id: 'g', short_code: 'save50%', original_url: 'https://g.example.com', title: 'Discount', created_at: 700, updated_at: 700, expires_at: undefined, is_active: true, click_count: 2, short_url: 'save50%' }
];

const run = (state: Partial<UrlListQueryState>): string[] =>
  queryMockUrls(URLS, { page: 1, search: '', status: 'all', sort: 'default', ...state }, 50, NOW).data.map(
    (url) => url.id
  );

describe('mock list parity with the D1 query', () => {
  it.each([
    ['unfiltered, newest first', {}, ['g', 'f', 'e', 'd', 'c', 'b', 'a']],
    ['status=active', { status: 'active' as const }, ['g', 'f', 'b', 'a']],
    ['status=expired', { status: 'expired' as const }, ['c']],
    ['status=archived', { status: 'archived' as const }, ['e', 'd']],
    ['search=alpha', { search: 'alpha' }, ['a']],
    ['search=報告', { search: '報告' }, ['c', 'a']],
    ['search=50% (escaped wildcard)', { search: '50%' }, ['g']],
    ['search=_ (escaped wildcard)', { search: '_' }, []],
    ['sort=clicks-desc', { sort: 'clicks-desc' as const }, ['b', 'd', 'f', 'a', 'e', 'g', 'c']],
    ['sort=clicks-asc', { sort: 'clicks-asc' as const }, ['c', 'g', 'e', 'a', 'f', 'd', 'b']],
    ['sort=created-asc', { sort: 'created-asc' as const }, ['a', 'b', 'c', 'd', 'e', 'f', 'g']],
    ['sort=updated-desc', { sort: 'updated-desc' as const }, ['g', 'f', 'e', 'd', 'b', 'c', 'a']]
  ])('matches the SQL result for %s', (_label, state, expected) => {
    expect(run(state)).toEqual(expected);
  });

  it('matches the SQL counts for an unfiltered account', () => {
    const { counts } = queryMockUrls(
      URLS,
      { page: 1, search: '', status: 'all', sort: 'default' },
      50,
      NOW
    );
    expect(counts).toEqual({ all: 7, active: 4, expired: 1, archived: 2 });
  });

  it('matches the SQL counts for a search, ignoring the status filter', () => {
    const { counts } = queryMockUrls(
      URLS,
      { page: 1, search: '報告', status: 'archived', sort: 'default' },
      50,
      NOW
    );
    expect(counts).toEqual({ all: 2, active: 1, expired: 1, archived: 0 });
  });

  it('never matches a search against an injected SQL fragment', () => {
    expect(run({ search: "' OR 1=1 --" })).toEqual([]);
  });
});
