import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import type { OverallStatsResponse } from '@/types';
import { useKpiSummary } from '../useKpiSummary';

const buildTrend = (dailyClicks: number[], startDay: number): Record<string, number> => {
  const trend: Record<string, number> = {};
  dailyClicks.forEach((clicks, index) => {
    const day = String(startDay + index).padStart(2, '0');
    trend[`2024-03-${day}`] = clicks;
  });
  return trend;
};

const buildStats = (overrides: Partial<OverallStatsResponse> = {}): OverallStatsResponse => ({
  total_clicks: 500,
  active_links: 3,
  total_links: 4,
  click_trend: {},
  top_links: [],
  country_distribution: {},
  device_distribution: {},
  date_range: { start: '2024-03-01', end: '2024-03-30' },
  ...overrides
});

describe('useKpiSummary', () => {
  it('returns no cards until statistics have loaded', () => {
    const cards = useKpiSummary(ref(null));

    expect(cards.value).toEqual([]);
  });

  it('renders the four dashboard KPI cards in order', () => {
    const cards = useKpiSummary(ref(buildStats()));

    expect(cards.value.map((card) => card.key)).toEqual([
      'clicks',
      'active',
      'total',
      'average'
    ]);
    expect(cards.value.map((card) => card.label)).toEqual([
      '近30天點擊',
      '作用中連結',
      '全部連結',
      '平均每連結'
    ]);
  });

  it('never renders a subtitle for the active links card', () => {
    const cards = useKpiSummary(ref(buildStats()));

    expect(cards.value[1].value).toBe('3');
    expect(cards.value[1].detail).toBeNull();
  });

  it('derives the archived count for the total links card', () => {
    const cards = useKpiSummary(ref(buildStats({ active_links: 3, total_links: 10 })));

    expect(cards.value[2].value).toBe('10');
    expect(cards.value[2].detail).toBe('7 個已封存');
  });

  it('clamps a negative derived archived count to zero', () => {
    const cards = useKpiSummary(ref(buildStats({ active_links: 9, total_links: 4 })));

    expect(cards.value[2].detail).toBe('0 個已封存');
  });

  it('averages clicks across all links, not just the active ones', () => {
    const cards = useKpiSummary(ref(buildStats({ total_clicks: 500, active_links: 3, total_links: 4 })));

    expect(cards.value[3].value).toBe('125');
    expect(cards.value[3].detail).toBe('點擊 ÷ 連結數');
  });

  it('reports a zero average when there are no links at all', () => {
    const cards = useKpiSummary(ref(buildStats({ total_clicks: 0, active_links: 0, total_links: 0 })));

    expect(cards.value[3].value).toBe('0');
  });

  it('compares the latest seven days against the previous seven', () => {
    const stats = buildStats({
      total_clicks: 42,
      click_trend: buildTrend([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2], 17),
      date_range: { start: '2024-03-17', end: '2024-03-30' }
    });

    const cards = useKpiSummary(ref(stats));

    expect(cards.value[0].value).toBe('42');
    expect(cards.value[0].detail).toBe('較前 7 日 +100%');
    expect(cards.value[0].tone).toBe('up');
  });

  it('marks a decline with a down tone', () => {
    const stats = buildStats({
      click_trend: buildTrend([2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1], 17),
      date_range: { start: '2024-03-17', end: '2024-03-30' }
    });

    const cards = useKpiSummary(ref(stats));

    expect(cards.value[0].detail).toBe('較前 7 日 -50%');
    expect(cards.value[0].tone).toBe('down');
  });

  it('hides the click subtitle when the baseline week has no clicks', () => {
    const stats = buildStats({
      click_trend: buildTrend([0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5, 5], 17),
      date_range: { start: '2024-03-17', end: '2024-03-30' }
    });

    const cards = useKpiSummary(ref(stats));

    expect(cards.value[0].detail).toBeNull();
    expect(cards.value[0].tone).toBe('neutral');
  });

  it('hides the click subtitle when the range is too short to compare', () => {
    const stats = buildStats({
      click_trend: { '2024-03-30': 12 },
      date_range: { start: '2024-03-24', end: '2024-03-30' }
    });

    const cards = useKpiSummary(ref(stats));

    expect(cards.value[0].detail).toBeNull();
  });

  it('recomputes when the source statistics change', () => {
    const stats = ref<OverallStatsResponse | null>(null);
    const cards = useKpiSummary(stats);

    expect(cards.value).toEqual([]);

    stats.value = buildStats({ total_clicks: 1200 });

    expect(cards.value[0].value).toBe('1,200');
  });
});
