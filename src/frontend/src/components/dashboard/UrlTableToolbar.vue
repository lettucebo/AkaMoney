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
        aria-label="搜尋短代碼、原始網址或標題"
        placeholder="搜尋短代碼、原始網址或標題…"
        autocomplete="off"
        data-testid="search-input"
        @input="emit('update:search', ($event.target as HTMLInputElement).value)"
      />
      <span v-if="busy" class="search-busy" role="status" aria-live="polite">搜尋中…</span>
    </div>

    <div class="sort-field">
      <label class="sort-label" for="url-sort">排序</label>
      <select
        id="url-sort"
        class="sort-select"
        data-testid="sort-select"
        :value="sort"
        @change="emit('update:sort', ($event.target as HTMLSelectElement).value as SortOption)"
      >
        <option v-for="option in sortOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <div class="tabs" role="tablist" aria-label="狀態篩選">
      <button
        v-for="tab in statusTabs"
        :key="tab.value"
        type="button"
        class="tab"
        data-testid="status-tab"
        :class="{ 'is-active': status === tab.value }"
        role="tab"
        :aria-selected="status === tab.value"
        @click="emit('update:status', tab.value)"
      >
        {{ tab.label }}<span class="cnt">{{ formatNumber(counts[tab.value]) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Dashboard list toolbar: search, status tabs, and a sort selector.
 *
 * All three controls are account-wide: they are sent to `GET /api/urls` as
 * `search`/`status`/`sort`, and the server decides which rows, in which order,
 * belong on the requested page. The counts come from the same response and
 * cover the whole account for the current search term, so every tab shows a
 * real total rather than whatever happened to be on the current page.
 *
 * The status tabs mirror `getLinkStatus`, which is why 已過期 is its own tab:
 * an expired-but-unarchived link is neither 使用中 nor 已封存.
 *
 * Sort is a `<select>` rather than another tab strip because five sort options
 * plus four status tabs plus the search box will not fit on one row.
 */
import type { UrlListSort, UrlListStatus, UrlStatusCounts } from '@/types';
import { formatNumber } from '@/utils/format';

type StatusFilter = UrlListStatus;
type SortOption = UrlListSort;

defineProps<{
  search: string;
  status: StatusFilter;
  sort: SortOption;
  counts: UrlStatusCounts;
  /** A list request is in flight while rows are already on screen. */
  busy?: boolean;
}>();

const emit = defineEmits<{
  'update:search': [value: string];
  'update:status': [value: StatusFilter];
  'update:sort': [value: SortOption];
}>();

const statusTabs: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '使用中' },
  { value: 'expired', label: '已過期' },
  { value: 'archived', label: '已封存' }
];

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'default', label: '最新建立' },
  { value: 'created-asc', label: '最早建立' },
  { value: 'updated-desc', label: '最近更新' },
  { value: 'clicks-desc', label: '點擊數 高→低' },
  { value: 'clicks-asc', label: '點擊數 低→高' }
];
</script>
