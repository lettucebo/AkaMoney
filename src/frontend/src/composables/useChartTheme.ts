import { computed } from 'vue';
import type { ComputedRef } from 'vue';
import { useThemeStore } from '@/stores/theme';

/**
 * Categorical palette shared by every chart, taken from the Proposal F manifest
 * (design-mockups/proposals/m2-mone-dense.manifest.json). It is intentionally
 * identical in both themes so a series keeps its colour when the theme flips.
 */
export const CHART_SERIES = [
  '#e07a5f',
  '#81b29a',
  '#f2cc8f',
  '#3d405b',
  '#6d597a',
  '#b56576',
  '#355070',
  '#eaac8b',
  '#9a9590'
] as const;

export interface ChartTheme {
  series: string[];
  text: string;
  muted: string;
  grid: string;
  surface: string;
  tooltipBg: string;
  tooltipFg: string;
  /** Hex alpha suffix appended to the line colour for area fills. */
  fillAlpha: string;
}

const LIGHT_THEME: Omit<ChartTheme, 'series'> = {
  text: '#3d3a36',
  muted: '#9a9590',
  grid: '#e8e6e3',
  surface: '#ffffff',
  tooltipBg: '#3d3a36',
  tooltipFg: '#faf8f5',
  fillAlpha: '22'
};

const DARK_THEME: Omit<ChartTheme, 'series'> = {
  text: '#e8e6e3',
  muted: '#666666',
  grid: '#2a2a2c',
  surface: '#141416',
  tooltipBg: '#e8e6e3',
  tooltipFg: '#0a0a0b',
  fillAlpha: '33'
};

/**
 * Resolves Chart.js colours for the active theme.
 *
 * Chart.js paints to a canvas and cannot read CSS custom properties, so the token
 * values are mirrored here and kept in sync with assets/css/main.css.
 */
export function useChartTheme(): ComputedRef<ChartTheme> {
  const themeStore = useThemeStore();

  return computed(() => ({
    series: [...CHART_SERIES],
    ...(themeStore.isDark ? DARK_THEME : LIGHT_THEME)
  }));
}
