English | [繁體中文](THEME.zh-TW.md)

# Theme system

AkaMoney’s management dashboard uses Tailwind CSS v4 in CSS-first mode, Monē design tokens, and a Pinia store that writes `data-theme` on `<html>`. Bootstrap and `data-bs-theme` are not part of this system.

## Scope

This document describes the shipped Vue dashboard under `src/frontend/`. Design-proposal HTML in `design-mockups/` is a visual ancestor, not the runtime stylesheet.

## Tailwind CSS v4 (CSS-first)

There is no `tailwind.config.js`. Tokens and the dark variant live in CSS. Vite loads Tailwind through `@tailwindcss/vite` in `src/frontend/vite.config.ts`.

Authoritative stylesheet: [`src/frontend/src/assets/css/main.css`](../src/frontend/src/assets/css/main.css).

```css
@import "tailwindcss";

@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

@theme {
  --font-display: "Libre Baskerville", "Noto Serif TC", serif;
  --font-sans: "Noto Sans TC", system-ui, "Microsoft JhengHei", "PingFang TC", sans-serif;
  --font-mono: "JetBrains Mono", "Noto Sans TC", monospace;
  --color-bg: #faf8f5;
  --color-accent: #81b29a;
  --text-base: 14px;
}
```

`@theme` exposes the tokens as Tailwind theme values. Component CSS in the same file still reads `var(--color-*)` so light/dark overrides on `:root[data-theme="dark"]` apply without a second Tailwind config.

## Design tokens

### Source of truth

`main.css` is the runtime source of truth. It is derived from proposal **`m2-mone-dense`** (also called Proposal F / Monē dense data tool) in:

- [`design-mockups/proposals/m2-mone-dense.manifest.json`](../design-mockups/proposals/m2-mone-dense.manifest.json)
- [`design-mockups/proposals/m2-mone-dense.html`](../design-mockups/proposals/m2-mone-dense.html)

Do not copy the full token dump here. Read `@theme`, `:root`, and `:root[data-theme="dark"]` in `main.css` when a value must be exact.

### Light and dark values

| Role | Light | Dark |
|------|-------|------|
| Page background | `#faf8f5` | `#0a0a0b` |
| Surface | `#ffffff` | `#141416` |
| Surface alt | `#f0eeeb` | `#1a1a1c` |
| Text | `#3d3a36` | `#e8e6e3` |
| Muted | `#9a9590` | `#666666` |
| Border | `#e8e6e3` | `#2a2a2c` |
| Accent / success | `#81b29a` | `#4ade80` |
| Warning | `#f2cc8f` | `#ffe66d` |
| Danger | `#e07a5f` | `#ff6b6b` |

Shared (not theme-flipped) chart series: `#e07a5f`, `#81b29a`, `#f2cc8f`, `#3d405b`, `#6d597a`, `#b56576`, `#355070`, `#eaac8b`, `#9a9590`.

Other layout tokens in `:root`: `--sidebar-w: 236px` (collapsed shell uses `64px`), `--radius-sm/md/lg/xl` = `3px` / `5px` / `8px` / `12px`, base type size `14px`.

### Font stack

Loaded in [`src/frontend/index.html`](../src/frontend/index.html) from Google Fonts, then referenced by `--font-display`, `--font-sans`, and `--font-mono`:

- Display / headings: Libre Baskerville, Noto Serif TC, serif
- Body: Noto Sans TC, system-ui, Microsoft JhengHei, PingFang TC, sans-serif
- Mono (short codes, prefixes): JetBrains Mono, Noto Sans TC, monospace

`h1`–`h3` use the display stack; `body` uses the sans stack.

## Runtime theme switching

### Initialization

[`src/frontend/src/main.ts`](../src/frontend/src/main.ts) creates Pinia, then calls `useThemeStore().initialize()` **before** `app.mount('#app')` so the first paint already has `data-theme`.

```
1. Pinia starts
2. themeStore.initialize()
3. localStorage `akamoney-theme` if it is `light` or `dark`
4. otherwise prefers-color-scheme
5. document.documentElement.setAttribute('data-theme', theme)
6. always listen for OS scheme changes; the handler calls setTheme(..., false) only when no stored preference exists
```

```html
<html lang="zh-Hant-TW" data-theme="light">
<html lang="zh-Hant-TW" data-theme="dark">
```

### Persistence and system preference

Store: [`src/frontend/src/stores/theme.ts`](../src/frontend/src/stores/theme.ts).

```javascript
localStorage.getItem('akamoney-theme') // 'light' | 'dark' | null
```

- `setTheme(theme, persist = true)` writes the attribute and, when `persist` is true, `akamoney-theme`.
- `toggleTheme()` always persists.
- OS `change` events call `setTheme(..., false)` so a stored manual choice is never overwritten.

### Semantic toggle icons

`toggleIcon` is the **target** appearance, not the current theme:

- dark theme → `'sun'` (switch to light)
- light theme → `'moon'` (switch to dark)

The control lives in [`AppSidebar.vue`](../src/frontend/src/components/layout/AppSidebar.vue) (`data-testid="theme-toggle"`) and renders inline SVG with `data-icon="sun"` / `data-icon="moon"`. It is not a Bootstrap icon class.

```typescript
import { useThemeStore } from '@/stores/theme';

const themeStore = useThemeStore();
themeStore.theme        // 'light' | 'dark'
themeStore.initialized  // boolean
themeStore.isDark       // boolean
themeStore.toggleIcon   // 'sun' | 'moon'
themeStore.initialize()
themeStore.setTheme('dark')
themeStore.setTheme('light', false)
themeStore.toggleTheme()
```

## Chart.js palette

### Why tokens are mirrored

Chart.js paints to `<canvas>` and cannot read CSS custom properties. [`useChartTheme.ts`](../src/frontend/src/composables/useChartTheme.ts) therefore mirrors the same hex values as `main.css` / the `m2-mone-dense` manifest.

```typescript
export const CHART_SERIES = [
  '#e07a5f', '#81b29a', '#f2cc8f', '#3d405b',
  '#6d597a', '#b56576', '#355070', '#eaac8b', '#9a9590'
] as const;
```

The series array is **identical** in light and dark so a category keeps its colour when the theme flips. Theme-dependent canvas chrome (axis text, grid, tooltip, surface, area `fillAlpha` `22` / `33`) switches with `themeStore.isDark`.

### Rerender and race guards

[`BaseChart.vue`](../src/frontend/src/components/common/BaseChart.vue) watches `type`, `labels`, `values`, and the computed chart theme, then rebuilds the Chart.js instance.

`renderChart` is async (`await nextTick()` before touching the canvas). A monotonic `renderGeneration` makes a stale render a no-op if props/theme change or the component unmounts mid-await. That prevents a second `Chart` on the same canvas. Empty or all-zero series render the empty state instead of a chart.

Supported types: `line`, `bar`, `doughnut`. `prefers-reduced-motion: reduce` disables Chart.js animation (duration `0`); `main.css` also collapses CSS transitions globally under that media query.

## Component conventions

1. Use semantic tokens (`var(--color-text)`, `var(--color-accent)`, …), not hardcoded hex, except inside `useChartTheme` where canvas cannot see CSS variables.
2. Prefer the `@layer components` classes in `main.css`: `.btn` / `.btn.primary|.ghost|.danger|.sm`, `.icon-btn`, `.badge.on|.off|.exp`, `.kpi`, `.table` / `.row`, `.state`, `.card`, `.modal-scrim` / `.modal-panel`.
3. Vue wrappers: `BaseButton`, `BaseBadge`, `BaseModal`, `BaseChart`, `EmptyState`, `StateBlock`.
4. Select dark overrides with `:root[data-theme="dark"]` or the Tailwind `dark:` variant wired by `@custom-variant`. Never `data-bs-theme` or Bootstrap utility classes.
5. Shell breakpoint: `@media (max-width: 860px)` turns the sidebar into an off-canvas drawer.

## Tests

| Area | File |
|------|------|
| Theme store | `src/frontend/src/stores/__tests__/theme.test.ts` |
| Chart tokens | `src/frontend/src/composables/__tests__/useChartTheme.test.ts` |
| Chart race | `src/frontend/src/components/common/__tests__/BaseChart.renderRace.test.ts` |

```bash
cd src/frontend
npm run test
```

## Related documents

- [README](../README.md)
- [Project structure](PROJECT_STRUCTURE.md)
- [Screenshots](SCREENSHOTS.md)
- [Setup](SETUP.md)
- [API](API.md)
