import { describe, it, expect } from 'vitest';
import {
  DEFAULT_URL_LIST_LIMIT,
  MAX_URL_LIST_LIMIT,
  MAX_URL_SEARCH_LENGTH,
  asciiLower,
  buildUrlCountsSelection,
  buildUrlListFilter,
  buildUrlListOrderBy,
  clampPage,
  escapeLikeTerm,
  normalizeUrlListQuery,
  toUrlStatusCounts
} from '../urlListQuery';

describe('normalizeUrlListQuery', () => {
  it('applies defaults for an empty query', () => {
    expect(normalizeUrlListQuery({})).toEqual({
      page: 1,
      limit: DEFAULT_URL_LIST_LIMIT,
      search: '',
      status: 'all',
      sort: 'default'
    });
  });

  it('defaults when called with no argument at all', () => {
    expect(normalizeUrlListQuery().page).toBe(1);
  });

  it('parses valid numeric parameters', () => {
    const result = normalizeUrlListQuery({ page: '3', limit: '50' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(50);
  });

  it.each([
    ['abc', 'non-numeric'],
    ['', 'empty'],
    ['0', 'zero'],
    ['-5', 'negative'],
    ['NaN', 'NaN literal']
  ])('falls back to page 1 for %s (%s)', (page) => {
    expect(normalizeUrlListQuery({ page }).page).toBe(1);
  });

  it.each(['abc', '', '0', '-5'])('falls back to the default limit for %s', (limit) => {
    expect(normalizeUrlListQuery({ limit }).limit).toBe(DEFAULT_URL_LIST_LIMIT);
  });

  it('caps limit at the maximum', () => {
    expect(normalizeUrlListQuery({ limit: '100000' }).limit).toBe(MAX_URL_LIST_LIMIT);
  });

  it('floors fractional page and limit values', () => {
    const result = normalizeUrlListQuery({ page: '2.9', limit: '7.9' });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(7);
  });

  it('trims the search term', () => {
    expect(normalizeUrlListQuery({ search: '  hello  ' }).search).toBe('hello');
  });

  it('truncates an over-long search term', () => {
    const search = 'a'.repeat(MAX_URL_SEARCH_LENGTH + 50);
    expect(normalizeUrlListQuery({ search }).search).toHaveLength(MAX_URL_SEARCH_LENGTH);
  });

  it.each(['all', 'active', 'expired', 'archived'])('accepts the %s status', (status) => {
    expect(normalizeUrlListQuery({ status }).status).toBe(status);
  });

  it.each(['default', 'clicks-desc', 'clicks-asc', 'created-asc', 'updated-desc'])(
    'accepts the %s sort',
    (sort) => {
      expect(normalizeUrlListQuery({ sort }).sort).toBe(sort);
    }
  );

  it('falls back to safe defaults for unknown status and sort values', () => {
    const result = normalizeUrlListQuery({ status: 'deleted', sort: 'title; DROP TABLE urls' });
    expect(result.status).toBe('all');
    expect(result.sort).toBe('default');
  });
});

describe('clampPage', () => {
  it('keeps a page inside the available range', () => {
    expect(clampPage(2, 5)).toBe(2);
  });

  it('clamps a page past the end down to the last page', () => {
    expect(clampPage(999, 3)).toBe(3);
  });

  it('returns page 1 when there are no results at all', () => {
    expect(clampPage(999, 0)).toBe(1);
  });

  it.each([0, -3, Number.NaN])('returns page 1 for the invalid page %s', (page) => {
    expect(clampPage(page, 5)).toBe(1);
  });
});

describe('escapeLikeTerm', () => {
  it('escapes LIKE wildcards so they match literally', () => {
    expect(escapeLikeTerm('100%')).toBe('100\\%');
    expect(escapeLikeTerm('a_b')).toBe('a\\_b');
  });

  it('escapes the escape character itself', () => {
    expect(escapeLikeTerm('a\\b')).toBe('a\\\\b');
  });

  it('leaves ordinary and CJK text untouched', () => {
    expect(escapeLikeTerm('報告 report-1')).toBe('報告 report-1');
  });
});

describe('asciiLower', () => {
  it('folds ASCII letters', () => {
    expect(asciiLower('AbC')).toBe('abc');
  });

  it('leaves non-ASCII letters untouched, matching SQLite LOWER()', () => {
    // String#toLowerCase would produce 'école'/'σ', which SQLite's ASCII-only
    // LOWER() never produces for the column side - so the two would not match.
    expect(asciiLower('École')).toBe('École');
    expect(asciiLower('Σ')).toBe('Σ');
  });

  it('leaves CJK text untouched', () => {
    expect(asciiLower('季報告')).toBe('季報告');
  });
});

describe('buildUrlListFilter', () => {
  const base = { userId: 'user-1', search: '', status: 'all' as const, now: 1_000 };

  it('always scopes to the owner', () => {
    const filter = buildUrlListFilter(base);
    expect(filter.sql).toBe('WHERE urls.user_id = ?');
    expect(filter.params).toEqual(['user-1']);
  });

  it('matches short_code, original_url and title case-insensitively', () => {
    const filter = buildUrlListFilter({ ...base, search: 'Report' });
    expect(filter.sql).toContain('LOWER(urls.short_code) LIKE ?');
    expect(filter.sql).toContain('LOWER(urls.original_url) LIKE ?');
    expect(filter.sql).toContain("LOWER(COALESCE(urls.title, '')) LIKE ?");
    expect(filter.sql).not.toContain('description');
    expect(filter.params).toEqual(['user-1', '%report%', '%report%', '%report%']);
  });

  it('binds the search term rather than interpolating it', () => {
    const filter = buildUrlListFilter({ ...base, search: "'; DROP TABLE urls; --" });
    expect(filter.sql).not.toContain('DROP TABLE');
    expect(filter.params).toContain("%'; drop table urls; --%");
  });

  it('escapes wildcards inside the bound pattern', () => {
    const filter = buildUrlListFilter({ ...base, search: '50%' });
    expect(filter.params).toContain('%50\\%%');
    expect(filter.sql).toContain("ESCAPE '\\'");
  });

  it('folds the search term with ASCII rules so it can match SQLite LOWER()', () => {
    // Regression guard: String#toLowerCase would bind '%école%', which can never
    // match the column value SQLite's ASCII-only LOWER() produces ('École').
    const filter = buildUrlListFilter({ ...base, search: 'École' });
    expect(filter.params).toContain('%École%');
    expect(filter.params).not.toContain('%école%');
  });

  it('treats a zero expiry as "no expiry" for the active filter', () => {
    const filter = buildUrlListFilter({ ...base, status: 'active' });
    expect(filter.sql).toContain('urls.expires_at IS NULL OR urls.expires_at = 0');
    expect(filter.sql).toContain('urls.expires_at >= ?');
    expect(filter.params).toEqual(['user-1', 1_000]);
  });

  it('excludes a zero expiry from the expired filter', () => {
    const filter = buildUrlListFilter({ ...base, status: 'expired' });
    expect(filter.sql).toContain('urls.expires_at IS NOT NULL AND urls.expires_at <> 0');
    expect(filter.sql).toContain('urls.expires_at < ?');
    expect(filter.params).toEqual(['user-1', 1_000]);
  });

  it('treats any non-1 is_active value (including NULL) as archived', () => {
    const filter = buildUrlListFilter({ ...base, status: 'archived' });
    expect(filter.sql).toContain('urls.is_active IS NOT 1');
    expect(filter.params).toEqual(['user-1']);
  });

  it('binds the search params before the status param', () => {
    const filter = buildUrlListFilter({ ...base, search: 'abc', status: 'active' });
    expect(filter.params).toEqual(['user-1', '%abc%', '%abc%', '%abc%', 1_000]);
  });
});

describe('buildUrlCountsSelection', () => {
  it('counts with COUNT(CASE ...) so an empty result set yields 0, not NULL', () => {
    const selection = buildUrlCountsSelection(1_000);
    expect(selection.sql).toContain('COUNT(CASE WHEN');
    expect(selection.sql).not.toContain('SUM(');
  });

  it('binds one now value per status predicate, in projection order', () => {
    expect(buildUrlCountsSelection(1_234).params).toEqual([1_234, 1_234]);
  });

  it('projects all four status buckets', () => {
    const { sql } = buildUrlCountsSelection(1_000);
    expect(sql).toContain('all_count');
    expect(sql).toContain('active_count');
    expect(sql).toContain('expired_count');
    expect(sql).toContain('archived_count');
  });
});

describe('buildUrlListOrderBy', () => {
  it.each([
    ['default', 'ORDER BY urls.created_at DESC, urls.id DESC'],
    ['created-asc', 'ORDER BY urls.created_at ASC, urls.id ASC'],
    ['updated-desc', 'ORDER BY urls.updated_at DESC, urls.id DESC'],
    ['clicks-desc', 'ORDER BY urls.click_count DESC, urls.created_at DESC, urls.id DESC'],
    ['clicks-asc', 'ORDER BY urls.click_count ASC, urls.created_at DESC, urls.id DESC']
  ] as const)('maps %s to a whitelisted clause', (sort, expected) => {
    expect(buildUrlListOrderBy(sort)).toBe(expected);
  });

  it('always ends with a unique tiebreaker so paging cannot duplicate rows', () => {
    for (const sort of ['default', 'created-asc', 'updated-desc', 'clicks-desc', 'clicks-asc'] as const) {
      expect(buildUrlListOrderBy(sort)).toMatch(/urls\.id (ASC|DESC)$/);
    }
  });

  it('falls back to the default clause for an unknown sort', () => {
    expect(buildUrlListOrderBy('; DROP TABLE urls' as never)).toBe(
      'ORDER BY urls.created_at DESC, urls.id DESC'
    );
  });
});

describe('toUrlStatusCounts', () => {
  it('maps a counts row', () => {
    expect(
      toUrlStatusCounts({ all_count: 10, active_count: 6, expired_count: 1, archived_count: 3 })
    ).toEqual({ all: 10, active: 6, expired: 1, archived: 3 });
  });

  it('coerces a missing row to zeroes', () => {
    expect(toUrlStatusCounts(null)).toEqual({ all: 0, active: 0, expired: 0, archived: 0 });
    expect(toUrlStatusCounts(undefined)).toEqual({ all: 0, active: 0, expired: 0, archived: 0 });
  });

  it('coerces NULL aggregate results to zero', () => {
    expect(
      toUrlStatusCounts({ all_count: 0, active_count: null, expired_count: null, archived_count: null })
    ).toEqual({ all: 0, active: 0, expired: 0, archived: 0 });
  });
});
