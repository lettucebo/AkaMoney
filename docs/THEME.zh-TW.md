# 主題系統技術文件 (Theme System Technical Documentation)

## 概述 (Overview)

AkaMoney 使用 Bootstrap 5 的內建暗色主題支援，搭配 Vue 3 的 Pinia 狀態管理來實現亮暗色主題切換功能。

## 架構 (Architecture)

### 核心元件 (Core Components)

1. **Theme Store** (`src/stores/theme.ts`)
   - 管理主題狀態 (light/dark)
   - 處理 localStorage 持久化
   - 監聽系統偏好設定變更
   - 提供 `toggleTheme()` 方法切換主題

2. **CSS 變數** (`src/assets/css/main.css`)
   - 定義自訂 CSS 變數支援主題
   - 使用 `[data-bs-theme="dark"]` 選擇器定義暗色主題樣式

3. **主題切換按鈕** (`src/App.vue`)
   - 位於導覽列中
   - 顯示月亮/太陽圖示
   - 點擊即可切換主題

## 運作原理 (How It Works)

### 主題初始化流程

```
1. main.ts 初始化 Pinia store
2. themeStore.initialize() 被呼叫
3. 檢查 localStorage 是否有儲存的偏好
4. 若無，則偵測系統 prefers-color-scheme
5. 設定 document.documentElement 的 data-bs-theme 屬性
6. 設定系統偏好變更監聽器
```

### Bootstrap 5 暗色模式

Bootstrap 5 使用 `data-bs-theme` 屬性來控制主題：

```html
<!-- 亮色主題 -->
<html data-bs-theme="light">

<!-- 暗色主題 -->
<html data-bs-theme="dark">
```

當設定此屬性時，Bootstrap 會自動調整所有元件的樣式。

## 自訂配色 (Customizing Colors)

### 修改主色調

編輯 `src/assets/css/main.css` 中的 CSS 變數：

```css
:root {
  /* 主要品牌色彩 */
  --bs-primary: #0d6efd;    /* 修改此值更換主色 */
  --bs-secondary: #6c757d;
  --bs-success: #198754;
  --bs-danger: #dc3545;
  --bs-warning: #ffc107;
  --bs-info: #0dcaf0;
}
```

### 暗色主題專用樣式

使用 `[data-bs-theme="dark"]` 選擇器：

```css
[data-bs-theme="dark"] {
  --app-shadow-color: rgba(0, 0, 0, 0.4);
  /* 新增暗色主題專用變數 */
}
```

## API 參考 (API Reference)

### useThemeStore()

```typescript
import { useThemeStore } from '@/stores/theme';

const themeStore = useThemeStore();

// 屬性
themeStore.theme        // 'light' | 'dark'
themeStore.initialized  // boolean
themeStore.isDark       // boolean (getter)
themeStore.toggleIcon   // string (getter) - Bootstrap icon class

// 方法
themeStore.initialize()           // 初始化主題 (main.ts 自動呼叫)
themeStore.setTheme('dark')       // 設定主題並儲存
themeStore.setTheme('light', false) // 設定主題但不儲存
themeStore.toggleTheme()          // 切換主題
```

## localStorage

主題偏好儲存在 localStorage 的 `akamoney-theme` 鍵值：

```javascript
localStorage.getItem('akamoney-theme')  // 'light' | 'dark' | null
```

## 平滑過渡 (Smooth Transitions)

CSS 過渡效果定義於 `App.vue`，並僅套用在主要的 Bootstrap 元件上以避免影響效能：

```css
html {
  transition: background-color 0.3s ease, color 0.3s ease;
}

/* 限制過渡效果於特定元素以提升效能 */
.card,
.modal,
.dropdown-menu,
.navbar,
.btn,
.form-control,
.form-select,
.alert,
.badge,
.list-group-item,
.table,
.progress,
.footer {
  transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}
```

## 新增元件主題支援 (Adding Theme Support to New Components)

1. **使用 Bootstrap 的主題感知類別**：
   - `text-body` 取代 `text-dark`
   - `text-body-secondary` 取代 `text-muted`
   - `bg-body` 取代 `bg-white`
   - `bg-body-secondary` 取代 `bg-light`
   - `border-body` 取代固定邊框色

2. **避免硬編碼顏色**：
   ```css
   /* ❌ 避免 */
   .my-element { background-color: #ffffff; }
   
   /* ✅ 使用 Bootstrap 變數 */
   .my-element { background-color: var(--bs-body-bg); }
   ```

3. **暗色主題專用樣式**：
   ```css
   [data-bs-theme="dark"] .my-element {
     /* 暗色主題樣式 */
   }
   ```

## 測試 (Testing)

主題 store 的單元測試位於：
`src/stores/__tests__/theme.test.ts`

執行測試：
```bash
cd src/frontend
npm run test
```

## 未來擴展 (Future Extensions)

### 使用者個人檔案儲存

若要將主題設定儲存至使用者帳戶：

1. 在後端 API 新增 user preferences endpoint
2. 修改 `theme.ts` 在使用者登入後同步設定：

```typescript
// 範例實作
async syncWithUserProfile() {
  if (authStore.isAuthenticated) {
    const userPrefs = await api.getUserPreferences();
    if (userPrefs.theme) {
      this.setTheme(userPrefs.theme, true);
    }
  }
}
```

### 自訂配色方案

可擴展支援多種配色主題：

```typescript
type ColorScheme = 'default' | 'blue' | 'green' | 'purple';

// 在 CSS 中定義各配色方案的變數
[data-color-scheme="blue"] {
  --bs-primary: #0ea5e9;
}
```
