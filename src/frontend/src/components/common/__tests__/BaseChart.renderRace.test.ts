import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

/**
 * BaseChart's `renderChart` is async - it awaits `nextTick()` between
 * `destroyChart()` and creating the `Chart` instance. This file isolates a
 * controllable `nextTick` (only the public export BaseChart.vue consumes;
 * Vue's own internal reactivity scheduler is untouched) so overlapping
 * renders can be resolved out of order, proving a stale/earlier render can
 * never create a second `Chart` on the same canvas after a newer render (or
 * an unmount) has already superseded it.
 */
const nextTickControl = vi.hoisted(() => {
  const pending: Array<() => void> = [];
  return {
    controlledNextTick: (): Promise<void> => new Promise<void>((resolve) => { pending.push(resolve); }),
    resolveOldest: (): void => {
      const resolve = pending.shift();
      resolve?.();
    },
    resolveNewest: (): void => {
      const resolve = pending.pop();
      resolve?.();
    },
    pendingCount: (): number => pending.length
  };
});

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>();
  return { ...actual, nextTick: nextTickControl.controlledNextTick };
});

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

import BaseChart from '../BaseChart.vue';

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

// A microtask flush that does not depend on the (mocked) `nextTick` export -
// Vue's own reactivity scheduler still uses its internal, unmocked queue.
const flushReactivity = async (): Promise<void> => {
  await flushPromises();
};

describe('BaseChart render lifecycle races', () => {
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

  it('never lets an overlapping earlier render create a second Chart once a newer render has resolved', async () => {
    const wrapper = mountChart();
    // The initial (generation 1) render is suspended awaiting nextTick.
    expect(nextTickControl.pendingCount()).toBe(1);

    // Trigger a second (generation 2) render before the first resolves.
    wrapper.setProps({ values: [9, 9] });
    await flushReactivity();
    expect(nextTickControl.pendingCount()).toBe(2);

    // Resolve the newer render first - this is the realistic race: a later
    // render can legitimately settle before an earlier one.
    nextTickControl.resolveNewest();
    await flushReactivity();
    expect(chartMock.constructor).toHaveBeenCalledTimes(1);

    // Now let the stale, superseded render resolve. It must be a no-op: no
    // second Chart instance sharing the canvas, no extra destroy either.
    nextTickControl.resolveOldest();
    await flushReactivity();

    expect(chartMock.constructor).toHaveBeenCalledTimes(1);
    expect(chartMock.destroy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('never creates a chart from a pending render that resolves after unmount', async () => {
    const wrapper = mountChart();
    expect(nextTickControl.pendingCount()).toBe(1);

    wrapper.unmount();

    // The suspended initial render now resumes post-unmount.
    nextTickControl.resolveOldest();
    await flushReactivity();

    expect(chartMock.constructor).not.toHaveBeenCalled();
  });

  it('cancels a stale render queued behind a rapid prop-then-unmount sequence', async () => {
    const wrapper = mountChart();
    expect(nextTickControl.pendingCount()).toBe(1);

    wrapper.setProps({ values: [1, 2, 3] });
    await flushReactivity();
    expect(nextTickControl.pendingCount()).toBe(2);

    wrapper.unmount();

    // Resolve both pending renders in arbitrary order after unmount - neither
    // may construct a Chart once the component generation has moved past them.
    nextTickControl.resolveNewest();
    nextTickControl.resolveOldest();
    await flushReactivity();

    expect(chartMock.constructor).not.toHaveBeenCalled();
  });
});
