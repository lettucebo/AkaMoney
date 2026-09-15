import { describe, expect, it, beforeAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildUrlCountsSelection,
  buildUrlListFilter,
  buildUrlListOrderBy,
  type UrlListStatus,
  type UrlListSort
} from '../urlListQuery';

/**
 * Executes the SQL the list builders produce against a real SQLite database.
 *
 * The sibling unit tests assert on SQL *text*, which cannot catch a syntax
 * error, a mis-ordered bind parameter, or a predicate that reads correctly but
 * matches the wrong rows. This suite runs the real statements over the real
 * schema instead, so those failures surface here.
 */
const NOW = 1_000_000;
const USER = 'user-1';

const migration = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../migrations/${name}`, import.meta.url)), 'utf8');

let db: DatabaseSync;

beforeAll(() => {
  db = new DatabaseSync(':memory:');
  db.exec(migration('0001_initial_schema.sql'));
  db.exec(migration('0005_add_url_list_indexes.sql'));

  const rows: [string, string, string, string, string | null, number, number, number | null, number | null, number][] = [
    // id, short_code, original_url, user_id, title, created, updated, expires, is_active, clicks
    ['a', 'Alpha', 'https://a.example.com', USER, 'Alpha 報告', 100, 100, null, 1, 5],
    ['b', 'beta', 'https://b.example.com', USER, null, 200, 300, 0, 1, 50],
    ['c', 'gamma', 'https://c.example.com', USER, '季報告', 300, 200, NOW - 1, 1, 1],
    ['d', 'delta', 'https://d.example.com', USER, 'Archived', 400, 400, null, 0, 9],
    ['e', 'epsilon', 'https://e.example.com', USER, 'Null active', 500, 500, null, null, 3],
    ['f', 'boundary', 'https://f.example.com', USER, null, 600, 600, NOW, 1, 7],
    ['g', 'save50%', 'https://g.example.com', USER, 'Discount', 700, 700, null, 1, 2],
    ['h', 'under_score', 'https://h.example.com', USER, 'École Report', 800, 800, -5, 1, 4],
    ['i', 'two', 'https://i.example.com', USER, 'Weird', 900, 900, null, 2, 6],
    ['x', 'other-user', 'https://x.example.com', 'user-2', 'Alpha 報告', 1000, 1000, null, 1, 999]
  ];
  const insert = db.prepare(
    `INSERT INTO urls (id, short_code, original_url, user_id, title, created_at, updated_at, expires_at, is_active, click_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const row of rows) {
    insert.run(...row);
  }
});

interface ListOptions {
  search?: string;
  status?: UrlListStatus;
  sort?: UrlListSort;
  limit?: number;
  offset?: number;
}

const list = ({ search = '', status = 'all', sort = 'default', limit = 50, offset = 0 }: ListOptions = {}): string[] => {
  const filter = buildUrlListFilter({ userId: USER, search, status, now: NOW });
  return db
    .prepare(`SELECT id FROM urls ${filter.sql} ${buildUrlListOrderBy(sort)} LIMIT ? OFFSET ?`)
    .all(...filter.params, limit, offset)
    .map((row) => String(row.id));
};

const counts = (search = ''): Record<string, unknown> => {
  const selection = buildUrlCountsSelection(NOW);
  const filter = buildUrlListFilter({ userId: USER, search, status: 'all', now: NOW });
  return db
    .prepare(`${selection.sql} ${filter.sql}`)
    .get(...selection.params, ...filter.params) as Record<string, unknown>;
};

describe('URL list SQL executed against SQLite', () => {
  describe('ownership', () => {
    it('never returns another user row', () => {
      expect(list()).not.toContain('x');
    });

    it('never returns another user row via a matching search', () => {
      // 'x' has the same title as 'a'; only the owner's row may come back.
      expect(list({ search: '報告' })).not.toContain('x');
    });

    it('never counts another user row', () => {
      expect(counts().all_count).toBe(9);
    });
  });

  describe('status predicates', () => {
    it('treats NULL, 0 and a not-yet-reached expiry as active', () => {
      expect(list({ status: 'active' }).sort()).toEqual(['a', 'b', 'f', 'g']);
    });

    it('only reports unarchived rows genuinely past their expiry as expired', () => {
      // 'h' has a negative expiry, which is truthy in JS and therefore expired.
      expect(list({ status: 'expired' }).sort()).toEqual(['c', 'h']);
    });

    it('treats every non-1 is_active value, including NULL and 2, as archived', () => {
      expect(list({ status: 'archived' }).sort()).toEqual(['d', 'e', 'i']);
    });

    it('partitions the account exactly once across the three buckets', () => {
      const row = counts();
      expect(row.active_count as number).toBe(4);
      expect(row.expired_count as number).toBe(2);
      expect(row.archived_count as number).toBe(3);
      expect(
        (row.active_count as number) + (row.expired_count as number) + (row.archived_count as number)
      ).toBe(row.all_count as number);
    });

    it('keeps a row expiring exactly now out of the expired bucket', () => {
      expect(list({ status: 'expired' })).not.toContain('f');
      expect(list({ status: 'active' })).toContain('f');
    });
  });

  describe('search', () => {
    it('matches the short code case-insensitively for ASCII', () => {
      expect(list({ search: 'ALPHA' })).toEqual(['a']);
      expect(list({ search: 'alpha' })).toEqual(['a']);
    });

    it('matches the original url', () => {
      expect(list({ search: 'b.example' })).toEqual(['b']);
    });

    it('matches CJK titles', () => {
      expect(list({ search: '報告' }).sort()).toEqual(['a', 'c']);
    });

    it('finds a non-ASCII title typed exactly', () => {
      // Regression guard: lowering the term with String#toLowerCase while the
      // column is lowered by SQLite (ASCII-only) made this return nothing.
      expect(list({ search: 'École' })).toEqual(['h']);
      expect(list({ search: 'École Report' })).toEqual(['h']);
    });

    it('does not search the description column', () => {
      expect(list({ search: 'Discount' })).toEqual(['g']);
      expect(list({ search: 'no-such-description' })).toEqual([]);
    });

    it('treats % as a literal character', () => {
      expect(list({ search: '50%' })).toEqual(['g']);
      expect(list({ search: '%' })).toEqual(['g']);
    });

    it('treats _ as a literal character', () => {
      expect(list({ search: '_' })).toEqual(['h']);
      expect(list({ search: 'under_score' })).toEqual(['h']);
    });

    it('treats a backslash as a literal character', () => {
      expect(list({ search: '\\' })).toEqual([]);
    });

    it.each([
      "' OR 1=1 --",
      "'; DROP TABLE urls; --",
      "%' OR '1'='1"
    ])('cannot be injected via %s', (search) => {
      expect(list({ search })).toEqual([]);
      // The table must still be intact afterwards.
      expect(list()).toHaveLength(9);
    });

    it('narrows the counts to the search term', () => {
      expect(counts('報告')).toMatchObject({
        all_count: 2,
        active_count: 1,
        expired_count: 1,
        archived_count: 0
      });
    });

    it('returns zero, not NULL, for every count when nothing matches', () => {
      expect(counts('no-such-thing')).toEqual({
        all_count: 0,
        active_count: 0,
        expired_count: 0,
        archived_count: 0
      });
    });
  });

  describe('sorting', () => {
    it.each([
      ['default', ['i', 'h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']],
      ['created-asc', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']],
      ['updated-desc', ['i', 'h', 'g', 'f', 'e', 'd', 'b', 'c', 'a']],
      ['clicks-desc', ['b', 'd', 'f', 'i', 'a', 'h', 'e', 'g', 'c']],
      ['clicks-asc', ['c', 'g', 'e', 'h', 'a', 'i', 'f', 'd', 'b']]
    ] as [UrlListSort, string[]][])('orders rows for %s', (sort, expected) => {
      expect(list({ sort })).toEqual(expected);
    });

    it('produces a total order, so paging cannot duplicate or skip a row', () => {
      for (const sort of ['default', 'created-asc', 'updated-desc', 'clicks-desc', 'clicks-asc'] as const) {
        const whole = list({ sort });
        const paged = [0, 4, 8].flatMap((offset) => list({ sort, limit: 4, offset }));
        expect(paged).toEqual(whole);
        expect(new Set(paged).size).toBe(whole.length);
      }
    });
  });

  describe('pagination', () => {
    it('slices by limit and offset', () => {
      expect(list({ limit: 3, offset: 3 })).toEqual(['f', 'e', 'd']);
    });

    it('returns nothing past the end rather than failing', () => {
      expect(list({ limit: 20, offset: 500 })).toEqual([]);
    });
  });
});
