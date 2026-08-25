<template>
  <nav v-if="totalPages > 1" class="pagination" aria-label="分頁">
    <span class="pinfo">第 {{ page }} / {{ totalPages }} 頁・共 {{ formatNumber(total) }} 筆</span>
    <span class="grow" />
    <BaseButton size="sm" variant="ghost" :disabled="page <= 1" @click="emit('change', page - 1)">上一頁</BaseButton>
    <BaseButton size="sm" variant="ghost" :disabled="page >= totalPages" @click="emit('change', page + 1)">下一頁</BaseButton>
  </nav>
</template>

<script setup lang="ts">
/**
 * Thin wrapper around the authoritative server-side pagination
 * `useUrlStore` already tracks (`pagination.page/limit/total/total_pages`).
 * Unaffected by the current-page-only search/status/sort toolbar.
 */
import { formatNumber } from '@/utils/format';
import BaseButton from '@/components/common/BaseButton.vue';

defineProps<{
  page: number;
  totalPages: number;
  total: number;
}>();

const emit = defineEmits<{ change: [page: number] }>();
</script>
