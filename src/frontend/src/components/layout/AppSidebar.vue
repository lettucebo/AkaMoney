<template>
  <aside class="sidebar" aria-label="主要側邊欄">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">A</span>
      <span class="brand-name">{{ appName }}</span>
      <span class="topbar-spacer" />
      <button
        type="button"
        class="icon-btn"
        data-testid="sidebar-collapse"
        :aria-label="collapsed ? '展開側欄' : '收合側欄'"
        :title="collapsed ? '展開側欄' : '收合側欄'"
        :aria-pressed="collapsed ? 'true' : 'false'"
        @click="emit('toggle-collapsed')"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 3h10v10H3z" />
          <path d="M6 3v10" />
        </svg>
      </button>
    </div>

    <nav class="nav" aria-label="主要導覽">
      <span class="nav-label">工作區</span>
      <router-link class="nav-item" active-class="is-active" to="/dashboard">
        <svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
          <rect x="2" y="2" width="5" height="5" rx="1" />
          <rect x="9" y="2" width="5" height="5" rx="1" />
          <rect x="2" y="9" width="5" height="5" rx="1" />
          <rect x="9" y="9" width="5" height="5" rx="1" />
        </svg>
        <span class="lbl">連結</span>
      </router-link>
      <router-link class="nav-item" active-class="is-active" to="/stats">
        <svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
          <rect x="2.2" y="8" width="3" height="6" rx="1" />
          <rect x="6.5" y="4.5" width="3" height="9.5" rx="1" />
          <rect x="10.8" y="6.5" width="3" height="7.5" rx="1" />
        </svg>
        <span class="lbl">總覽統計</span>
      </router-link>
    </nav>

    <div class="sidebar-foot">
      <div class="who">
        <span class="who-avatar" aria-hidden="true">{{ initial }}</span>
        <span class="who-meta">
          <b>{{ authStore.userName }}</b>
          <span>{{ authStore.userEmail }}</span>
        </span>
      </div>
      <button
        type="button"
        class="icon-btn"
        data-testid="theme-toggle"
        :aria-label="themeStore.isDark ? '切換為淺色布景' : '切換為深色布景'"
        :title="themeStore.isDark ? '切換為淺色布景' : '切換為深色布景'"
        @click="themeStore.toggleTheme()"
      >
        <svg
          v-if="themeStore.toggleIcon === 'sun'"
          data-icon="sun"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
        >
          <circle cx="8" cy="8" r="3.2" />
          <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M13 3l-1.1 1.1M4.1 11.9 3 13" />
        </svg>
        <svg v-else data-icon="moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
          <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8 5.6 5.6 0 1 0 13.2 9.6Z" />
        </svg>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';

defineProps<{ collapsed: boolean }>();

const emit = defineEmits<{ 'toggle-collapsed': [] }>();

const appName = import.meta.env.VITE_APP_NAME || 'AkaMoney';
const authStore = useAuthStore();
const themeStore = useThemeStore();

const initial = computed(() => authStore.userName.trim().charAt(0).toUpperCase() || 'A');
</script>
