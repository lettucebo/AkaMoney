import { computed } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import type { OverallStatsResponse } from '@/types';
import { buildTrendSeries, weekOverWeekChange } from '@/utils/trend';
import { formatDecimal, formatNumber, formatSignedPercent } from '@/utils/format';

export type KpiTone = 'up' | 'down' | 'neutral';

export interface KpiCard {
  key: string;
  label: string;
  value: string;
  /** Supporting line under the value; `null` renders no subtitle at all. */
  detail: string | null;
  tone: KpiTone;
}

const toneFor = (change: number | null): KpiTone => {
  if (change === null || change === 0) {
    return 'neutral';
  }
  return change > 0 ? 'up' : 'down';
};

/**
 * Derives the dashboard KPI cards from a rolling 30-day overall statistics response.
 *
 * The click card compares the latest seven days against the previous seven and hides
 * its subtitle when there is no usable baseline. The average is deliberately computed
 * across *all* links (not just active ones) so it matches `total_clicks`.
 */
export function useKpiSummary(stats: Ref<OverallStatsResponse | null>): ComputedRef<KpiCard[]> {
  return computed(() => {
    const value = stats.value;
    if (!value) {
      return [];
    }

    const series = buildTrendSeries(value.click_trend, value.date_range.start, value.date_range.end);
    const change = weekOverWeekChange(series);
    const archived = Math.max(0, value.total_links - value.active_links);
    const average = value.total_links > 0 ? value.total_clicks / value.total_links : 0;

    return [
      {
        key: 'clicks',
        label: '近30天點擊',
        value: formatNumber(value.total_clicks),
        detail: change === null ? null : `較前 7 日 ${formatSignedPercent(change)}`,
        tone: toneFor(change)
      },
      {
        key: 'active',
        label: '作用中連結',
        value: formatNumber(value.active_links),
        detail: null,
        tone: 'neutral'
      },
      {
        key: 'total',
        label: '全部連結',
        value: formatNumber(value.total_links),
        detail: `${formatNumber(archived)} 個已封存`,
        tone: 'neutral'
      },
      {
        key: 'average',
        label: '平均每連結',
        value: formatDecimal(average, 1),
        detail: '點擊 ÷ 連結數',
        tone: 'neutral'
      }
    ];
  });
}
