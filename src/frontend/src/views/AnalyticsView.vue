<template>
  <main class="analytics-view">
    <div v-if="loading" class="analytics-state" data-state="loading" role="status">
      正在載入短網址成效…
    </div>

    <section v-else-if="notFound" class="analytics-state" data-state="empty">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></svg>
      <div><b>找不到這個短網址</b><span>{{ error }}</span></div>
      <router-link to="/dashboard">回到連結列表</router-link>
    </section>

    <section v-else-if="error" class="analytics-state" data-state="error" role="alert">
      <b>無法載入成效分析</b>
      <span>{{ error }}</span>
      <router-link to="/dashboard">回到連結列表</router-link>
    </section>

    <template v-else-if="analytics">
      <header class="analytics-head">
        <div class="head-copy">
          <router-link to="/dashboard" class="back-link">← 回到連結</router-link>
          <h1>成效分析</h1>
          <p>檢視此短網址的點擊趨勢與可用來源分佈。</p>
        </div>
        <div class="analytics-subject">
          <span>分析對象</span>
          <b>{{ shortHost }}/{{ analytics.url.short_code }}</b>
          <!-- Replay must not record customer destinations: they can carry signed query credentials. -->
          <a
            v-if="safeOriginalUrl"
            data-sentry-block
            :href="safeOriginalUrl"
            target="_blank"
            rel="noopener noreferrer"
            :title="analytics.url.original_url"
          >
            {{ analytics.url.original_url }} ↗
          </a>
          <span v-else class="original-url" data-sentry-block :title="analytics.url.original_url">{{ analytics.url.original_url }}</span>
        </div>
      </header>

      <div class="range-control" role="group" aria-label="統計範圍">
        <button v-for="option in rangeOptions" :key="option.value" :data-range="option.value" :class="{ active: selectedRange === option.value }" type="button" @click="selectedRange = option.value">
          {{ option.label }}
        </button>
        <span>API 僅提供近 30 日的每日點擊資料</span>
      </div>

      <section class="analytics-kpis" aria-label="點擊摘要">
        <article class="kpi"><span>累計總點擊</span><b>{{ formatNumber(analytics.total_clicks) }}</b><small>API 全期間累計</small></article>
        <article class="kpi"><span>有點擊日期</span><b>{{ formatNumber(activeDays) }}</b><small>所選區間內</small></article>
        <article class="kpi"><span>國家項目</span><b>{{ formatNumber(countryEntries.length) }}</b><small>全期間可用國家資料</small></article>
        <article class="kpi"><span>裝置項目</span><b>{{ formatNumber(deviceEntries.length) }}</b><small>全期間可用裝置資料</small></article>
      </section>

      <section class="analytics-charts">
        <article class="analytics-card chart-wide">
          <header><b>每日點擊趨勢</b><span>{{ rangeLabel }} · 折線</span></header>
          <BaseChart type="line" :labels="trendLabels" :values="trendValues" ariaLabel="每日點擊趨勢" tall />
        </article>
        <article class="analytics-card">
          <header><b>國家分佈</b><span>甜甜圈</span></header>
          <BaseChart type="doughnut" :labels="countryLabels" :values="countryValues" ariaLabel="國家分佈" />
        </article>
        <article class="analytics-card">
          <header><b>裝置分佈</b><span>甜甜圈</span></header>
          <BaseChart type="doughnut" :labels="deviceLabels" :values="deviceValues" ariaLabel="裝置分佈" />
        </article>
        <article class="analytics-card chart-wide">
          <header><b>瀏覽器分佈</b><span>長條</span></header>
          <BaseChart type="bar" :labels="browserLabels" :values="browserValues" ariaLabel="瀏覽器分佈" />
        </article>
      </section>

      <section class="recent-card">
        <header><b>近期點擊</b><span>最近 {{ analytics.recent_clicks.length }} 筆</span></header>
        <div v-if="analytics.recent_clicks.length === 0" class="recent-empty">目前沒有近期點擊紀錄</div>
        <div v-else class="recent-scroll">
          <table>
            <thead><tr><th>時間</th><th>國家</th><th>裝置</th><th>瀏覽器</th></tr></thead>
            <tbody>
              <tr v-for="click in analytics.recent_clicks.slice(0, 10)" :key="click.id">
                <td>{{ formatDateTime(click.clicked_at) }}</td>
                <td>{{ click.country || '未知' }}</td>
                <td>{{ click.device_type || '未知' }}</td>
                <td>{{ click.browser || '未知' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import BaseChart from '@/components/common/BaseChart.vue';
import apiService from '@/services/api';
import type { AnalyticsResponse } from '@/types';
import { extractErrorMessage, formatApiDate, formatDateTime, formatNumber, resolveShortHost } from '@/utils/format';
import { buildTrendSeries, rollingWindow } from '@/utils/trend';

type Range = '7' | '30' | 'all';
type MetricEntry = [string, number];

interface ErrorWithResponse {
  response?: { status?: number };
}

/**
 * `getAnalytics` only returns the last 30 days of `clicks_by_date`, and only for
 * days that actually recorded a click (src/backend/src/services/analytics.ts).
 * Slicing that sparse record would mislabel "the last N entries" as "the last N
 * days", so every window here is an explicit UTC calendar ending today and the
 * sparse record is zero-filled into it. The widest option is therefore the API's
 * own 30-day window, not "all history".
 */
const RANGE_DAYS: Readonly<Record<Range, number>> = { '7': 7, '30': 30, all: 30 };

const route = useRoute();
const shortCode = computed(() => String(route.params.shortCode ?? ''));
const analytics = ref<AnalyticsResponse | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const notFound = ref(false);
const selectedRange = ref<Range>('30');
const shortHost = resolveShortHost(import.meta.env.VITE_SHORT_DOMAIN);
const rangeOptions: ReadonlyArray<{ value: Range; label: string }> = [
  { value: '7', label: '近 7 日' },
  { value: '30', label: '近 30 日' },
  { value: 'all', label: '近 30 日（API）' }
];

const sortedEntries = (metrics: Record<string, number>): MetricEntry[] =>
  Object.entries(metrics).sort(([leftLabel, left], [rightLabel, right]) => right - left || leftLabel.localeCompare(rightLabel));

const visibleSeries = computed(() => {
  const source = analytics.value?.clicks_by_date;
  if (!source) {
    return [];
  }
  const { start, end } = rollingWindow(RANGE_DAYS[selectedRange.value]);
  return buildTrendSeries(source, start, end);
});
const trendLabels = computed(() => visibleSeries.value.map((point) => formatApiDate(point.date)));
const trendValues = computed(() => visibleSeries.value.map((point) => point.clicks));
const countryEntries = computed(() => sortedEntries(analytics.value?.clicks_by_country ?? {}));
const deviceEntries = computed(() => sortedEntries(analytics.value?.clicks_by_device ?? {}));
const browserEntries = computed(() => sortedEntries(analytics.value?.clicks_by_browser ?? {}));
const countryLabels = computed(() => countryEntries.value.map(([label]) => label));
const countryValues = computed(() => countryEntries.value.map(([, value]) => value));
const deviceLabels = computed(() => deviceEntries.value.map(([label]) => label));
const deviceValues = computed(() => deviceEntries.value.map(([, value]) => value));
const browserLabels = computed(() => browserEntries.value.map(([label]) => label));
const browserValues = computed(() => browserEntries.value.map(([, value]) => value));
const activeDays = computed(() => visibleSeries.value.filter((point) => point.clicks > 0).length);
const rangeLabel = computed(() => rangeOptions.find((option) => option.value === selectedRange.value)?.label ?? '');
const safeOriginalUrl = computed(() => {
  const source = analytics.value?.url.original_url;
  if (!source) return null;
  try {
    const parsed = new URL(source);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
});

const isNotFoundError = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && (value as ErrorWithResponse).response?.status === 404;

// The router reuses this component instance when only `:shortCode` changes, so
// every load carries a generation token: a response for a short code the user has
// already navigated away from must never write state.
let requestGeneration = 0;

const loadAnalytics = async (code: string): Promise<void> => {
  const generation = ++requestGeneration;
  analytics.value = null;
  error.value = null;
  notFound.value = false;
  loading.value = true;
  try {
    const response = await apiService.getAnalytics(code);
    if (generation !== requestGeneration) return;
    analytics.value = response;
  } catch (caught: unknown) {
    if (generation !== requestGeneration) return;
    notFound.value = isNotFoundError(caught);
    error.value = extractErrorMessage(caught, notFound.value ? '此短代碼不存在或已移除。' : '請稍後再試。');
  } finally {
    if (generation === requestGeneration) {
      loading.value = false;
    }
  }
};

watch(shortCode, (code) => { void loadAnalytics(code); }, { immediate: true });
</script>

<style scoped>
.analytics-view { min-width: 0; }
.analytics-head { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 14px; min-width: 0; }
.head-copy, .analytics-subject { min-width: 0; }
.back-link { display: inline-block; margin-bottom: 7px; color: var(--color-muted); font-size: 12px; }
.back-link:hover { color: var(--color-text); }
.head-copy p { color: var(--color-muted); font-size: 13px; margin-top: 3px; }
.analytics-subject { display: grid; align-content: start; gap: 3px; max-width: 46%; padding: 9px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); font-size: 12px; }
.analytics-subject > span:first-child { color: var(--color-faint); font-size: 11px; }
.analytics-subject b { font-family: var(--font-mono); color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.analytics-subject a, .original-url { color: var(--color-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.range-control { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; margin-bottom: 14px; min-width: 0; }
.range-control button { border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 5px 9px; background: var(--color-surface-alt); color: var(--color-muted); cursor: pointer; font: inherit; font-size: 12px; }
.range-control button.active { background: var(--color-accent-soft); border-color: var(--color-accent); color: var(--color-text); font-weight: 600; }
.range-control > span { color: var(--color-muted); font-size: 11px; margin-left: 5px; }
.analytics-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.kpi, .analytics-card, .recent-card { min-width: 0; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.kpi { padding: 12px 13px; }
.kpi span, .kpi small { display: block; color: var(--color-muted); font-size: 11px; }
.kpi b { display: block; margin: 3px 0; color: var(--color-text); font-size: 23px; font-variant-numeric: tabular-nums; }
.analytics-charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; min-width: 0; }
.analytics-card > header, .recent-card > header { display: flex; justify-content: space-between; gap: 8px; padding: 11px 14px 0; font-size: 12.5px; }
.analytics-card > header span, .recent-card > header span { color: var(--color-muted); font-size: 11px; white-space: nowrap; }
.chart-wide { grid-column: span 2; }
.recent-card { margin-top: 12px; overflow: hidden; }
.recent-scroll { overflow-x: auto; }
table { width: 100%; min-width: 440px; border-collapse: collapse; font-size: 12px; }
th, td { padding: 9px 14px; border-top: 1px solid var(--color-border); text-align: left; white-space: nowrap; }
th { background: var(--color-surface-alt); color: var(--color-faint); font-size: 11px; }
td { color: var(--color-muted); }
.recent-empty { padding: 28px 14px; color: var(--color-muted); text-align: center; font-size: 12px; }
.analytics-state { display: grid; justify-items: start; gap: 6px; padding: 16px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface-alt); color: var(--color-muted); }
.analytics-state b { color: var(--color-text); }
.analytics-state[data-state="error"] { border-color: color-mix(in srgb, var(--color-danger) 35%, var(--color-border)); background: var(--color-danger-soft); }
.analytics-state svg { width: 22px; fill: none; stroke: currentColor; stroke-width: 1.5; }
@media (max-width: 720px) {
  .analytics-head { display: grid; }
  .analytics-subject { max-width: none; }
  .analytics-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .analytics-charts { grid-template-columns: minmax(0, 1fr); }
  .chart-wide { grid-column: auto; }
}
</style>
