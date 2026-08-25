<template>
  <div class="chart-box" :class="{ tall }">
    <div v-if="isEmpty" class="chart-empty">
      <svg
        class="ce-ic"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path d="M3 3v18h18" />
        <path d="M7 14l3-3 3 2 4-5" />
      </svg>
      <span>{{ emptyText }}</span>
    </div>
    <canvas v-else ref="canvasEl" role="img" :aria-label="ariaLabel" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue';
import { Chart, registerables } from 'chart.js';
import type { ChartConfiguration, ChartDataset, ChartType } from 'chart.js';
import { useChartTheme } from '@/composables/useChartTheme';

Chart.register(...registerables);

type SupportedChartType = Extract<ChartType, 'line' | 'bar' | 'doughnut'>;

const props = withDefaults(
  defineProps<{
    type?: SupportedChartType;
    labels: string[];
    values: number[];
    ariaLabel: string;
    datasetLabel?: string;
    emptyText?: string;
    tall?: boolean;
  }>(),
  {
    type: 'line',
    datasetLabel: '點擊數',
    emptyText: '此區間尚無點擊資料',
    tall: false
  }
);

const canvasEl = useTemplateRef<HTMLCanvasElement>('canvasEl');
const chart = shallowRef<Chart | null>(null);
const theme = useChartTheme();

const isEmpty = computed(
  () => props.values.length === 0 || props.values.every((value) => !Number.isFinite(value) || value === 0)
);

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const buildDataset = (): ChartDataset<SupportedChartType, number[]> => {
  const palette = theme.value.series;
  if (props.type === 'doughnut') {
    return {
      data: props.values,
      backgroundColor: palette,
      borderColor: theme.value.surface,
      borderWidth: 2,
      hoverOffset: 4
    } as ChartDataset<SupportedChartType, number[]>;
  }
  if (props.type === 'bar') {
    return {
      label: props.datasetLabel,
      data: props.values,
      backgroundColor: palette,
      borderWidth: 0,
      borderRadius: 4,
      maxBarThickness: 44
    } as ChartDataset<SupportedChartType, number[]>;
  }
  return {
    label: props.datasetLabel,
    data: props.values,
    borderColor: palette[0],
    backgroundColor: `${palette[0]}${theme.value.fillAlpha}`,
    borderWidth: 2,
    fill: true,
    tension: 0.32,
    pointRadius: 0,
    pointHoverRadius: 3
  } as ChartDataset<SupportedChartType, number[]>;
};

const buildConfig = (): ChartConfiguration<SupportedChartType, number[], string> => {
  const isDoughnut = props.type === 'doughnut';
  const tokens = theme.value;

  return {
    type: props.type,
    data: { labels: props.labels, datasets: [buildDataset()] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: prefersReducedMotion() ? false : { duration: 240 },
      cutout: isDoughnut ? '62%' : undefined,
      plugins: {
        legend: {
          display: isDoughnut,
          position: 'bottom',
          labels: { color: tokens.text, boxWidth: 8, boxHeight: 8, padding: 12, font: { size: 11 } }
        },
        tooltip: {
          backgroundColor: tokens.tooltipBg,
          titleColor: tokens.tooltipFg,
          bodyColor: tokens.tooltipFg,
          borderColor: tokens.grid,
          borderWidth: 1,
          padding: 8,
          cornerRadius: 6,
          displayColors: !isDoughnut
        }
      },
      scales: isDoughnut
        ? {}
        : {
            x: {
              ticks: { color: tokens.muted, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 },
              grid: { color: tokens.grid, drawTicks: false },
              border: { color: tokens.grid }
            },
            y: {
              beginAtZero: true,
              ticks: { color: tokens.muted, font: { size: 10 }, maxTicksLimit: 5 },
              grid: { color: tokens.grid, drawTicks: false },
              border: { color: tokens.grid }
            }
          }
    }
  } as ChartConfiguration<SupportedChartType, number[], string>;
};

const destroyChart = (): void => {
  chart.value?.destroy();
  chart.value = null;
};

// Every render carries a monotonic generation id. `renderChart` is async (it
// awaits `nextTick` before touching the canvas), so a prop/theme change - or
// unmount - that arrives while an earlier render is still awaiting must make
// that earlier render a no-op instead of letting it create a second Chart
// instance on the same canvas or run after the component is gone.
let renderGeneration = 0;

const renderChart = async (): Promise<void> => {
  const generation = ++renderGeneration;
  destroyChart();
  if (isEmpty.value) {
    return;
  }
  await nextTick();
  if (generation !== renderGeneration) {
    return;
  }
  const canvas = canvasEl.value;
  if (!canvas) {
    return;
  }
  chart.value = new Chart(canvas, buildConfig());
};

onMounted(renderChart);
onBeforeUnmount(() => {
  renderGeneration += 1;
  destroyChart();
});

watch(
  [() => props.type, () => props.labels, () => props.values, theme],
  () => {
    void renderChart();
  },
  { deep: true }
);
</script>
