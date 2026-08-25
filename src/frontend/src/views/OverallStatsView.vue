<template>
  <main class="overall-stats-view">
    <header class="stats-head">
      <div><h1>總覽統計</h1><p>帳戶層級的成效摘要、趨勢與熱門連結排行。</p></div>
      <div v-if="stats" class="shown-range">統計期間 <b>{{ formatApiDate(stats.date_range.start) }} ～ {{ formatApiDate(stats.date_range.end) }}</b></div>
    </header>

    <form class="date-controls" @submit.prevent="fetchStats">
      <label>開始日期<input v-model="startDate" type="date" :max="endDate" /></label>
      <label>結束日期<input v-model="endDate" type="date" :min="startDate" /></label>
      <button data-testid="apply-date-range" type="submit" :disabled="loading">套用區間</button>
      <button data-testid="reset-current-month" type="button" :disabled="loading" @click="resetToCurrentMonth">本月</button>
    </form>

    <div v-if="error" class="stats-state" data-state="error" role="alert">
      <b>{{ stats ? '無法更新統計資料' : '無法載入統計資料' }}</b><span>{{ error }}</span>
    </div>
    <div v-if="loading && !stats" class="stats-state" data-state="loading" role="status">正在載入帳戶統計…</div>

    <template v-else-if="stats">
      <section class="stats-kpis" aria-label="帳戶摘要">
        <article class="kpi"><span>總點擊數</span><b>{{ formatNumber(stats.total_clicks) }}</b><small>所選區間內</small></article>
        <article class="kpi"><span>作用中連結</span><b>{{ formatNumber(stats.active_links) }}</b><small>未封存的連結</small></article>
        <article class="kpi"><span>連結總數</span><b>{{ formatNumber(stats.total_links) }}</b><small>帳戶已建立連結</small></article>
        <article class="kpi"><span>平均每連結</span><b>{{ averageClicks }}</b><small>區間點擊 ÷ 全部連結</small></article>
      </section>

      <section class="stats-charts">
        <article class="stats-card chart-wide">
          <header><b>點擊趨勢</b><span>選取區間 · 折線</span></header>
          <BaseChart type="line" :labels="trendLabels" :values="trendValues" ariaLabel="點擊趨勢" tall />
        </article>
        <article class="stats-card">
          <header><b>國家分佈</b><span>甜甜圈</span></header>
          <BaseChart type="doughnut" :labels="countryLabels" :values="countryValues" ariaLabel="國家分佈" />
        </article>
        <article class="stats-card">
          <header><b>裝置分佈</b><span>甜甜圈</span></header>
          <BaseChart type="doughnut" :labels="deviceLabels" :values="deviceValues" ariaLabel="裝置分佈" />
        </article>
      </section>

      <section class="top-links">
        <header><h2>熱門連結</h2><span>依點擊數由高至低</span></header>
        <div v-if="stats.top_links.length === 0" class="top-empty">目前沒有可排行的連結。</div>
        <ol v-else>
          <li v-for="(link, index) in topLinks" :key="link.short_code">
            <span class="rank">{{ index + 1 }}</span>
            <div class="link-main"><router-link :to="`/analytics/${link.short_code}`">aka.money/{{ link.short_code }}</router-link><span>{{ link.title || link.original_url }}</span><i :style="{ width: `${linkWidth(link.click_count)}%` }" /></div>
            <b>{{ formatNumber(link.click_count) }}</b>
          </li>
        </ol>
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import BaseChart from '@/components/common/BaseChart.vue';
import apiService from '@/services/api';
import type { OverallStatsResponse } from '@/types';
import { extractErrorMessage, formatApiDate, formatDecimal, formatNumber } from '@/utils/format';
import { buildTrendSeries } from '@/utils/trend';

type MetricEntry = [string, number];

const monthRange = (): { start: string; end: string } => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
};
const initialRange = monthRange();
const startDate = ref(initialRange.start);
const endDate = ref(initialRange.end);
const stats = ref<OverallStatsResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const sortedEntries = (metrics: Record<string, number>): MetricEntry[] =>
  Object.entries(metrics).sort(([leftLabel, left], [rightLabel, right]) => right - left || leftLabel.localeCompare(rightLabel));
// `click_trend` only contains days that actually recorded a click, so the series is
// zero-filled across the whole range the API reported back.
const trendSeries = computed(() =>
  stats.value ? buildTrendSeries(stats.value.click_trend, stats.value.date_range.start, stats.value.date_range.end) : []
);
const countryEntries = computed(() => sortedEntries(stats.value?.country_distribution ?? {}));
const deviceEntries = computed(() => sortedEntries(stats.value?.device_distribution ?? {}));
const trendLabels = computed(() => trendSeries.value.map((point) => formatApiDate(point.date)));
const trendValues = computed(() => trendSeries.value.map((point) => point.clicks));
const countryLabels = computed(() => countryEntries.value.map(([label]) => label));
const countryValues = computed(() => countryEntries.value.map(([, value]) => value));
const deviceLabels = computed(() => deviceEntries.value.map(([label]) => label));
const deviceValues = computed(() => deviceEntries.value.map(([, value]) => value));
const topLinks = computed(() => [...(stats.value?.top_links ?? [])].sort((left, right) => right.click_count - left.click_count));
const maxLinkClicks = computed(() => topLinks.value.reduce((maximum, link) => Math.max(maximum, link.click_count), 0));
const averageClicks = computed(() => {
  if (!stats.value || stats.value.total_links === 0) return '—';
  return formatDecimal(stats.value.total_clicks / stats.value.total_links);
});

const linkWidth = (clicks: number): number => maxLinkClicks.value === 0 ? 0 : Math.max(6, Math.round((clicks / maxLinkClicks.value) * 100));
const fetchStats = async (): Promise<void> => {
  loading.value = true;
  error.value = null;
  try {
    stats.value = await apiService.getOverallStats(startDate.value, endDate.value);
  } catch (caught: unknown) {
    error.value = extractErrorMessage(caught, '請稍後再試。');
  } finally {
    loading.value = false;
  }
};
const resetToCurrentMonth = (): void => {
  const range = monthRange();
  startDate.value = range.start;
  endDate.value = range.end;
  void fetchStats();
};

onMounted(() => { void fetchStats(); });
</script>

<style scoped>
.overall-stats-view { min-width: 0; }
.stats-head { display: flex; justify-content: space-between; gap: 12px; align-items: end; margin-bottom: 14px; }
.stats-head p, .shown-range { color: var(--color-muted); font-size: 13px; margin-top: 3px; }
.shown-range { padding: 8px 10px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); font-size: 11px; white-space: nowrap; }
.shown-range b { color: var(--color-text); }
.date-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; margin-bottom: 14px; }
.date-controls label { display: grid; gap: 3px; color: var(--color-muted); font-size: 11px; }
.date-controls input, .date-controls button { height: 31px; box-sizing: border-box; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text); font: inherit; font-size: 12px; }
.date-controls input { padding: 0 7px; }
.date-controls button { padding: 0 10px; cursor: pointer; }
.date-controls button[type="submit"] { background: var(--color-accent); border-color: var(--color-accent); color: var(--color-accent-fg); }
.date-controls button:disabled { cursor: wait; opacity: .6; }
.stats-state { display: grid; gap: 3px; padding: 13px 14px; margin-bottom: 14px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface-alt); color: var(--color-muted); font-size: 13px; }
.stats-state b { color: var(--color-text); }
.stats-state[data-state="error"] { border-color: color-mix(in srgb, var(--color-danger) 35%, var(--color-border)); background: var(--color-danger-soft); }
.stats-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.kpi, .stats-card, .top-links { min-width: 0; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.kpi { padding: 12px 13px; }
.kpi span, .kpi small { display: block; color: var(--color-muted); font-size: 11px; }
.kpi b { display: block; margin: 3px 0; color: var(--color-text); font-size: 23px; font-variant-numeric: tabular-nums; }
.stats-charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; min-width: 0; }
.stats-card > header, .top-links > header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 11px 14px 0; font-size: 12.5px; }
.stats-card > header span, .top-links > header span { color: var(--color-muted); font-size: 11px; white-space: nowrap; }
.chart-wide { grid-column: span 2; }
.top-links { margin-top: 14px; overflow: hidden; }
.top-links h2 { font-size: 16px; }
.top-links ol { margin: 10px 0 0; padding: 0; list-style: none; }
.top-links li { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 9px 14px; border-top: 1px solid var(--color-border); }
.rank { color: var(--color-faint); font-family: var(--font-mono); font-size: 12px; }
.link-main { position: relative; display: grid; gap: 1px; min-width: 0; padding-bottom: 4px; }
.link-main a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text); font-family: var(--font-mono); font-size: 12px; }
.link-main span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-muted); font-size: 11px; }
.link-main i { display: block; height: 2px; background: var(--color-accent); margin-top: 3px; }
.top-links li > b { color: var(--color-text); font-size: 13px; font-variant-numeric: tabular-nums; }
.top-empty { padding: 24px 14px; color: var(--color-muted); text-align: center; font-size: 12px; }
@media (max-width: 720px) {
  .stats-head { display: grid; align-items: start; }
  .shown-range { white-space: normal; }
  .stats-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stats-charts { grid-template-columns: minmax(0, 1fr); }
  .chart-wide { grid-column: auto; }
}
</style>
