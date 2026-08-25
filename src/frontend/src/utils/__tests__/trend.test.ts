import { describe, it, expect } from 'vitest';
import {
  toDateKey,
  shiftDateKey,
  rollingWindow,
  buildTrendSeries,
  sumClicks,
  weekOverWeekChange
} from '../trend';

describe('toDateKey / shiftDateKey', () => {
  it('formats a UTC calendar key', () => {
    expect(toDateKey(new Date(Date.UTC(2024, 2, 9)))).toBe('2024-03-09');
  });

  it('shifts a key forwards and backwards across month boundaries', () => {
    expect(shiftDateKey('2024-03-01', -1)).toBe('2024-02-29');
    expect(shiftDateKey('2024-12-31', 1)).toBe('2025-01-01');
  });

  it('returns the original key when it cannot be parsed', () => {
    expect(shiftDateKey('nope', 1)).toBe('nope');
  });
});

describe('rollingWindow', () => {
  it('produces an inclusive window that ends today', () => {
    const window = rollingWindow(30, new Date(Date.UTC(2024, 2, 30)));

    expect(window.end).toBe('2024-03-30');
    expect(window.start).toBe('2024-03-01');
  });

  it('supports a seven day window', () => {
    const window = rollingWindow(7, new Date(Date.UTC(2024, 0, 10)));

    expect(window).toEqual({ start: '2024-01-04', end: '2024-01-10' });
  });
});

describe('buildTrendSeries', () => {
  it('zero fills every day in a sparse calendar range', () => {
    const series = buildTrendSeries({ '2024-03-03': 5 }, '2024-03-01', '2024-03-04');

    expect(series).toEqual([
      { date: '2024-03-01', clicks: 0 },
      { date: '2024-03-02', clicks: 0 },
      { date: '2024-03-03', clicks: 5 },
      { date: '2024-03-04', clicks: 0 }
    ]);
  });

  it('ignores days outside the requested range', () => {
    const series = buildTrendSeries({ '2024-02-28': 9, '2024-03-01': 1 }, '2024-03-01', '2024-03-01');

    expect(series).toEqual([{ date: '2024-03-01', clicks: 1 }]);
  });

  it('coerces non-numeric values to zero', () => {
    const series = buildTrendSeries(
      { '2024-03-01': Number.NaN } as unknown as Record<string, number>,
      '2024-03-01',
      '2024-03-01'
    );

    expect(series).toEqual([{ date: '2024-03-01', clicks: 0 }]);
  });

  it('returns an empty series for missing data or an inverted range', () => {
    expect(buildTrendSeries(null, '2024-03-01', '2024-03-02')).toEqual([
      { date: '2024-03-01', clicks: 0 },
      { date: '2024-03-02', clicks: 0 }
    ]);
    expect(buildTrendSeries({}, '2024-03-05', '2024-03-01')).toEqual([]);
    expect(buildTrendSeries({}, 'bogus', '2024-03-01')).toEqual([]);
  });
});

describe('sumClicks', () => {
  it('adds every click in the series', () => {
    expect(sumClicks([{ date: 'a', clicks: 2 }, { date: 'b', clicks: 3 }])).toBe(5);
  });

  it('returns zero for an empty series', () => {
    expect(sumClicks([])).toBe(0);
  });
});

describe('weekOverWeekChange', () => {
  const series = (values: number[]) =>
    values.map((clicks, index) => ({ date: `2024-03-${String(index + 1).padStart(2, '0')}`, clicks }));

  it('compares the latest seven days against the previous seven', () => {
    const points = series([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2]);

    expect(weekOverWeekChange(points)).toBeCloseTo(1, 10);
  });

  it('reports a decline as a negative ratio', () => {
    const points = series([2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1]);

    expect(weekOverWeekChange(points)).toBeCloseTo(-0.5, 10);
  });

  it('returns null when the previous seven days have no clicks', () => {
    const points = series([0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5, 5]);

    expect(weekOverWeekChange(points)).toBeNull();
  });

  it('returns null when there is no full baseline week', () => {
    expect(weekOverWeekChange(series([1, 2, 3, 4, 5, 6, 7]))).toBeNull();
    expect(weekOverWeekChange([])).toBeNull();
  });

  it('only uses the trailing fourteen days of a longer series', () => {
    const points = series([99, 99, 0, 0, 0, 0, 0, 0, 0, 4, 4, 4, 4, 4, 4, 4]);

    expect(weekOverWeekChange(points)).toBeNull();
  });
});
