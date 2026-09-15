import { describe, expect, it } from 'vitest';
import {
  DEFAULT_URL_LIST_QUERY,
  hasActiveUrlListFilters,
  isDefaultUrlListView,
  isSameUrlListQuery,
  parseUrlListRouteQuery,
  toUrlListApiParams,
  toUrlListRouteQuery
} from '../urlListQuery';

describe('parseUrlListRouteQuery', () => {
  it('returns defaults for an empty query', () => {
    expect(parseUrlListRouteQuery({})).toEqual(DEFAULT_URL_LIST_QUERY);
  });

  it('returns defaults when called with no argument', () => {
    expect(parseUrlListRouteQuery()).toEqual(DEFAULT_URL_LIST_QUERY);
  });

  it('reads every supported parameter', () => {
    expect(parseUrlListRouteQuery({ q: 'report', status: 'expired', sort: 'clicks-asc', page: '3' })).toEqual({
      search: 'report',
      status: 'expired',
      sort: 'clicks-asc',
      page: 3
    });
  });

  it('trims the search term', () => {
    expect(parseUrlListRouteQuery({ q: '  spaced  ' }).search).toBe('spaced');
  });

  it.each(['abc', '0', '-2', ''])('falls back to page 1 for %s', (page) => {
    expect(parseUrlListRouteQuery({ page }).page).toBe(1);
  });

  it('falls back to defaults for unknown status and sort values', () => {
    const parsed = parseUrlListRouteQuery({ status: 'deleted', sort: 'random' });
    expect(parsed.status).toBe('all');
    expect(parsed.sort).toBe('default');
  });

  it('uses the first value of a repeated parameter', () => {
    expect(parseUrlListRouteQuery({ q: ['first', 'second'], status: ['active', 'archived'] })).toMatchObject({
      search: 'first',
      status: 'active'
    });
  });

  it('ignores null values', () => {
    expect(parseUrlListRouteQuery({ q: null, status: null, sort: null, page: null })).toEqual(
      DEFAULT_URL_LIST_QUERY
    );
  });
});

describe('toUrlListRouteQuery', () => {
  it('omits every default so a plain visit keeps a clean URL', () => {
    expect(toUrlListRouteQuery(DEFAULT_URL_LIST_QUERY)).toEqual({});
  });

  it('serializes non-default values', () => {
    expect(
      toUrlListRouteQuery({ search: 'report', status: 'archived', sort: 'clicks-desc', page: 4 })
    ).toEqual({ q: 'report', status: 'archived', sort: 'clicks-desc', page: '4' });
  });

  it('omits page 1', () => {
    expect(toUrlListRouteQuery({ ...DEFAULT_URL_LIST_QUERY, page: 1 })).not.toHaveProperty('page');
  });

  it('round-trips through the parser', () => {
    const state = { search: 'aka money', status: 'expired' as const, sort: 'created-asc' as const, page: 7 };
    expect(parseUrlListRouteQuery(toUrlListRouteQuery(state))).toEqual(state);
  });
});

describe('toUrlListApiParams', () => {
  it('always sends page and limit', () => {
    expect(toUrlListApiParams(DEFAULT_URL_LIST_QUERY, 20)).toEqual({ page: 1, limit: 20 });
  });

  it('sends the search term so the server can filter the whole account', () => {
    expect(toUrlListApiParams({ ...DEFAULT_URL_LIST_QUERY, search: 'report' }, 20)).toMatchObject({
      search: 'report'
    });
  });

  it('sends the status filter', () => {
    expect(toUrlListApiParams({ ...DEFAULT_URL_LIST_QUERY, status: 'expired' }, 20)).toMatchObject({
      status: 'expired'
    });
  });

  it('sends the sort order', () => {
    expect(toUrlListApiParams({ ...DEFAULT_URL_LIST_QUERY, sort: 'clicks-desc' }, 20)).toMatchObject({
      sort: 'clicks-desc'
    });
  });

  it('omits defaults to keep the request URL readable', () => {
    const params = toUrlListApiParams(DEFAULT_URL_LIST_QUERY, 20);
    expect(params).not.toHaveProperty('search');
    expect(params).not.toHaveProperty('status');
    expect(params).not.toHaveProperty('sort');
  });

  it('carries the requested page through', () => {
    expect(toUrlListApiParams({ ...DEFAULT_URL_LIST_QUERY, page: 5 }, 10)).toMatchObject({
      page: 5,
      limit: 10
    });
  });
});

describe('isSameUrlListQuery', () => {
  it('matches identical queries', () => {
    expect(isSameUrlListQuery(DEFAULT_URL_LIST_QUERY, { ...DEFAULT_URL_LIST_QUERY })).toBe(true);
  });

  it.each([
    ['page', { page: 2 }],
    ['search', { search: 'x' }],
    ['status', { status: 'active' as const }],
    ['sort', { sort: 'clicks-asc' as const }]
  ])('detects a change in %s', (_field, override) => {
    expect(isSameUrlListQuery(DEFAULT_URL_LIST_QUERY, { ...DEFAULT_URL_LIST_QUERY, ...override })).toBe(false);
  });
});

describe('hasActiveUrlListFilters', () => {
  it('is false for the unfiltered view', () => {
    expect(hasActiveUrlListFilters(DEFAULT_URL_LIST_QUERY)).toBe(false);
  });

  it('is true when a search term narrows the results', () => {
    expect(hasActiveUrlListFilters({ ...DEFAULT_URL_LIST_QUERY, search: 'x' })).toBe(true);
  });

  it('is true when a status filter narrows the results', () => {
    expect(hasActiveUrlListFilters({ ...DEFAULT_URL_LIST_QUERY, status: 'archived' })).toBe(true);
  });

  it('ignores sort and page, which reorder rather than narrow', () => {
    expect(hasActiveUrlListFilters({ ...DEFAULT_URL_LIST_QUERY, sort: 'clicks-desc', page: 3 })).toBe(false);
  });
});

describe('isDefaultUrlListView', () => {
  it('is true only for the unfiltered, default-sorted first page', () => {
    expect(isDefaultUrlListView(DEFAULT_URL_LIST_QUERY)).toBe(true);
  });

  it.each([
    ['a later page', { page: 2 }],
    ['a search term', { search: 'x' }],
    ['a status filter', { status: 'active' as const }],
    ['a non-default sort', { sort: 'clicks-desc' as const }]
  ])('is false with %s', (_label, override) => {
    expect(isDefaultUrlListView({ ...DEFAULT_URL_LIST_QUERY, ...override })).toBe(false);
  });
});
