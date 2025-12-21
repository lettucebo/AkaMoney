# Theme System Technical Documentation

## Overview

AkaMoney uses Bootstrap 5's built-in dark mode support combined with Vue 3's Pinia state management to implement light/dark theme switching functionality.

## Architecture

### Core Components

1. **Theme Store** (`src/stores/theme.ts`)
   - Manages theme state (light/dark)
   - Handles localStorage persistence
   - Listens for system preference changes
   - Provides `toggleTheme()` method to switch themes

2. **CSS Variables** (`src/assets/css/main.css`)
   - Defines custom CSS variables for theme support
   - Uses `[data-bs-theme="dark"]` selector for dark theme styles

3. **Theme Toggle Button** (`src/App.vue`)
   - Located in the navbar
   - Displays moon/sun icons
   - Click to toggle theme

## How It Works

### Theme Initialization Flow

```
1. main.ts initializes Pinia store
2. themeStore.initialize() is called
3. Check localStorage for saved preference
4. If none, detect system prefers-color-scheme
5. Set data-bs-theme attribute on document.documentElement
6. Set up listener for system preference changes
```

### Bootstrap 5 Dark Mode

Bootstrap 5 uses the `data-bs-theme` attribute to control themes:

```html
<!-- Light theme -->
<html data-bs-theme="light">

<!-- Dark theme -->
<html data-bs-theme="dark">
```

When this attribute is set, Bootstrap automatically adjusts all component styles.

## Customizing Colors

### Modifying Primary Colors

Edit CSS variables in `src/assets/css/main.css`:

```css
:root {
  /* Primary brand colors */
  --bs-primary: #0d6efd;    /* Change this to modify primary color */
  --bs-secondary: #6c757d;
  --bs-success: #198754;
  --bs-danger: #dc3545;
  --bs-warning: #ffc107;
  --bs-info: #0dcaf0;
}
```

### Dark Theme Specific Styles

Use the `[data-bs-theme="dark"]` selector:

```css
[data-bs-theme="dark"] {
  --app-shadow-color: rgba(0, 0, 0, 0.4);
  /* Add dark theme specific variables */
}
```

## API Reference

### useThemeStore()

```typescript
import { useThemeStore } from '@/stores/theme';

const themeStore = useThemeStore();

// Properties
themeStore.theme        // 'light' | 'dark'
themeStore.initialized  // boolean
themeStore.isDark       // boolean (getter)
themeStore.toggleIcon   // string (getter) - Bootstrap icon class

// Methods
themeStore.initialize()           // Initialize theme (called automatically in main.ts)
themeStore.setTheme('dark')       // Set theme and persist
themeStore.setTheme('light', false) // Set theme without persisting
themeStore.toggleTheme()          // Toggle between themes
```

## localStorage

Theme preference is stored in localStorage under the `akamoney-theme` key:

```javascript
localStorage.getItem('akamoney-theme')  // 'light' | 'dark' | null
```

## Smooth Transitions

CSS transition effects are defined in `App.vue`. Transitions are applied only to key Bootstrap components for better performance:

```css
html {
  transition: background-color 0.3s ease, color 0.3s ease;
}

/* Limit transitions to specific elements for better performance */
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

## Adding Theme Support to New Components

1. **Use Bootstrap's theme-aware classes**:
   - `text-body` instead of `text-dark`
   - `text-body-secondary` instead of `text-muted`
   - `bg-body` instead of `bg-white`
   - `bg-body-secondary` instead of `bg-light`
   - `border-body` instead of hardcoded border colors

2. **Avoid hardcoded colors**:
   ```css
   /* ❌ Avoid */
   .my-element { background-color: #ffffff; }
   
   /* ✅ Use Bootstrap variables */
   .my-element { background-color: var(--bs-body-bg); }
   ```

3. **Dark theme specific styles**:
   ```css
   [data-bs-theme="dark"] .my-element {
     /* Dark theme styles */
   }
   ```

## Testing

Theme store unit tests are located at:
`src/stores/__tests__/theme.test.ts`

Run tests:
```bash
cd src/frontend
npm run test
```

## Future Extensions

### User Profile Storage

To save theme settings to user account:

1. Add user preferences endpoint to backend API
2. Modify `theme.ts` to sync settings after user login:

```typescript
// Example implementation
async syncWithUserProfile() {
  if (authStore.isAuthenticated) {
    const userPrefs = await api.getUserPreferences();
    if (userPrefs.theme) {
      this.setTheme(userPrefs.theme, true);
    }
  }
}
```

### Custom Color Schemes

Can be extended to support multiple color themes:

```typescript
type ColorScheme = 'default' | 'blue' | 'green' | 'purple';

// Define variables for each color scheme in CSS
[data-color-scheme="blue"] {
  --bs-primary: #0ea5e9;
}
```
