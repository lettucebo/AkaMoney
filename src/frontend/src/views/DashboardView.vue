<template>
  <div class="dashboard-view">
    <KpiSummary :stats="kpiStats" :loading="kpiLoading" :error="kpiError" @retry="loadKpiSummary" />

    <div class="page-head">
      <div>
        <h1>連結</h1>
        <div class="sub">建立、搜尋並管理所有短網址與即時成效。</div>
      </div>
    </div>

    <UrlCreateModal :open="showCreateModal" @close="showCreateModal = false" @created="handleCreated" />

    <UrlTableToolbar
      :search="search"
      :status="statusFilter"
      :sort="sortOption"
      :counts="visibleUrls.counts"
      @update:search="search = $event"
      @update:status="statusFilter = $event"
      @update:sort="sortOption = $event"
    />

    <StateBlock v-if="urlStore.listLoading" state="loading" title="載入中" message="正在載入短網址清單…" />
    <StateBlock v-else-if="urlStore.listError" state="error" title="無法載入清單" :message="urlStore.listError" />
    <EmptyState
      v-else-if="isEmpty"
      title="尚未建立任何短網址"
      description="使用上方的建立短網址面板建立你的第一個短網址。"
    />
    <EmptyState
      v-else-if="isNoResults"
      title="目前頁面沒有符合條件的短網址"
      description="試著調整搜尋關鍵字、狀態篩選或排序（僅套用於目前頁面已載入的項目）。"
    />
    <UrlTable
      v-else
      :urls="visibleUrls.visible"
      :copied-id="copiedId"
      @copy="handleCopy"
      @edit="openEdit"
      @archive="confirmArchive"
      @restore="confirmRestore"
    />

    <DashboardPagination
      :page="urlStore.pagination.page"
      :total-pages="urlStore.pagination.total_pages"
      :total="urlStore.pagination.total"
      @change="goToPage"
    />

    <UrlEditModal :open="showEditModal" :url="editingUrl" @close="closeEdit" @saved="handleEditSaved" />

    <ConfirmActionModal
      :open="showArchiveModal"
      title="封存這個短網址？"
      description="封存後連結會停止轉址，但你可以立即還原。"
      confirm-label="確認封存"
      confirm-variant="danger"
      :loading="archiveSubmitting"
      :error="archiveError"
      @close="showArchiveModal = false"
      @confirm="handleArchiveConfirm"
    />

    <ConfirmActionModal
      :open="showRestoreModal"
      title="還原這個短網址？"
      description="還原後短網址將恢復轉址並重新開始計算點擊。"
      confirm-label="確認還原"
      :loading="restoreSubmitting"
      :error="restoreError"
      @close="showRestoreModal = false"
      @confirm="handleRestoreConfirm"
    />

    <DashboardToastStack :toasts="toasts" @dismiss="dismissToast" />
  </div>
</template>

<script setup lang="ts">
/**
 * Dashboard vertical slice (Proposal F): KPI summary -> inline quick-create
 * -> dense URL table, composed entirely from src/components/dashboard/**.
 *
 * Search/status/sort in the toolbar operate ONLY on the currently loaded
 * server page (`urlStore.urls`) - never across the full account dataset -
 * because the list API only supports `page`/`limit` pagination today. The
 * KPI summary fetch (explicit rolling 30-day window) is independent of the
 * URL list fetch, so a KPI failure never blocks the list from rendering and
 * vice versa.
 *
 * Create/edit/archive/restore keep the table stable: the store applies the
 * mutation to `urlStore.urls` directly (prepend on create, in-place replace on
 * edit/archive/restore) and uses its own `listLoading`/`listError`, so a
 * mutation never blanks the table or replaces a list error. The store only
 * falls back to a server refetch when it must - a create from page > 1, or a
 * mutation that raced an in-flight list fetch. Only the independent KPI summary
 * is re-fetched here after a mutation, since it may have changed (link counts,
 * click totals).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useUrlStore } from '@/stores/url';
import apiService from '@/services/api';
import type { OverallStatsResponse, UrlResponse } from '@/types';
import { extractErrorMessage } from '@/utils/format';
import { shortLinkTarget } from '@/utils/shortLink';
import { rollingWindow } from '@/utils/trend';
import { deriveVisibleUrls, type SortOption, type StatusFilter } from '@/components/dashboard/dashboardUrlList';
import KpiSummary from '@/components/dashboard/KpiSummary.vue';
import UrlCreateModal from '@/components/dashboard/UrlCreateModal.vue';
import UrlTableToolbar from '@/components/dashboard/UrlTableToolbar.vue';
import UrlTable from '@/components/dashboard/UrlTable.vue';
import DashboardPagination from '@/components/dashboard/DashboardPagination.vue';
import UrlEditModal from '@/components/dashboard/UrlEditModal.vue';
import ConfirmActionModal from '@/components/dashboard/ConfirmActionModal.vue';
import DashboardToastStack, { type DashboardToast } from '@/components/dashboard/DashboardToastStack.vue';
import StateBlock from '@/components/common/StateBlock.vue';
import EmptyState from '@/components/common/EmptyState.vue';

const ROLLING_WINDOW_DAYS = 30;
const COPY_FEEDBACK_DURATION = 2000;
const TOAST_DISPLAY_DURATION = 5000;

const urlStore = useUrlStore();

// --- KPI summary: independent loading/error from the URL list below. ---
const kpiStats = ref<OverallStatsResponse | null>(null);
const kpiLoading = ref(false);
const kpiError = ref<string | null>(null);

// Every KPI fetch carries a monotonic generation id. A create/edit/archive/
// restore refresh always starts a newer generation than any fetch already in
// flight, so if the mount-time (or any earlier) request resolves or rejects
// after that, its result is only ever a no-op - it can never clobber newer
// stats with stale data, nor replace a newer success with a stale error.
let kpiRequestGeneration = 0;

const loadKpiSummary = async (): Promise<void> => {
  const generation = ++kpiRequestGeneration;
  kpiLoading.value = true;
  kpiError.value = null;
  try {
    const { start, end } = rollingWindow(ROLLING_WINDOW_DAYS);
    const stats = await apiService.getOverallStats(start, end);
    if (generation !== kpiRequestGeneration) {
      return;
    }
    kpiStats.value = stats;
  } catch (err: unknown) {
    if (generation !== kpiRequestGeneration) {
      return;
    }
    kpiError.value = extractErrorMessage(err, '無法載入統計摘要');
    kpiStats.value = null;
  } finally {
    if (generation === kpiRequestGeneration) {
      kpiLoading.value = false;
    }
  }
};

// --- Current-page-only search/status/sort toolbar. ---
const search = ref('');
const statusFilter = ref<StatusFilter>('all');
const sortOption = ref<SortOption>('default');

const visibleUrls = computed(() =>
  deriveVisibleUrls(urlStore.urls, { status: statusFilter.value, search: search.value, sort: sortOption.value })
);

const isEmpty = computed(() => !urlStore.listLoading && !urlStore.listError && urlStore.urls.length === 0);
const isNoResults = computed(
  () =>
    !urlStore.listLoading &&
    !urlStore.listError &&
    urlStore.urls.length > 0 &&
    visibleUrls.value.matchingCount === 0
);

// --- Toasts. ---
const timeoutIds: number[] = [];
const scheduleTimeout = (fn: () => void, delay: number): number => {
  const id = window.setTimeout(fn, delay);
  timeoutIds.push(id);
  return id;
};

const toasts = ref<DashboardToast[]>([]);
const dismissToast = (id: string): void => {
  toasts.value = toasts.value.filter((t) => t.id !== id);
};
const pushToast = (message: string, tone: DashboardToast['tone']): void => {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  toasts.value.push({ id, message, tone });
  scheduleTimeout(() => dismissToast(id), TOAST_DISPLAY_DURATION);
};

onMounted(() => {
  // Independent fetches: neither promise rejects outward (both capture
  // their own errors), so a failure on one side never blocks the other.
  urlStore.fetchUrls();
  loadKpiSummary();
});

onBeforeUnmount(() => {
  timeoutIds.forEach((id) => window.clearTimeout(id));
});

const goToPage = (page: number): void => {
  urlStore.fetchUrls(page);
};

// --- Copy short URL. ---
const copiedId = ref<string | null>(null);
const handleCopy = async (url: UrlResponse): Promise<void> => {
  if (!navigator.clipboard) {
    pushToast('瀏覽器不支援剪貼簿功能，請手動複製網址。', 'err');
    return;
  }
  try {
    // Built from `short_code`, not the API's `short_url` - the Admin API returns
    // the bare short code there (see UrlTable.vue for the full explanation).
    await navigator.clipboard.writeText(shortLinkTarget(url.short_code));
    copiedId.value = url.id;
    scheduleTimeout(() => {
      if (copiedId.value === url.id) {
        copiedId.value = null;
      }
    }, COPY_FEEDBACK_DURATION);
  } catch {
    pushToast('複製失敗，請手動複製網址。', 'err');
  }
};

// --- Create. ---
const showCreateModal = ref(true);
const handleCreated = (url: UrlResponse): void => {
  pushToast(`已建立短網址：${url.short_code}`, 'ok');
  loadKpiSummary();
};

// --- Edit. ---
const showEditModal = ref(false);
const editingUrl = ref<UrlResponse | null>(null);
const openEdit = (url: UrlResponse): void => {
  editingUrl.value = url;
  showEditModal.value = true;
};
const closeEdit = (): void => {
  showEditModal.value = false;
};
const handleEditSaved = (url: UrlResponse): void => {
  pushToast(`已更新短網址：${url.short_code}`, 'ok');
  loadKpiSummary();
};

// --- Archive. ---
const showArchiveModal = ref(false);
const archiveTarget = ref<UrlResponse | null>(null);
const archiveSubmitting = ref(false);
const archiveError = ref<string | null>(null);
const confirmArchive = (url: UrlResponse): void => {
  archiveTarget.value = url;
  archiveError.value = null;
  showArchiveModal.value = true;
};
const handleArchiveConfirm = async (): Promise<void> => {
  if (!archiveTarget.value) {
    return;
  }
  archiveSubmitting.value = true;
  archiveError.value = null;
  try {
    const url = await urlStore.archiveUrl(archiveTarget.value.id);
    showArchiveModal.value = false;
    pushToast(`已封存短網址：${url.short_code}`, 'ok');
    loadKpiSummary();
  } catch (err: unknown) {
    archiveError.value = extractErrorMessage(err, '封存失敗');
  } finally {
    archiveSubmitting.value = false;
  }
};

// --- Restore. ---
const showRestoreModal = ref(false);
const restoreTarget = ref<UrlResponse | null>(null);
const restoreSubmitting = ref(false);
const restoreError = ref<string | null>(null);
const confirmRestore = (url: UrlResponse): void => {
  restoreTarget.value = url;
  restoreError.value = null;
  showRestoreModal.value = true;
};
const handleRestoreConfirm = async (): Promise<void> => {
  if (!restoreTarget.value) {
    return;
  }
  restoreSubmitting.value = true;
  restoreError.value = null;
  try {
    const url = await urlStore.restoreUrl(restoreTarget.value.id);
    showRestoreModal.value = false;
    pushToast(`已還原短網址：${url.short_code}`, 'ok');
    loadKpiSummary();
  } catch (err: unknown) {
    restoreError.value = extractErrorMessage(err, '還原失敗');
  } finally {
    restoreSubmitting.value = false;
  }
};
</script>
