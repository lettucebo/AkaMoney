[English](THEME.md) | 繁體中文

# 主題系統

AkaMoney 管理後台使用 Tailwind CSS v4 的 CSS-first 設定、Monē 設計代幣，以及會把 `data-theme` 寫到 `<html>` 的 Pinia store。Bootstrap 與 `data-bs-theme` 不是這套系統的一部分。

## 範圍

本文件描述 `src/frontend/` 已上線的 Vue 管理台。`docs/design-mockups/` 裡的提案 HTML 是視覺祖先，不是執行期樣式表。

## Tailwind CSS v4（CSS-first）

沒有 `tailwind.config.js`。代幣與深色 variant 都寫在 CSS。Vite 透過 `src/frontend/vite.config.ts` 的 `@tailwindcss/vite` 載入 Tailwind。

權威樣式表：[`src/frontend/src/assets/css/main.css`](../src/frontend/src/assets/css/main.css)。

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

`@theme` 把代幣暴露成 Tailwind theme 值。同檔的元件 CSS 仍讀取 `var(--color-*)`，因此 `:root[data-theme="dark"]` 的覆寫不必再寫第二份 Tailwind 設定。

## 設計代幣

### 單一來源

`main.css` 是執行期的單一來源。它衍生自提案 **`m2-mone-dense`**（亦稱 Proposal F / Monē 高密度資料工具）：

- [`docs/design-mockups/proposals/m2-mone-dense.manifest.json`](design-mockups/proposals/m2-mone-dense.manifest.json)
- [`docs/design-mockups/proposals/m2-mone-dense.html`](design-mockups/proposals/m2-mone-dense.html)

此處不複製完整代幣清單。需要精確值時，請讀 `main.css` 的 `@theme`、`:root` 與 `:root[data-theme="dark"]`。

### 淺色與深色數值

| 角色 | 淺色 | 深色 |
|------|------|------|
| 頁面背景 | `#faf8f5` | `#0a0a0b` |
| 表面 | `#ffffff` | `#141416` |
| 次表面 | `#f0eeeb` | `#1a1a1c` |
| 文字 | `#3d3a36` | `#e8e6e3` |
| 次要文字 | `#9a9590` | `#666666` |
| 邊框 | `#e8e6e3` | `#2a2a2c` |
| 強調／成功 | `#81b29a` | `#4ade80` |
| 警告 | `#f2cc8f` | `#ffe66d` |
| 危險 | `#e07a5f` | `#ff6b6b` |

圖表系列色（兩種布景相同）：`#e07a5f`、`#81b29a`、`#f2cc8f`、`#3d405b`、`#6d597a`、`#b56576`、`#355070`、`#eaac8b`、`#9a9590`。

`:root` 其他版面代幣：`--sidebar-w: 236px`（收合後為 `64px`），`--radius-sm/md/lg/xl` = `3px` / `5px` / `8px` / `12px`，基準字級 `14px`。

### 字型堆疊

由 [`src/frontend/index.html`](../src/frontend/index.html) 自 Google Fonts 載入，再對應 `--font-display`、`--font-sans`、`--font-mono`：

- 展示／標題：Libre Baskerville、Noto Serif TC、serif
- 內文：Noto Sans TC、system-ui、Microsoft JhengHei、PingFang TC、sans-serif
- 等寬（短代碼、前綴）：JetBrains Mono、Noto Sans TC、monospace

`h1`–`h3` 使用展示堆疊；`body` 使用無襯線堆疊。

## 執行期主題切換

### 初始化

[`src/frontend/src/main.ts`](../src/frontend/src/main.ts) 建立 Pinia 後、在 `app.mount('#app')` **之前**呼叫 `useThemeStore().initialize()`，讓第一次繪製就帶有 `data-theme`。

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

### 持久化與系統偏好

Store：[`src/frontend/src/stores/theme.ts`](../src/frontend/src/stores/theme.ts)。

```javascript
localStorage.getItem('akamoney-theme') // 'light' | 'dark' | null
```

- `setTheme(theme, persist = true)` 寫入屬性；`persist` 為 true 時一併寫入 `akamoney-theme`。
- `toggleTheme()` 一律持久化。
- 作業系統 `change` 事件呼叫 `setTheme(..., false)`，因此已儲存的手動選擇不會被覆蓋。

### 語意化切換圖示

`toggleIcon` 表示**切換後**的目標外觀，不是目前布景：

- 深色主題 → `'sun'`（切換到淺色）
- 淺色主題 → `'moon'`（切換到深色）

控制項在 [`AppSidebar.vue`](../src/frontend/src/components/layout/AppSidebar.vue)（`data-testid="theme-toggle"`），以行內 SVG 繪製 `data-icon="sun"` / `data-icon="moon"`。不是 Bootstrap icon class。

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

## Chart.js 色盤

### 為何要鏡像代幣

Chart.js 畫在 `<canvas>` 上，讀不到 CSS 自訂屬性。因此 [`useChartTheme.ts`](../src/frontend/src/composables/useChartTheme.ts) 必須鏡像 `main.css` / `m2-mone-dense` manifest 的相同 hex 值。

```typescript
export const CHART_SERIES = [
  '#e07a5f', '#81b29a', '#f2cc8f', '#3d405b',
  '#6d597a', '#b56576', '#355070', '#eaac8b', '#9a9590'
] as const;
```

系列色在淺／深色**完全相同**，布景翻轉時同一個類別仍保持顏色。畫布鉻件（軸文字、格線、tooltip、表面、面積 `fillAlpha` `22` / `33`）則隨 `themeStore.isDark` 切換。

### 重繪與競態防護

[`BaseChart.vue`](../src/frontend/src/components/common/BaseChart.vue) 監看 `type`、`labels`、`values` 與計算後的圖表主題，再重建 Chart.js 實例。

`renderChart` 是非同步的（碰 canvas 前會 `await nextTick()`）。單調遞增的 `renderGeneration` 讓過期的繪製在 props／主題變更或元件卸載時變成 no-op，避免同一塊 canvas 上出現第二個 `Chart`。空資料或全為零時改顯示空狀態，不建立圖表。

支援類型：`line`、`bar`、`doughnut`。`prefers-reduced-motion: reduce` 會關閉 Chart.js 動畫（duration `0`）；`main.css` 也在同一媒體查詢下全域收斂 CSS transition。

## 元件慣例

1. 使用語意代幣（`var(--color-text)`、`var(--color-accent)` …），不要硬編碼 hex；唯一例外是 `useChartTheme`，因為 canvas 看不到 CSS 變數。
2. 優先使用 `main.css` `@layer components` 的 class：`.btn` / `.btn.primary|.ghost|.danger|.sm`、`.icon-btn`、`.badge.on|.off|.exp`、`.kpi`、`.table` / `.row`、`.state`、`.card`、`.modal-scrim` / `.modal-panel`。
3. Vue 封裝：`BaseButton`、`BaseBadge`、`BaseModal`、`BaseChart`、`EmptyState`、`StateBlock`。
4. 深色覆寫用 `:root[data-theme="dark"]` 或由 `@custom-variant` 接上的 Tailwind `dark:`。不要使用 `data-bs-theme` 或 Bootstrap utility。
5. Shell 斷點：`@media (max-width: 860px)` 把側欄改成抽屜。

## 測試

| 範圍 | 檔案 |
|------|------|
| Theme store | `src/frontend/src/stores/__tests__/theme.test.ts` |
| 圖表代幣 | `src/frontend/src/composables/__tests__/useChartTheme.test.ts` |
| 圖表競態 | `src/frontend/src/components/common/__tests__/BaseChart.renderRace.test.ts` |

```bash
cd src/frontend
npm run test
```

## 相關文件

- [README](../README.zh-TW.md)
- [專案結構](PROJECT_STRUCTURE.zh-TW.md)
- [畫面截圖](SCREENSHOTS.zh-TW.md)
- [安裝設定](SETUP.zh-TW.md)
- [API](API.zh-TW.md)
