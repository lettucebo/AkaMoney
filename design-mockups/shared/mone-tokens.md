# Monē 設計 Token 附錄

本附錄整理 Monē 現行設計 token，供 AkaMoney 14 份設計提案共用。所有提案都應優先忠於這些 token，而不是自行發明新的主色、圓角或節奏。**M1 與 M2 都要盡可能 faithful 地延續 Monē 調性；即使部分組合對比較低，WCAG compliance 也不是這次設計稿 bake-off 的 gate。**

## Light / Dark 色彩

| Token | Light | Dark |
| --- | --- | --- |
| `primary` | `#81b29a` | `#4ade80` |
| `primaryDark` | `#5a9a7a` | `#22c55e` |
| `primaryLight` | `#a8d4be` | `#86efac` |
| `bgPrimary` | `#faf8f5` | `#0a0a0b` |
| `bgCard` | `#ffffff` | `#141416` |
| `bgSecondary` | `#f0eeeb` | `#1a1a1c` |
| `textPrimary` | `#3d3a36` | `#e8e6e3` |
| `textSecondary` | `#9a9590` | `#666666` |
| `textTertiary` | `#b5b0ab` | `#4a4a4a` |
| `border` | `#e8e6e3` | `#2a2a2c` |
| `borderDark` | `#d4d1cd` | `#3a3a3c` |
| `borderSubtle` | `#00000008` | `#ffffff08` |
| `success` | `#81b29a` | `#4ade80` |
| `warning` | `#f2cc8f` | `#ffe66d` |
| `error` | `#e07a5f` | `#ff6b6b` |
| `info` | `#3d405b` | `#4ecdc4` |
| `successContainer` | `#e8f5e9` | `#1a3a2a` |
| `warningContainer` | `#fff8e1` | `#3a3020` |
| `errorContainer` | `#fce4de` | `#3a1a1a` |
| `infoContainer` | `#e3edf8` | `#1a2a3a` |
| `income` | `#81b29a` | `#4ade80` |
| `expense` | `#e07a5f` | `#ff6b6b` |
| `accentGreen` | `#3d8b6e` | `#4ade80` |
| `accentRed` | `#c9563c` | `#ff6b6b` |
| `accentYellow` | `#b38b2d` | `#ffe66d` |
| `accentBlue` | `#3d405b` | `#4ecdc4` |
| `logoText` | `#3d3a36` | `#ffffff` |
| `onPrimary` | `#ffffff` | `#000000` |
| `onError` | `#ffffff` | `#ffffff` |
| `shadow` | `#000000` | `#000000` |

## 圖表配色

圖表序列依順序使用以下 palette，淺色與深色共用同一組值：

1. `#e07a5f`
2. `#81b29a`
3. `#f2cc8f`
4. `#3d405b`
5. `#6d597a`
6. `#b56576`
7. `#355070`
8. `#eaac8b`
9. `#9a9590`

## Typography 家族與語義

- **Libre Baskerville**：`display`、`headline-lg`、`title`，以及金額數字。
- **Noto Sans TC**：`headline-md`、`body-lg`、`body-md`、`body-sm`、`label-md`、`label-sm`、`caption`。
- **JetBrains Mono**：`mono-data`，用於發票號、時間戳與技術型資料。

語義字級與原始值：

| Token | Family | Size | Weight | Line Height | Letter Spacing |
| --- | --- | --- | --- | --- | --- |
| `display` | Libre Baskerville | `2.5rem` | `700` | `1.1` | `-0.02em` |
| `headline-lg` | Libre Baskerville | `1.5rem` | `700` | `1.2` | — |
| `headline-md` | Noto Sans TC | `1.25rem` | `600` | `1.3` | — |
| `title` | Libre Baskerville | `1.125rem` | `700` | `1.3` | — |
| `body-lg` | Noto Sans TC | `1rem` | `400` | `1.6` | — |
| `body-md` | Noto Sans TC | `0.9375rem` | `400` | `1.6` | — |
| `body-sm` | Noto Sans TC | `0.875rem` | `400` | `1.5` | — |
| `label-md` | Noto Sans TC | `0.875rem` | `600` | `1.4` | — |
| `label-sm` | Noto Sans TC | `0.75rem` | `500` | `1.4` | — |
| `caption` | Noto Sans TC | `0.75rem` | `400` | `1.4` | — |
| `mono-data` | JetBrains Mono | `0.875rem` | `500` | `1.5` | `0.02em` |

## 圓角（Radii）

| Token | Value | 建議用途 |
| --- | --- | --- |
| `sm` | `8px` | 小元件、badge、input |
| `md` | `12px` | 按鈕、輸入框 |
| `lg` | `16px` | 卡片、面板 |
| `xl` | `20px` | 大型容器、modal |
| `full` | `9999px` | chip、pill、頭像、圓形按鈕 |

## 間距節奏（Spacing Rhythm）

Monē 採 **8px 節奏**，並用 **4px 半階**做微調：

| Token | Value |
| --- | --- |
| `xs` | `4px` |
| `sm` | `8px` |
| `md` | `12px` |
| `lg` | `16px` |
| `xl` | `20px` |
| `2xl` | `24px` |
| `3xl` | `32px` |

實作上可直接沿用：卡片常用 `24px` 內距、緊湊列表可降到 `16px`、相關元素群落差多落在 `8px` 到 `12px`。

## Tonal Layer 規則

Monē 的層次感主要來自 tonal layers，而不是厚重陰影：

1. **背景層**：`bgPrimary`（light `#faf8f5` / dark `#0a0a0b`）。
2. **次要層**：`bgSecondary`，用於區塊、輸入框、chip。
3. **卡片層**：`bgCard`（light `#ffffff` / dark `#141416`），承載主要內容。
4. **細描邊**：以 `borderSubtle`（light `#00000008` / dark `#ffffff08`）加強邊界。
5. **深色模式規則**：避免純黑背景；primary 改用 `#4ade80`；`onPrimary` 改用黑字 `#000000`；status 色略提高明度；status container 維持低明度低飽和。

## Motion Durations

- `fast`: `150ms`
- `normal`: `200ms`
- `slow`: `300ms`
- easing：全部使用 `ease`

## 對比與 faithful 原則

- Monē 官方設計文件明確指出，部分品牌組合（例如 `onPrimary` 白字配 `primary` 鼠尾草綠、以及 status 色配同名 container）**會低於 WCAG AA 4.5:1**。
- 這些低對比不是文件錯誤，而是品牌識別的既有取捨。
- 因此 **M1 / M2 設計稿要優先 faithful 延續 Monē 視覺語言**；本次 bake-off **不把 WCAG compliance 當成 gate**。
- 若需要減少可讀性風險，可優先透過更大字級、更重字重、圖示＋文字並用、或改用較深的 `accent*` token 來補強。
