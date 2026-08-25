/**
 * Click-trend maths for the sparse `Record<date, clicks>` calendars the API returns.
 *
 * The API only emits days that actually recorded a click, so every consumer has to
 * zero-fill the calendar before charting or comparing periods.
 */

export interface TrendPoint {
  date: string;
  clicks: number;
}

const DAY_MS = 86400000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseDateKey = (key: string): number | null => {
  if (!DATE_KEY_PATTERN.test(key)) {
    return null;
  }
  const time = Date.parse(`${key}T00:00:00.000Z`);
  return Number.isNaN(time) ? null : time;
};

/** Formats a `Date` as the UTC `YYYY-MM-DD` key the API uses. */
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Moves a `YYYY-MM-DD` key by `days`; unparsable keys are returned untouched. */
export function shiftDateKey(key: string, days: number): string {
  const time = parseDateKey(key);
  if (time === null) {
    return key;
  }
  return toDateKey(new Date(time + days * DAY_MS));
}

/** Builds an inclusive rolling window of `days` days ending on `endDate`. */
export function rollingWindow(days: number, endDate: Date = new Date()): { start: string; end: string } {
  const end = toDateKey(endDate);
  return { start: shiftDateKey(end, -(days - 1)), end };
}

/** Expands a sparse click calendar into one zero-filled point per day in the range. */
export function buildTrendSeries(
  trend: Record<string, number> | null | undefined,
  startKey: string,
  endKey: string
): TrendPoint[] {
  const startTime = parseDateKey(startKey);
  const endTime = parseDateKey(endKey);
  if (startTime === null || endTime === null || startTime > endTime) {
    return [];
  }

  const source = trend ?? {};
  const points: TrendPoint[] = [];
  for (let time = startTime; time <= endTime; time += DAY_MS) {
    const date = toDateKey(new Date(time));
    const raw = source[date];
    points.push({
      date,
      clicks: typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
    });
  }
  return points;
}

/** Sums the clicks in a trend series. */
export function sumClicks(points: TrendPoint[]): number {
  return points.reduce((total, point) => total + point.clicks, 0);
}

/**
 * Compares the latest seven days against the seven days before them.
 *
 * Returns `null` when there is no usable baseline - either fewer than fourteen days of
 * data, or a baseline week with zero clicks (which would make the ratio meaningless).
 */
export function weekOverWeekChange(points: TrendPoint[]): number | null {
  if (points.length < 14) {
    return null;
  }
  const latest = sumClicks(points.slice(-7));
  const baseline = sumClicks(points.slice(-14, -7));
  if (baseline === 0) {
    return null;
  }
  return (latest - baseline) / baseline;
}
