import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useThemeStore } from '@/stores/theme';
import { useChartTheme, CHART_SERIES } from '../useChartTheme';

describe('useChartTheme', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('exposes the proposal chart palette', () => {
    const theme = useChartTheme();

    expect(CHART_SERIES).toEqual([
      '#e07a5f',
      '#81b29a',
      '#f2cc8f',
      '#3d405b',
      '#6d597a',
      '#b56576',
      '#355070',
      '#eaac8b',
      '#9a9590'
    ]);
    expect(theme.value.series).toEqual(CHART_SERIES);
  });

  it('uses the light token set by default', () => {
    const theme = useChartTheme();

    expect(theme.value.text).toBe('#3d3a36');
    expect(theme.value.muted).toBe('#9a9590');
    expect(theme.value.grid).toBe('#e8e6e3');
    expect(theme.value.surface).toBe('#ffffff');
    expect(theme.value.tooltipBg).toBe('#3d3a36');
    expect(theme.value.tooltipFg).toBe('#faf8f5');
    expect(theme.value.fillAlpha).toBe('22');
  });

  it('switches to the dark token set when the theme store flips', () => {
    const themeStore = useThemeStore();
    const theme = useChartTheme();

    themeStore.setTheme('dark', false);

    expect(theme.value.text).toBe('#e8e6e3');
    expect(theme.value.muted).toBe('#666666');
    expect(theme.value.grid).toBe('#2a2a2c');
    expect(theme.value.surface).toBe('#141416');
    expect(theme.value.tooltipBg).toBe('#e8e6e3');
    expect(theme.value.tooltipFg).toBe('#0a0a0b');
    expect(theme.value.fillAlpha).toBe('33');
  });

  it('keeps the same palette across both themes', () => {
    const themeStore = useThemeStore();
    const theme = useChartTheme();
    const lightSeries = theme.value.series;

    themeStore.setTheme('dark', false);

    expect(theme.value.series).toEqual(lightSeries);
  });
});
