<template>
  <div class="toolbar">
    <div class="search">
      <svg class="si" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <circle cx="7" cy="7" r="4.3" />
        <path d="m10.5 10.5 3 3" />
      </svg>
      <input
        :value="search"
        type="search"
        aria-label="搜尋目前頁面的短代碼、原始網址或標題"
        placeholder="搜尋目前頁面的短代碼、原始網址或標題…"
        autocomplete="off"
        @input="emit('update:search', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="tabs" role="tablist" aria-label="依點擊數排序（僅套用於目前頁面）">
      <button
        v-for="option in sortOptions"
        :key="option.value"
        type="button"
        class="tab"
        data-testid="sort-option"
        :class="{ 'is-active': sort === option.value }"
        role="tab"
        :aria-selected="sort === option.value"
        @click="emit('update:sort', option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <div class="tabs" role="tablist" aria-label="狀態篩選（僅套用於目前頁面）">
      <button
        v-for="tab in statusTabs"
        :key="tab.value"
        type="button"
        class="tab"
        :class="{ 'is-active': status === tab.value }"
        role="tab"
        :aria-selected="status === tab.value"
        @click="emit('update:status', tab.value)"
      >
        {{ tab.label }}<span class="cnt">{{ counts[tab.value] }}</span>
      </button>
    </div>
  </div>
  <p class="toolbar-scope">
    搜尋、狀態篩選與排序僅套用於目前頁面已載入的 {{ counts.all }} 筆連結。<template v-if="counts.expired > 0">其中 {{ counts.expired }} 筆已過期，只會出現在「全部」。</template>
  </p>
</template>

<script setup lang="ts">
/**
 * Dashboard list toolbar: search, status tabs, and a click-count sort toggle.
 *
 * All three controls act ONLY on the URLs already loaded for the current
 * server-side page (`urlStore.urls`) - the list API only supports
 * `page`/`limit` today, so a global/account-wide query is out of scope and
 * would be a dishonest UX if implied. The default sort ('default') keeps the
 * store's own ordering, which is what guarantees a freshly created URL shows
 * up first (see `useUrlStore.createUrl`'s prepend).
 *
 * The status tabs mirror `getLinkStatus`: an expired-but-unarchived link is
 * neither 使用中 nor 已封存, so the scope line calls out where it went.
 */
import type { StatusFilter, SortOption, StatusCounts } from './dashboardUrlList';

defineProps<{
  search: string;
  status: StatusFilter;
  sort: SortOption;
  counts: StatusCounts;
}>();

const emit = defineEmits<{
  'update:search': [value: string];
  'update:status': [value: StatusFilter];
  'update:sort': [value: SortOption];
}>();

const statusTabs: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '使用中' },
  { value: 'archived', label: '已封存' }
];

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'default', label: '預設' },
  { value: 'clicks-desc', label: '點擊數 高→低' },
  { value: 'clicks-asc', label: '點擊數 低→高' }
];
</script>
