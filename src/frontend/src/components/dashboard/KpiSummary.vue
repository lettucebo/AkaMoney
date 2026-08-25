<template>
  <div class="kpi-summary">
    <StateBlock v-if="loading" state="loading" message="載入近 30 天摘要中…" />
    <StateBlock v-else-if="error" state="error" title="無法載入摘要" :message="error">
      <template #action>
        <BaseButton size="sm" @click="emit('retry')">重試</BaseButton>
      </template>
    </StateBlock>
    <div v-else class="kpis">
      <div v-for="card in cards" :key="card.key" class="kpi">
        <div class="k">{{ card.label }}</div>
        <div class="v">{{ card.value }}</div>
        <div v-if="card.detail" class="d" :class="card.tone === 'neutral' ? null : card.tone">{{ card.detail }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Dashboard KPI summary — independent of the URL list's own loading/error
 * state (see DashboardView.vue, which fetches this via a separate rolling
 * 30-day `getOverallStats` call so a KPI failure never blocks the list).
 */
import { toRef } from 'vue';
import type { OverallStatsResponse } from '@/types';
import { useKpiSummary } from '@/composables/useKpiSummary';
import StateBlock from '@/components/common/StateBlock.vue';
import BaseButton from '@/components/common/BaseButton.vue';

const props = defineProps<{
  stats: OverallStatsResponse | null;
  loading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ retry: [] }>();

const cards = useKpiSummary(toRef(props, 'stats'));
</script>
