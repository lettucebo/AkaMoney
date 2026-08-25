import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useThemeStore } from '@/stores/theme';
import BaseChart from '../BaseChart.vue';

interface FakeChartConfig {
  type: string;
  data: {
    labels: string[];
    datasets: Array<Record<string, unknown>>;
  };
  options: Record<string, unknown>;
}

const chartMock = vi.hoisted(() => {
  const configs: unknown[] = [];
  const destroy = vi.fn();
  const register = vi.fn();
  const constructor = vi.fn(function ChartStub(_canvas: unknown, config: unknown) {
    configs.push(config);
    return { destroy, update: vi.fn() };
  });
  return { configs, destroy, register, constructor };
});

vi.mock('chart.js', () => ({
  Chart: Object.assign(chartMock.constructor, { register: chartMock.register }),
  registerables: ['scale', 'controller']
}));

const configAt = (index: number): FakeChartConfig => chartMock.configs[index] as FakeChartConfig;

const mountChart = (props: Record<string, unknown> = {}) =>
  mount(BaseChart, {
    props: {
      type: 'line',
      labels: ['2024-03-01', '2024-03-02'],
      values: [3, 5],
      ariaLabel: '每日點擊趨勢',
      ...props
    }
  });

describe('BaseChart', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    chartMock.configs.length = 0;
    chartMock.constructor.mockClear();
    chartMock.destroy.mockClear();
    chartMock.register.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers the Chart.js controllers once the module is loaded', () => {
    mountChart();

    expect(chartMock.register).toHaveBeenCalled();
  });

  it('creates a chart from the supplied labels and values', async () => {
    mountChart();
    await flushPromises();

    expect(chartMock.constructor).toHaveBeenCalledTimes(1);
    expect(configAt(0).type).toBe('line');
    expect(configAt(0).data.labels).toEqual(['2024-03-01', '2024-03-02']);
    expect(configAt(0).data.datasets[0].data).toEqual([3, 5]);
  });

  it('renders an empty state instead of a canvas when every value is zero', async () => {
    const wrapper = mountChart({ values: [0, 0], emptyText: '此區間尚無點擊資料' });
    await flushPromises();

    expect(wrapper.find('canvas').exists()).toBe(false);
    expect(wrapper.get('.chart-empty').text()).toContain('此區間尚無點擊資料');
    expect(chartMock.constructor).not.toHaveBeenCalled();
  });

  it('renders an empty state when there is no data at all', async () => {
    const wrapper = mountChart({ labels: [], values: [] });
    await flushPromises();

    expect(wrapper.find('.chart-empty').exists()).toBe(true);
    expect(chartMock.constructor).not.toHaveBeenCalled();
  });

  it('rebuilds the chart when the data changes', async () => {
    const wrapper = mountChart();
    await flushPromises();

    await wrapper.setProps({ values: [9, 9], labels: ['2024-04-01', '2024-04-02'] });
    await flushPromises();

    expect(chartMock.constructor).toHaveBeenCalledTimes(2);
    expect(chartMock.destroy).toHaveBeenCalledTimes(1);
    expect(configAt(1).data.datasets[0].data).toEqual([9, 9]);
  });

  it('rebuilds the chart with dark tokens when the theme flips', async () => {
    const themeStore = useThemeStore();
    mountChart();
    await flushPromises();

    expect(configAt(0).data.datasets[0].borderColor).toBe('#e07a5f');

    themeStore.setTheme('dark', false);
    await flushPromises();

    expect(chartMock.constructor).toHaveBeenCalledTimes(2);
    expect(chartMock.destroy).toHaveBeenCalledTimes(1);
    const scales = configAt(1).options.scales as { y: { ticks: { color: string } } };
    expect(scales.y.ticks.color).toBe('#666666');
  });

  it('destroys the chart instance on unmount', async () => {
    const wrapper = mountChart();
    await flushPromises();

    wrapper.unmount();

    expect(chartMock.destroy).toHaveBeenCalledTimes(1);
  });

  it('builds a doughnut chart with a legend and no scales', async () => {
    mountChart({ type: 'doughnut', labels: ['TW', 'US'], values: [7, 3] });
    await flushPromises();

    const options = configAt(0).options as {
      cutout?: string;
      plugins: { legend: { display: boolean } };
      scales: Record<string, unknown>;
    };
    expect(configAt(0).type).toBe('doughnut');
    expect(options.cutout).toBe('62%');
    expect(options.plugins.legend.display).toBe(true);
    expect(options.scales).toEqual({});
    expect(configAt(0).data.datasets[0].backgroundColor).toEqual(
      expect.arrayContaining(['#e07a5f', '#81b29a'])
    );
  });

  it('builds a bar chart without a legend', async () => {
    mountChart({ type: 'bar', labels: ['Chrome'], values: [12] });
    await flushPromises();

    const options = configAt(0).options as { plugins: { legend: { display: boolean } } };
    expect(configAt(0).type).toBe('bar');
    expect(options.plugins.legend.display).toBe(false);
  });

  it('exposes the accessible label on the canvas', async () => {
    const wrapper = mountChart();
    await flushPromises();

    const canvas = wrapper.get('canvas');
    expect(canvas.attributes('role')).toBe('img');
    expect(canvas.attributes('aria-label')).toBe('每日點擊趨勢');
  });

  it('applies the tall modifier when requested', async () => {
    const wrapper = mountChart({ tall: true });
    await flushPromises();

    expect(wrapper.get('.chart-box').classes()).toContain('tall');
  });
});
